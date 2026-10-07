import { newGame, legalMoves, applyMove, sideOf, opposite, squareName } from './game.js';
import { attachBoardDrag } from './board-drag.js';
import { matchResult } from './match-result.js';

const $ = id => document.getElementById(id);
const names = { white: 'Белые', black: 'Чёрные' };
let mode = 'local', game = newGame(), selected = null, flipped = false;
let room = null, socket = null, connected = false, pending = false, reconnectTimer, heartbeat, retry = 0;
let toastTimer, confirmAction, savedLocal;
let shownResult = null;
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { toast('Браузер не разрешает сохранение. Не закрывайте эту вкладку до конца партии.'); } }
};
try {
  const saved = JSON.parse(storage.get('shashki-local-v1'));
  if (saved && saved.board?.length === 64 && Array.isArray(saved.history) && saved.repetitions && ['white', 'black'].includes(saved.turn)) {
    legalMoves(saved); game = saved;
  }
} catch { /* Start fresh if local storage is unavailable or damaged. */ }
savedLocal = game;

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500);
}
function confirm(title, message, action, label = 'Продолжить') {
  $('confirm-title').textContent = title; $('confirm-text').textContent = message;
  $('confirm-yes').textContent = label; confirmAction = action; $('confirm-dialog').showModal();
}
function localSave() { savedLocal = game; storage.set('shashki-local-v1', JSON.stringify(game)); }
function canPlay() { return !game.winner && (mode === 'local' || (room && room.ready && connected && room.role === game.turn && !pending)); }
function pieceHTML(piece, captured = false) {
  return `<span class="piece ${sideOf(piece)} ${Math.abs(piece) === 2 ? 'king' : ''} ${captured ? 'captured' : ''}">${Math.abs(piece) === 2 ? '<span class="crown">♛</span>' : ''}</span>`;
}
function playerHTML(side) {
  const yours = room?.role === side;
  const waiting = mode === 'online' && (!room || (!room.ready && side === 'black'));
  const online = mode === 'local' || (side === room?.role ? connected : room?.online?.[side]);
  const count = game.board.filter((p, i) => sideOf(p) === side && !game.captured.includes(i)).length;
  return `<div class="player-avatar">${pieceHTML(side === 'white' ? 1 : -1)}</div><div class="player-info"><div class="player-name">${waiting ? 'Ждём соперника' : names[side]}${yours ? '<span class="you-badge">это вы</span>' : ''}</div><div class="player-meta"><span class="presence ${online ? '' : 'offline'}"></span>${mode === 'local' ? 'За этой доской' : waiting ? 'Пригласите друга' : online ? 'В игре' : 'Не в сети'}</div></div>${!game.winner && game.turn === side && (mode === 'local' || room?.ready) ? '<span class="turn-label">Сейчас ходит</span>' : ''}<div class="piece-count"><span>◉</span> ${count}</div>`;
}
function renderBoard(keepDrag = false) {
  if (!keepDrag) boardDrag.cancel();
  const focused = document.activeElement?.dataset?.index;
  const moves = canPlay() ? legalMoves(game) : [];
  const destinations = moves.filter(m => m.from === selected).map(m => m.to);
  const last = game.history.at(-1);
  const indexes = Array.from({ length: 64 }, (_, i) => flipped ? 63 - i : i);
  $('board').innerHTML = indexes.map((index, visual) => {
    const row = Math.floor(index / 8), col = index % 8, piece = game.board[index];
    const legal = destinations.includes(index), available = moves.some(m => m.from === index);
    const highlighted = game.path.length ? game.path.includes(index) : last && (last.from === index || last.to === index);
    const label = `${squareName(index)}${piece ? ', ' + names[sideOf(piece)] + (Math.abs(piece) === 2 ? ', дамка' : ', шашка') : ', пусто'}${legal ? ', доступный ход' : ''}`;
    return `<button class="square ${(row + col) % 2 ? 'dark' : ''} ${highlighted ? 'last' : ''} ${selected === index ? 'selected' : ''} ${legal ? 'legal' : ''} ${available ? 'available' : ''}" data-index="${index}" aria-label="${label}" aria-pressed="${selected === index}" ${((row + col) % 2 === 0) ? 'tabindex="-1"' : ''}>${piece ? pieceHTML(piece, game.captured.includes(index)) : ''}${visual >= 56 ? `<span class="coordinate file" aria-hidden="true">${'abcdefgh'[col]}</span>` : ''}${visual % 8 === 0 ? `<span class="coordinate rank" aria-hidden="true">${8 - row}</span>` : ''}</button>`;
  }).join('');
  if (focused !== undefined) $('board').querySelector(`[data-index="${focused}"]`)?.focus({ preventScroll: true });
  $('top-player').innerHTML = playerHTML(flipped ? 'white' : 'black');
  $('bottom-player').innerHTML = playerHTML(flipped ? 'black' : 'white');
}
function status() {
  if (mode === 'online' && !room) return ['Играйте на расстоянии', 'Создайте комнату или войдите по приглашению.', '↗'];
  if (game.winner) { const result = matchResult(game, room?.role); return [result.title, result.text, result.symbol]; }
  if (mode === 'online' && !connected) return ['Соединение прервано', 'Восстанавливаем связь и вашу позицию…', '↻'];
  if (mode === 'online' && !room.ready) return ['Место для друга', 'Отправьте приглашение, чтобы начать партию.', '↗'];
  if (game.forced !== null) return [canPlay() ? 'Продолжайте взятие' : 'Соперник продолжает', 'Завершите цепочку ударов той же шашкой.', '↗'];
  if (mode === 'online' && game.turn !== room.role) return ['Ход соперника', room.online?.[opposite(room.role)] ? 'Пока можно обдумать следующий ход.' : 'Соперник отключился. Партия сохранена.', '…'];
  return [mode === 'online' ? 'Ваш ход' : 'Ход ' + (game.turn === 'white' ? 'белых' : 'чёрных'), legalMoves(game).some(m => m.capture !== null) ? 'Есть взятие — нужно бить.' : 'Перетащите шашку или выберите её и клетку кликом.', '↗'];
}
function renderHistory() {
  $('move-count').textContent = game.history.length + ' полуходов';
  if (!game.history.length) {
    $('history').innerHTML = '<div class="empty-history"><span aria-hidden="true">↗</span><p>У каждой партии есть начало.<br>Сделайте первый ход.</p></div>'; return;
  }
  const rows = [];
  for (let i = 0; i < game.history.length; i += 2) {
    const row = document.createElement('div'); row.className = 'history-row';
    for (const text of [String(i / 2 + 1).padStart(2, '0'), game.history[i].notation, game.history[i + 1]?.notation || '—']) {
      const cell = document.createElement('span'); cell.textContent = text; row.append(cell);
    }
    rows.push(row);
  }
  $('history').replaceChildren(...rows); $('history').scrollTop = $('history').scrollHeight;
}
function render() {
  renderBoard(); renderHistory();
  const [title, text, icon] = status();
  $('status-title').textContent = title; $('status-text').textContent = text; $('status-icon').textContent = icon;
  $('game-panel-title').textContent = mode === 'local' ? 'За одной доской' : 'С другом онлайн';
  $('mode-badge').textContent = mode === 'local' ? 'ЛОКАЛЬНО' : 'ОНЛАЙН';
  $('online-controls').hidden = mode === 'local'; $('local-note').hidden = mode !== 'local';
  $('online-lobby').hidden = !!room; $('room-controls').hidden = !room;
  $('board-caption').textContent = mode === 'local' ? 'Два игрока, одно устройство' : room ? 'Комната ' + room.code : 'Пригласите друга за доску';
  $('new-button').textContent = room ? '↗ Покинуть комнату' : '↻ Новая партия';
  $('new-button').hidden = mode === 'online' && !room;
  $('match-actions').hidden = !!game.winner || (mode === 'online' && !room?.ready);
  $('resign-button').disabled = !!game.winner || (mode === 'online' && (!connected || !room?.ready || pending));
  $('draw-button').disabled = !!game.winner || (mode === 'online' && (!connected || pending || !!room?.drawOffer));
  $('draw-button').textContent = room?.drawOffer && room.drawOffer === room.role ? 'Ничья предложена' : 'Предложить ничью';
  $('draw-notice').hidden = !room?.drawOffer || room.drawOffer === room.role || !!game.winner;
  $('accept-draw').disabled = $('decline-draw').disabled = !connected || pending;
  $('rematch-button').hidden = !game.winner || (mode === 'online' && !room);
  $('rematch-button').disabled = mode === 'online' && (!connected || pending || room?.rematch?.includes(room.role));
  $('rematch-button').textContent = room?.rematch?.includes(room.role) ? 'Ждём согласия соперника…' : room?.rematch?.length ? 'Принять реванш ↻' : 'Реванш ↻';
  if (room) {
    $('room-code').textContent = room.code; $('connection-label').textContent = connected ? '● На связи' : '○ Нет связи';
    $('room-hint').textContent = room.ready ? 'Ваше место сохранено в этом браузере.' : 'Отправьте ссылку другу. Вы играете белыми.';
  }
  renderResult();
}

function renderResult() {
  const dialog = $('result-dialog');
  if (!game.winner || $('game-screen').hidden) {
    dialog.close(); shownResult = null; return;
  }
  const result = matchResult(game, room?.role);
  dialog.dataset.result = result.kind;
  $('result-title').textContent = result.title;
  $('result-text').textContent = result.text;
  $('result-symbol').textContent = result.symbol;
  $('result-rematch').textContent = $('rematch-button').textContent;
  $('result-rematch').disabled = $('rematch-button').disabled;
  $('result-hint').textContent = mode === 'local' ? 'Новая партия на этой же доске. Белые начинают.' : !connected ? 'Восстанавливаем соединение с комнатой…' : room.rematch?.includes(room.role) ? 'Предложение отправлено. Новая партия начнётся, когда соперник согласится.' : room.rematch?.length ? 'Соперник предлагает сыграть ещё раз. Примите реванш, чтобы начать.' : 'Реванш начнётся, когда оба игрока согласятся.';
  const key = `${room?.code || 'local'}:${game.revision}:${game.winner}`;
  if (shownResult !== key) {
    shownResult = key;
    document.querySelectorAll('dialog[open]').forEach(open => open.close());
    confirmAction = null; dialog.showModal();
  }
}
function playMove(from, to) {
  if (!canPlay() || !legalMoves(game).some(move => move.from === from && move.to === to)) return;
  if (mode === 'online') send({ type: 'move', from, to });
  else { game = applyMove(game, from, to); selected = game.forced; localSave(); render(); }
}
const boardDrag = attachBoardDrag($('board'), {
  moves: () => canPlay() ? legalMoves(game) : [],
  select: from => { selected = from; renderBoard(true); },
  move: playMove
});
$('board').addEventListener('click', event => {
  const button = event.target.closest('[data-index]');
  if (!button || !canPlay()) return;
  const index = Number(button.dataset.index), moves = legalMoves(game);
  if (selected !== null && moves.some(m => m.from === selected && m.to === index)) {
    playMove(selected, index); return;
  } else if (moves.some(m => m.from === index)) selected = selected === index && game.forced === null ? null : index;
  else if (game.forced === null) selected = null;
  render();
});
$('board').addEventListener('keydown', event => {
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 }[event.key];
  if (!delta || !event.target.dataset.index) return;
  event.preventDefault();
  const next = Number(event.target.dataset.index) + delta * (flipped ? -1 : 1);
  $('board').querySelector(`[data-index="${next}"]`)?.focus();
});

async function api(path, data = {}) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Не удалось подключиться.');
  return result;
}
function disconnect() {
  clearTimeout(reconnectTimer); clearInterval(heartbeat);
  const previous = socket; socket = null;
  if (previous) previous.close();
  connected = false; pending = false;
}
function applySnapshot(data) {
  const changed = game.revision !== data.game.revision;
  game = data.game;
  Object.assign(room, { ready: data.ready, online: data.online, rematch: data.rematch, drawOffer: data.drawOffer });
  if (changed || game.forced !== null) selected = game.turn === room.role ? game.forced : null;
  pending = false; render();
}
function connect() {
  if (!room) return;
  clearTimeout(reconnectTimer);
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/rooms/${room.code}/socket`, ['checkers', room.token]);
  socket = ws; let lastPong = Date.now();
  ws.onopen = () => {
    if (socket !== ws) return;
    connected = true; retry = 0; render(); clearInterval(heartbeat);
    heartbeat = setInterval(() => {
      if (socket !== ws || ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastPong > 65000) { ws.close(); return; }
      ws.send('ping');
    }, 25000);
  };
  ws.onmessage = event => {
    if (socket !== ws) return;
    if (event.data === 'pong') { lastPong = Date.now(); return; }
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'state') applySnapshot(data);
      if (data.type === 'error') { pending = false; toast(data.message); render(); }
    } catch { toast('Не удалось обновить позицию. Перезагрузите страницу.'); }
  };
  ws.onclose = event => {
    if (socket !== ws) return;
    clearInterval(heartbeat); connected = false; pending = false; render();
    if (event.code === 4001 || event.code === 4004) {
      $('status-title').textContent = event.code === 4001 ? 'Игра в другой вкладке' : 'Комната закрыта';
      $('status-text').textContent = event.code === 4001 ? 'Продолжайте там или обновите эту страницу.' : 'Создайте новую комнату для следующей партии.';
      return;
    }
    reconnectTimer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 15000));
  };
  ws.onerror = () => { /* onclose handles retries */ };
}
function send(data) {
  if (!connected || socket?.readyState !== WebSocket.OPEN || pending) return toast('Подождите соединения с комнатой.');
  pending = true; socket.send(JSON.stringify({ ...data, revision: game.revision })); render();
}
function enterRoom(code, data) {
  disconnect();
  if (mode === 'local') savedLocal = game;
  mode = 'online'; room = { code, ...data }; game = data.game;
  storage.set('shashki-room-' + code, data.token);
  selected = game.forced; flipped = room.role === 'black';
  const url = new URL(location.href); url.searchParams.set('room', code); history.replaceState(null, '', url);
  showScreen('game'); render(); connect();
}
async function join(code) {
  const data = await api(`/api/rooms/${code}/join`, { token: storage.get('shashki-room-' + code) });
  enterRoom(code, data);
}
function extractCode(value) {
  let code = value.trim();
  if (/^https?:\/\//i.test(code)) { try { code = new URL(code).searchParams.get('room') || ''; } catch { code = ''; } }
  code = code.toUpperCase();
  if (!/^[A-F0-9]{12}$/.test(code)) throw new Error('Введите код из 12 символов или полную ссылку на комнату.');
  return code;
}
function leave() {
  disconnect(); room = null; selected = null; game = savedLocal; flipped = false;
  const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(null, '', url);
}
function showScreen(screen) {
  boardDrag.cancel();
  $('home-screen').hidden = screen !== 'home';
  $('game-screen').hidden = screen !== 'game';
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (screen === 'home') { updateStart(); $('home-title').focus({ preventScroll: true }); }
  else $('home-button').focus({ preventScroll: true });
}
function goHome() {
  const action = () => {
    if (mode === 'local') savedLocal = game;
    leave(); mode = 'local'; showScreen('home'); render();
  };
  if (room) confirm('Вернуться на главную?', 'Вы отключитесь от комнаты. Партия сохранится — вернуться можно по ссылке приглашения в этом браузере.', action, 'На главную');
  else action();
}
function updateStart() {
  const local = $('start-form').elements['play-mode'].value === 'local';
  const resume = local && !savedLocal.winner && (savedLocal.history.length || savedLocal.path.length);
  $('start-button').innerHTML = `${local ? resume ? 'Продолжить партию' : 'Начать партию' : 'Создать комнату'} <span aria-hidden="true">↗</span>`;
  $('start-hint').textContent = local ? resume ? 'Ваша партия сохранена. Продолжите с последнего хода.' : 'Белые начинают. Передавайте ход друг другу.' : 'Комната будет готова сразу. Останется пригласить друга.';
}
$('home-button').onclick = goHome;
document.querySelector('.brand').onclick = event => { event.preventDefault(); goHome(); };
$('start-form').onchange = updateStart;
$('start-form').onsubmit = async event => {
  event.preventDefault();
  if ($('start-button').disabled) return;
  if ($('start-form').elements['play-mode'].value === 'local') {
    mode = 'local'; game = savedLocal;
    if (game.winner) { game = newGame(); localSave(); }
    selected = game.forced; flipped = false; showScreen('game'); render();
    return;
  }
  $('start-button').disabled = true; $('home-join-button').disabled = true;
  $('start-button').textContent = 'Создаём комнату…';
  try { const data = await api('/api/rooms'); enterRoom(data.code, data); }
  catch (error) { toast(error.message || 'Не удалось создать комнату. Попробуйте ещё раз.'); }
  finally { $('start-button').disabled = false; $('home-join-button').disabled = false; updateStart(); }
};
$('flip-button').onclick = () => { flipped = !flipped; renderBoard(); };
$('rules-button').onclick = () => $('rules-dialog').showModal();
$('join-button').onclick = () => { $('join-error').textContent = ''; $('join-dialog').showModal(); };
$('home-join-button').onclick = $('join-button').onclick;
$('theme-button').onclick = () => $('theme-dialog').showModal();
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => $(button.dataset.close).close(); });
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
}));
$('confirm-yes').onclick = () => { $('confirm-dialog').close(); confirmAction?.(); };
$('create-button').onclick = async () => {
  $('create-button').disabled = true;
  try { const data = await api('/api/rooms'); enterRoom(data.code, data); }
  catch (error) { toast(error.message || 'Не удалось создать комнату.'); }
  finally { $('create-button').disabled = false; }
};
$('join-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try { await join(extractCode($('join-code').value)); $('join-dialog').close(); }
  catch (error) { $('join-error').textContent = error.message; }
  finally { button.disabled = false; }
};
$('copy-button').onclick = async () => {
  try { await navigator.clipboard.writeText(location.origin + '/?room=' + room.code); toast('Приглашение скопировано. Отправьте его другу.'); }
  catch { toast('Скопируйте адрес страницы из адресной строки и отправьте другу.'); }
};
function resetLocal() { game = newGame(); selected = null; localSave(); render(); }
$('new-button').onclick = () => {
  if (room) confirm('Покинуть комнату?', 'Партия сохранится. Вы сможете вернуться по той же ссылке в этом браузере.', () => { leave(); mode = 'online'; game = newGame(); render(); }, 'Покинуть');
  else if (game.history.length || game.path.length) confirm('Начать новую партию?', 'Текущая локальная партия будет заменена новой.', resetLocal, 'Начать заново');
  else resetLocal();
};
function finishLocal(winner, reason) {
  game.winner = winner; game.reason = reason; game.revision++; selected = null; localSave(); render();
}
function confirmMatch(title, text, action, label) {
  const revision = game.revision, code = room?.code;
  confirm(title, text, () => {
    if (game.winner || game.revision !== revision || room?.code !== code) return toast('Позиция изменилась. Повторите действие.');
    action();
  }, label);
}
$('resign-button').onclick = () => confirmMatch('Сдаться в этой партии?', 'Победа достанется ' + ((room?.role || game.turn) === 'white' ? 'чёрным.' : 'белым.'), () => {
  if (mode === 'online') send({ type: 'resign' });
  else finishLocal(opposite(game.turn), 'resign');
}, 'Сдаться');
function rematch() { if (!game.winner) return; mode === 'online' ? send({ type: 'rematch' }) : resetLocal(); }
$('rematch-button').onclick = $('result-rematch').onclick = rematch;
$('result-home').onclick = () => { $('result-dialog').close(); goHome(); };
$('draw-button').onclick = () => {
  if (mode === 'online') send({ type: 'draw' });
  else confirmMatch(`${names[opposite(game.turn)]}, согласны на ничью?`, `${names[game.turn]} предлагают завершить партию вничью. Передайте решение сопернику.`, () => finishLocal('draw', 'agreement'), 'Принять ничью');
};
$('accept-draw').onclick = () => send({ type: 'draw' });
$('decline-draw').onclick = () => send({ type: 'decline-draw' });

updateStart(); render();
const invite = new URL(location.href).searchParams.get('room');
if (invite) {
  mode = 'online'; showScreen('game'); render(); $('status-title').textContent = 'Открываем комнату…';
  try { await join(extractCode(invite)); }
  catch (error) { toast(error.message); $('status-title').textContent = 'Не удалось войти'; $('status-text').textContent = error.message; }
}
