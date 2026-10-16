import { CATALOG } from './shop-catalog.js';
import { rarityOf, RARITIES } from './cases.js';
import { createCaseShop } from './case-shop.js';
import { t } from './i18n.js';
import { syncAccount } from './auth.js';
import { itemById } from './shop-catalog.js';
import { drawCue, animatedCue } from './pool-cue.js';
import { createCosmeticAnimation, canvasVisible, cosmeticTime } from './cosmetic-animation.js';
import { pieceArt } from './skin-art.js';
import { fleetPreview } from './battleship-art.js';
import { createRocketEffect } from './rocket.js';
const $ = id => document.getElementById(id);
const inventory=!!document.querySelector('.inventory-page');
let linkedItemOpened=false;
let state = null, filter = 'all', effectSlot = 'victory', busy = false, previewItem = null;
const preview = createRocketEffect($('preview-board'), { play() {} });
function paintCue(canvas,time=cosmeticTime()){
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,400,140);ctx.save();ctx.translate(365,70);drawCue(ctx,canvas.dataset.cue,0,time);ctx.restore();
}
const cueAnimation=createCosmeticAnimation(time=>{
  for(const canvas of document.querySelectorAll('canvas[data-cue]'))if(animatedCue(canvas.dataset.cue)&&canvasVisible(canvas))paintCue(canvas,time);
},()=>[...document.querySelectorAll('canvas[data-cue]')].some(canvas=>animatedCue(canvas.dataset.cue)&&canvasVisible(canvas)));
function el(tag, text = '', className) { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; }
async function request(path = '', data) {
  const response = await fetch('/api/auth/shop' + path, {
    method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(20000)
  });
  const result = await response.json().catch(() => ({ error: 'Сервис временно недоступен.' }));
  if (!response.ok) throw Object.assign(new Error(result.error || 'Не удалось выполнить запрос.'), { status: response.status });
  return result;
}
const caseShop=$('case-dialog')?createCaseShop({request,getState:()=>state,update:value=>{state=value;render();},preview:item=>location.assign('/inventory?item='+encodeURIComponent(item.id))}):null;
function notice(text, error = false) { $('shop-status').textContent = text; $('shop-status').dataset.error = String(error); }
function isOwned(item) { return !!state?.owned.includes(item.id); }
function isEquipped(item) { return !!state && (item.type === 'skin' ? state.user.pieceSkin : item.type === 'cue' ? state.user.cueSkin : item.type === 'ship' ? state.user.shipSkin : effectSlot === 'victory' ? state.user.victoryEffect : state.user.finishEffect) === item.value; }
function render() {
  caseShop?.render();
  if(state)syncAccount(state.user);
  $('coin-balance').textContent = state ? state.balance.toLocaleString() : '—';
  $('wallet-caption').textContent = state?.fullAccess ? t('Полный доступ · все предметы доступны всегда') : t(state ? 'Кошелёк вашего аккаунта' : '100 монет в подарок при первом входе');
  if(!inventory)return;
  for (const slot of ['victory', 'resign']) {
    const value = slot === 'victory' ? state?.user.victoryEffect : state?.user.finishEffect;
    $(slot + '-choice').textContent = CATALOG.find(item => item.type === 'effect' && item.value === value)?.name || 'Без эффекта';
  }
  $('coin-balance').textContent = state ? state.balance.toLocaleString('ru-RU') : '—';
  $('wallet-caption').textContent = state?.fullAccess ? 'Полный доступ · все предметы доступны всегда' : state ? 'Кошелёк вашего аккаунта' : '100 монет в подарок при первом входе';
  $('collection-count').textContent = state ? `${state.owned.length} из ${CATALOG.length} в коллекции` : '';
  const items = CATALOG.filter(item => isOwned(item) && (filter === 'all' || filter === item.type));
  $('shop-catalog').replaceChildren(...items.map(item => {
    const owned = isOwned(item), equipped = isEquipped(item);
    const card = el('article', '', 'shop-item'); card.dataset.equipped = String(equipped);
    const art = el('div', '', 'shop-art'); art.setAttribute('aria-hidden', 'true');
    if (item.type === 'skin') for (const side of ['white', 'black']) { const piece = el('span', '', `piece ${side} skin-${item.value}`); piece.innerHTML = pieceArt(item.value); art.append(piece); }
    else if (item.type === 'ship') art.innerHTML = fleetPreview(item.value);
    else if (item.type === 'cue') { const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 140; canvas.className = 'shop-cue-preview'; canvas.dataset.cue=item.value; paintCue(canvas);art.append(canvas); }
    else { art.dataset.effect = item.value; art.append(el('span', item.symbol, 'shop-art-symbol')); }
    if(item.type==='cue'&&animatedCue(item.value))art.append(el('span','Анимированный','cue-motion-badge'));
    if (owned) art.append(el('span', equipped ? 'Выбрано' : 'В коллекции', 'item-status'));
    const body = el('div', '', 'shop-item-body'), heading = el('div', '', 'item-heading');
    const rarity=rarityOf(item);card.dataset.rarity=rarity;
    heading.append(el('h3', item.name), el('span', RARITIES[rarity]?.name || 'Базовый', 'item-price rarity-label'));
    const actions = el('div', '', 'shop-item-actions');
    const view = el('button', '', 'secondary-button'); view.append(el('span','◉','action-icon'),el('span','Посмотреть')); view.firstChild.setAttribute('aria-hidden','true'); view.setAttribute('aria-label', 'Посмотреть: ' + item.name); view.onclick = () => openPreview(item);
    const action = el('button', equipped ? '✓ Выбрано' : owned ? 'Выбрать' : state ? 'Из кейсов' : 'Войти', 'primary-button');
    action.disabled = busy || equipped || !!state && !owned;
    action.setAttribute('aria-label', (owned ? 'Выбрать: ' : 'Из кейсов: ') + item.name);
    action.onclick = () => {if (!state) location.assign('/?login=1&returnTo=shop');else if(owned) equip(item);};
    if(owned&&!equipped){action.replaceChildren(el('span','✓','action-icon'),el('span','Выбрать'));action.firstChild.setAttribute('aria-hidden','true');}
    actions.append(view);if(!equipped&&owned)actions.append(action); body.append(heading, el('p', item.description, 'item-description'), actions); card.append(art, body); return card;
  }));
  if (!items.length) $('shop-catalog').append(el('p', state ? 'В этой категории пока нет предметов.' : 'Войдите, чтобы увидеть свою коллекцию.', 'subtle'));
  cueAnimation.refresh();
}
async function load() {
  $('shop-retry').hidden = true;
  try { state = await request(); $('shop-login').hidden = true; notice(''); }
  catch (error) {
    state = null; $('shop-login').hidden = error.status !== 401; $('shop-retry').hidden = error.status === 401;
    if (error.status !== 401) notice(error.message, true);
  }
  render();
}
async function equip(item) {
  if (busy) return; busy = true; render(); notice('Выбираем оформление…');
  const slot = effectSlot;
  try { state = await request('/equip', { item: item.id, slot }); notice(item.type !== 'effect' ? `${item.name} — выбрано. Скин появится при следующем входе в комнату.` : `${item.name} — ${slot === 'victory' ? 'при победе' : 'при сдаче соперника'}.`); }
  catch (error) { notice(error.message, true); }
  finally { busy = false; render(); }
}
function openPreview(item) {
  preview.cancel(); previewItem = item; $('preview-title').textContent = item.name;
  $('preview-description').textContent = item.type === 'effect' ? `Пример анимации. В игре её увидят оба игрока ${effectSlot === 'victory' ? 'после вашей победы' : 'при сдаче вашего соперника'}.` : 'Ваши фишки сохраняют цвет стороны и получают выбранное оформление. Рисунок виден на доске, а дамки отмечены короной.';
  $('preview-board').hidden = ['cue','ship'].includes(item.type);
  $('preview-fleet').hidden = item.type !== 'ship';
  if(item.type === 'ship') { $('preview-fleet').innerHTML=fleetPreview(item.value);$('preview-description').textContent=item.description; }
  $('preview-cue').hidden = item.type !== 'cue';
  if (item.type === 'cue') { $('preview-cue').dataset.cue=item.value;paintCue($('preview-cue'));$('preview-description').textContent = item.description; }
  for (const side of ['white', 'black']) for (const suffix of ['', '-second']) {
    const skin = item.type === 'skin' ? item.value : state?.user.pieceSkin || 'classic', piece = $('preview-' + side + suffix);
    piece.className = `piece ${side} skin-${skin}`; piece.innerHTML = pieceArt(skin);
  }
  $('preview-replay').hidden = item.type !== 'effect' || item.value === 'none';
  $('preview-dialog').showModal(); replay();cueAnimation.refresh();
}
function replay() { if (previewItem?.type === 'effect' && previewItem.value !== 'none') preview.launch(false, () => {}, previewItem.value); }
$('preview-replay').onclick = replay;
$('preview-close').onclick = () => $('preview-dialog').close();
$('preview-dialog').addEventListener('close', () => {preview.cancel();cueAnimation.refresh();});
$('shop-retry').onclick = load;
document.querySelectorAll('[data-filter]').forEach(button => {
  button.onclick = () => {
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
    render();
  };
});
window.addEventListener('pageshow', event => { if (event.persisted) load(); });
document.querySelectorAll('[data-slot]').forEach(button => { button.onclick = () => {
  effectSlot = button.dataset.slot;
  document.querySelectorAll('[data-slot]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  $('slot-description').textContent = effectSlot === 'victory' ? 'Выбираете анимацию обычной победы: мат, взятие последней шашки или победа по времени.' : 'Выбираете анимацию, которая появится, когда ваш соперник сдастся.';
  render();
}; });
window.addEventListener('focus', () => { if (!busy && !$('case-dialog')?.open && !$('preview-dialog').open) load(); });
render(); await load();
