import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
export const browserPath=[process.env.BROWSER_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p=>p&&existsSync(p));
export async function openChromium(){
  const profile=mkdtempSync(join(tmpdir(),'shishki-cards-browser-'));
  const child=spawn(browserPath,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-pipe','--user-data-dir='+profile],{windowsHide:true,stdio:['ignore','ignore','ignore','pipe','pipe']});
  const exited=new Promise(resolve=>child.once('exit',resolve));
  let id=0,buffer='';const pending=new Map(),errors=[];
  child.stdio[4].on('data',chunk=>{
    buffer+=chunk.toString();let end;
    while((end=buffer.indexOf('\0'))>=0){
      const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);
      if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);
      if(message.method==='Log.entryAdded'&&message.params.entry.source==='security')errors.push(message.params.entry.text);
      const waiter=pending.get(message.id);if(!waiter)continue;
      pending.delete(message.id);clearTimeout(waiter.timer);
      if(message.error)waiter.reject(Error(JSON.stringify(message.error)));else waiter.resolve(message.result);
    }
  });
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error(method+' timed out'));},12000);pending.set(key,{resolve,reject,timer});child.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0');});
  const close=async()=>{for(const {timer}of pending.values())clearTimeout(timer);child.kill();await exited;rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});};
  try{
    const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
    const cdp=(method,params)=>send(method,params,sessionId);await cdp('Runtime.enable');await cdp('Log.enable');
    const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
    return {cdp,evaluate,errors,close};
  }catch(error){await close();throw error;}
}
