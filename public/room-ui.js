import { formatClock, remainingTime } from './time-control.js';
import { t, language } from './i18n.js';
const $ = id => document.getElementById(id);
export function renderClock(game, clock, now, waiting = false, connected = true) {
  $('clock-panel').hidden = !clock;
  if (!clock) return;
  $('clock-control').textContent = (game.variant === 'russian12' ? '10' : '5') + ' + 5';
  const times = remainingTime(clock, game.turn, now);
  for (const side of ['white', 'black']) {
    const timer = $('clock-' + side), text = formatClock(times[side]);
    if (timer.textContent !== text) timer.textContent = text;
    timer.parentElement.classList.toggle('clock-active', !game.winner && clock.startedAt !== null && game.turn === side);
    timer.parentElement.classList.toggle('clock-low', times[side] <= 30000);
  }
  const hint = game.winner ? 'Партия завершена.' : waiting ? 'Часы начнутся, когда присоединится соперник.' : !connected ? 'Переподключаемся. Часы продолжают идти.' : 'После полного хода добавляется 5 секунд.';
  const translated = t(hint);
  if ($('clock-hint').textContent !== translated) $('clock-hint').textContent = translated;
}
export function createRoomChat(send) {
  let code = null, role = null, messages = [], pending = null, online = false;
  function controls() { $('chat-send').disabled = !online || pending !== null; $('chat-input').disabled = !online; }
  function render() {
    const list = $('chat-messages'), atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 50;
    if (!messages.length) { list.replaceChildren(); const empty = document.createElement('p'); empty.className = 'chat-empty'; empty.textContent = t('Поприветствуйте соперника. Хорошей игры!'); list.append(empty); return; }
    const rows = messages.map(message => {
      const row = document.createElement('div'); row.className = 'chat-message' + (message.side === role ? ' own' : '');
      const head = document.createElement('div'); head.className = 'chat-message-head';
      const name = document.createElement('strong'); name.dataset.noTranslate = ''; name.textContent = message.name || t(message.side === 'white' ? 'Белые' : 'Чёрные');
      const time = document.createElement('time'); time.dateTime = new Date(message.sentAt).toISOString(); time.textContent = new Intl.DateTimeFormat(language(), { hour: '2-digit', minute: '2-digit' }).format(message.sentAt);
      const body = document.createElement('p'); body.dataset.noTranslate = ''; body.textContent = message.text;
      head.append(name,time); row.append(head,body); return row;
    });
    list.replaceChildren(...rows); if (atBottom) list.scrollTop = list.scrollHeight;
  }
  $('chat-form').onsubmit = event => {
    event.preventDefault();
    if (!online || pending !== null) return;
    const text = $('chat-input').value.trim(); if (!text) return;
    $('chat-error').textContent = '';
    if (send({ type: 'chat', text })) { pending = text; controls(); }
  };
  document.addEventListener('languagechange', render);
  return {
    update(room, connected) {
      $('chat-panel').hidden = !room;
      if (!room) { code = null; messages = []; pending = null; online = false; controls(); return; }
      if (code !== room.code) { code = room.code; pending = null; $('chat-input').value = ''; $('chat-error').textContent = ''; }
      role = room.role; online = connected;
      if (!connected) pending = null;
      const next = room.chat || [];
      if (JSON.stringify(next) !== JSON.stringify(messages)) { messages = next; render(); }
      else if (!messages.length) render();
      controls();
    },
    receive(message) {
      if (message.side === role && pending !== null) {
        if ($('chat-input').value.trim() === pending) $('chat-input').value = '';
        pending = null;
      }
      if (!messages.some(item => item.id === message.id)) messages = [...messages, message].slice(-50);
      render(); controls(); return messages;
    },
    error(message) { pending = null; $('chat-error').textContent = message; controls(); }
  };
}
