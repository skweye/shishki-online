import { DurableObject } from 'cloudflare:workers';
import { validVariant } from '../public/game.js';

export const SEARCH_LEASE = 45000;
export const PRESENCE_LEASE = 60000;
const RECEIPT_TTL = 10 * 60 * 1000;
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const json = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
const identityOf = request => request.headers.has('X-Auth-User') ? JSON.parse(decodeURIComponent(request.headers.get('X-Auth-User'))) : null;
const cosmeticIdentity = identity => identity ? Object.fromEntries(['id','name','pieceSkin','cueSkin','shipSkin','cardSkin','finishEffect','victoryEffect'].map(key=>[key,identity[key]])) : null;

// One coordinator serializes queue/cancel/pair operations. Room creation is
// idempotent and reservations are persisted before the cross-object call.
export class Matchmaker extends DurableObject {
  async entries(now = Date.now()) {
    const rows = await this.ctx.storage.list({prefix:'entry:'});
    const expired = [];
    for(const [key,entry] of rows) if(entry.expiresAt <= now){expired.push(key);rows.delete(key);}
    if(expired.length) await this.ctx.storage.delete(expired);
    return rows;
  }
  async presenceRows(now = Date.now()) {
    const rows=await this.ctx.storage.list({prefix:'presence:'}),expired=[];
    for(const [key,expiry] of rows)if(expiry<=now){expired.push(key);rows.delete(key);}
    if(expired.length)await this.ctx.storage.delete(expired);
    return rows;
  }
  async alarm(){await this.ctx.blockConcurrencyWhile(async()=>{const rows=await this.entries(),presence=await this.presenceRows();if(rows.size||presence.size)await this.ctx.storage.setAlarm(Date.now()+SEARCH_LEASE);});}
  async result(entry) {
    if(entry.status === 'matched' || entry.status === 'complete') {
      const pair = entry.pair;
      let response;
      try { response = await this.env.ROOMS.getByName(pair.code).fetch(new Request('https://match.internal/match-create', {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pair)
      })); } catch { /* The durable reservation survives transient room failures. */ }
      if(!response?.ok) return json({error:'Не удалось подготовить партию. Поиск сохранён, повторяем подключение.'},503);
      return json({status:'matched',ticket:entry.ticket,variant:entry.variant,code:pair.code,token:pair.players[entry.side].token});
    }
    return json({status:entry.status,ticket:entry.ticket,variant:entry.variant,startedAt:entry.startedAt});
  }
  async fetch(request) {
    return this.ctx.blockConcurrencyWhile(async()=>{
      const actor=request.headers.get('X-Match-Actor');
      if(!actor) return json({error:'Не удалось подтвердить поиск.'},403);
      if(new URL(request.url).pathname==='/api/presence'){
        const now=Date.now(),rows=await this.presenceRows(now),key='presence:'+actor;
        if(rows.size>=5000&&!rows.has(key))return json({error:'Счётчик временно недоступен.'},503);
        await this.ctx.storage.put(key,now+PRESENCE_LEASE);rows.set(key,now+PRESENCE_LEASE);
        // On sign-in this browser stops being counted as a separate guest.
        const guest=request.headers.get('X-Presence-Guest');
        if(actor.startsWith('account:')&&uuid(guest)){const guestKey='presence:guest:'+guest;await this.ctx.storage.delete(guestKey);rows.delete(guestKey);}
        const entries=await this.entries(now);
        await this.ctx.storage.setAlarm(now+SEARCH_LEASE);
        return json({online:rows.size,searching:[...entries.values()].filter(row=>row.status==='waiting').length,windowSeconds:PRESENCE_LEASE/1000});
      }
      const data=await request.json();
      if(!data || !['join','status','cancel','ack'].includes(data.action) || !uuid(data.ticket))return json({error:'Некорректный запрос поиска.'},400);
      if(data.action==='join'&&!validVariant(data.variant))return json({error:'Неизвестный режим игры.'},400);
      const now=Date.now(),rows=await this.entries(now),key='entry:'+data.ticket;
      let entry=rows.get(key);
      if(entry&&entry.actor!==actor)return json({error:'Поиск принадлежит другому игроку.'},403);
      if(data.action==='cancel' && !entry){
        // Remember cancellation even if a delayed join has not arrived yet.
        if(rows.size>=500)return json({error:'Очередь заполнена. Попробуйте чуть позже.'},429);
        entry={ticket:data.ticket,actor,status:'cancelled',expiresAt:now+RECEIPT_TTL};
      }else if(data.action==='join'&&!entry){
        entry=[...rows.values()].find(row=>row.actor===actor&&['waiting','matched'].includes(row.status));
        if(entry)return this.result(entry);
        if(rows.size>=500)return json({error:'Очередь заполнена. Попробуйте чуть позже.'},429);
        entry={ticket:data.ticket,actor,variant:data.variant,identity:cosmeticIdentity(identityOf(request)),status:'waiting',startedAt:now,expiresAt:now+SEARCH_LEASE};
      }
      if(!entry)return json({status:'expired',ticket:data.ticket});
      if(entry.status==='waiting'){
        if(data.action==='cancel'){entry.status='cancelled';entry.expiresAt=now+RECEIPT_TTL;delete entry.identity;}
        else if(data.action==='ack')return json({error:'Соперник ещё не найден.'},409);
        else{
          entry.expiresAt=now+SEARCH_LEASE;
          const peer=[...rows.values()].filter(row=>row.status==='waiting'&&row.actor!==actor&&row.variant===entry.variant).sort((a,b)=>a.startedAt-b.startedAt)[0];
          if(peer){
            const players=[peer,entry];if(crypto.getRandomValues(new Uint8Array(1))[0]%2)players.reverse();
            const pair={code:crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase(),variant:entry.variant,reservation:crypto.randomUUID(),players:{}};
            for(const [index,side] of ['white','black'].entries())pair.players[side]={token:crypto.randomUUID(),identity:players[index].identity};
            const writes={};
            for(const [index,side] of ['white','black'].entries()){
              Object.assign(players[index],{status:'matched',side,pair,expiresAt:now+RECEIPT_TTL});delete players[index].identity;
              writes['entry:'+players[index].ticket]=players[index];
            }
            await this.ctx.storage.put(writes);
          }
        }
      }
      if(data.action==='ack'&&entry.status==='matched')entry.status='complete';
      await this.ctx.storage.put('entry:'+entry.ticket,entry);
      await this.ctx.storage.setAlarm(now+SEARCH_LEASE);
      return this.result(entry);
    });
  }
}

export async function handleMatchmaking(request,env,identity){
  if(request.method!=='POST')return json({error:'Недоступный запрос.'},405);
  const url=new URL(request.url),local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  // Presence must not race a first queue join and overwrite its seat cookie.
  const name=(local?'':'__Host-')+(url.pathname==='/api/presence'?'shishki-visitor':'shishki-search');
  let guest=request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);
  const fresh=!uuid(guest);if(fresh)guest=crypto.randomUUID();
  const headers=new Headers(request.headers);headers.set('X-Match-Actor',identity?'account:'+identity.id:'guest:'+guest);
  headers.set('X-Presence-Guest',guest);
  const response=await env.MATCHMAKER.getByName('public-queue-v1').fetch(new Request(request,{headers}));
  const result=new Response(response.body,response);
  if(fresh)result.headers.append('Set-Cookie',name+'='+guest+'; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000'+(local&&url.protocol==='http:'?'':'; Secure'));
  return result;
}
