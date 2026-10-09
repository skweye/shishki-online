import { closeAccountMenu } from './account-menu.js';
import { newGame, legalMoves, applyMove, sideOf, opposite, squareName, VARIANTS, boardSize, variantOf } from './game.js';
import { attachBoardDrag } from './board-drag.js';
import { matchResult } from './match-result.js';
import { createSounds } from './sounds.js';
import { authReady, currentUser } from './auth.js';
import { createRocketEffect, isFinishTransition } from './rocket.js';
import { validSkin } from './shop-catalog.js';
import { applyShot, nextChapaevRound } from './chapaev.js';
import { createChapaevBoard } from './chapaev-board.js';
import { createClock, expiredSide, advanceClock, timeoutGame, timeControl } from './time-control.js';
import { renderClock, createRoomChat } from './room-ui.js';

const $ = id => document.getElementById(id);
const names = { white: 'Белые', black: 'Чёрные' };
const sounds = createSounds();
const rocketEffect = createRocketEffect(document.querySelector('.board-frame'), sounds);
const escapeHTML = text => String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
let mode = 'local', game = newGame(), selected = null, flipped = false;
let room = null, socket = null, connected = false, pending = false, reconnectTimer, heartbeat, retry = 0;
let toastTimer, confirmAction, savedLocal;
let shownResult = null;
let animating = false;
let clockSync = { now: Date.now(), received: performance.now() };
const isChess = () => variantOf(game) === 'chess';
const chessNames = ['', 'пешка', 'конь', 'слон', 'ладья', 'ферзь', 'король'];
let promotionMove = null;
const isChapaev = () => variantOf(game) === 'chapaev';
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { toast('Браузер не разрешает сохранение. Не закрывайте эту вкладку до конца партии.'); } }
};
const localKey = variant => variant === 'russian' ? 'shashki-local-v1' : `shashki-local-${variant}-v1`;
const localGames = {};
for (const variant of Object.keys(VARIANTS)) {
  localGames[variant] = newGame(variant);
  try {
    const saved = JSON.parse(storage.get(localKey(variant)));
    if (saved && variantOf(saved) === variant && saved.board?.length === VARIANTS[variant].size ** 2 && Array.isArray(saved.history) && Array.isArray(saved.path) && Array.isArray(saved.captured) && saved.repetitions && ['white', 'black'].includes(saved.turn)) {
      if (variant === 'chapaev' && (!Array.isArray(saved.pieces) || saved.pieces.length > 16 || saved.pieces.some(p => !Number.isInteger(p.id) || !['white', 'black'].includes(p.side) || !Number.isFinite(p.x) || !Number.isFinite(p.y)))) throw new Error('Invalid saved pieces');
      legalMoves(saved); localGames[variant] = saved;
    }
  } catch { /* Keep a fresh position if this variant's save is damaged. */ }
}
game = localGames.russian;
savedLocal = game;

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500);
}
function confirm(title, message, action, label = 'Продолжить') {
  $('confirm-title').textContent = title; $('confirm-text').textContent = message;
  $('confirm-yes').textContent = label; confirmAction = action; $('confirm-dialog').showModal();
}
function localSave() { savedLocal = game; localGames[variantOf(game)] = game; storage.set(localKey(variantOf(game)), JSON.stringify(game)); }
function serverTime() { return clockSync.now + performance.now() - clockSync.received; }
function canPlay() { return !animating && !game.winner && !expiredSide(mode === 'local' ? game.clock : room?.clock, game, mode === 'local' ? Date.now() : serverTime()) && (mode === 'local' || (room && room.ready && connected && room.role === game.turn && !pending)); }
function expireLocal() {
  if (mode !== 'local') return false;
  const now = Date.now(), loser = expiredSide(game.clock, game, now);
  if (!loser) return false;
  const next = timeoutGame(game, loser); next.clock = advanceClock(game.clock, game, next, now);
  acceptGame(next); selected = null; localSave(); render(); return true;
}
const roomChat = createRoomChat(data => {
  if (!connected || socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(data)); return true;
});
function updateClock() {
  renderClock(game, mode === 'local' ? game.clock : room?.clock, mode === 'local' ? Date.now() : serverTime(), mode === 'online' && !room?.ready, mode === 'local' || connected);
}
function pieceHTML(piece, captured = false) {
  if (isChess()) return '<span class="piece chess-piece '+sideOf(piece)+'" aria-hidden="true">'+['', '♟', '♞', '♝', '♜', '♛', '♚'][Math.abs(piece)]+'</span>';
  const skin = skinFor(sideOf(piece));
  return `<span class="piece ${sideOf(piece)} skin-${skin} ${Math.abs(piece) === 2 ? 'king' : ''} ${captured ? 'captured' : ''}">${Math.abs(piece) === 2 ? '<span class="crown">♛</span>' : ''}</span>`;
}
function skinFor(side) { return validSkin(mode === 'local' ? currentUser?.pieceSkin : room?.cosmetics?.[side]?.skin); }
function playerHTML(side) {
  const yours = room?.role === side;
  const waiting = mode === 'online' && (!room || (!room.ready && side === 'black'));
  const online = mode === 'local' || (side === room?.role ? connected : room?.online?.[side]);
  const count = isChapaev() ? game.pieces.filter(p => p.side === side).length : game.board.filter((p, i) => sideOf(p) === side && !game.captured.includes(i)).length;
  return `<div class="player-avatar">${pieceHTML(side === 'white' ? 1 : -1)}</div><div class="player-info"><div class="player-name">${waiting ? 'Ждём соперника' : (room?.names?.[side] ? '<span data-no-translate>'+escapeHTML(room.names[side])+'</span>' : names[side])}${yours ? '<span class="you-badge">это вы</span>' : ''}</div><div class="player-meta"><span class="presence ${online ? '' : 'offline'}"></span>${mode === 'local' ? 'За этой доской' : waiting ? 'Пригласите друга' : names[side] + ' · ' + (online ? 'В игре' : 'Не в сети')}</div></div>${!game.winner && game.turn === side && (mode === 'local' || room?.ready) ? '<span class="turn-label">Сейчас ходит</span>' : ''}<div class="piece-count"><span>◉</span> ${count}</div>`;
}
function renderBoard(keepDrag = false) {
  if (!keepDrag) boardDrag.cancel();
  $('board').hidden = isChapaev(); $('chapaev-board').hidden = $('shot-controls').hidden = !isChapaev();
  if (isChapaev()) {
    chapaevBoard.render(game, flipped, canPlay(), { white: skinFor('white'), black: skinFor('black') });
    $('top-player').innerHTML = playerHTML(flipped ? 'white' : 'black');
    $('bottom-player').innerHTML = playerHTML(flipped ? 'black' : 'white');
    return;
  }
  const focused = document.activeElement?.dataset?.index;
  const moves = canPlay() ? legalMoves(game) : [];
  const destinations = moves.filter(m => m.from === selected).map(m => m.to);
  const last = game.history.at(-1);
  const size = boardSize(game), total = size * size;
  $('board').dataset.size = size;
  $('board').setAttribute('aria-label', isChess() ? 'Шахматная доска' : `Шашечная доска ${size} на ${size}`);
  const indexes = Array.from({ length: total }, (_, i) => flipped ? total - 1 - i : i);
  $('board').innerHTML = indexes.map((index, visual) => {
    const row = Math.floor(index / size), col = index % size, piece = game.board[index];
    const legal = destinations.includes(index), available = moves.some(m => m.from === index);
    const highlighted = game.path.length ? game.path.includes(index) : last && (last.from === index || last.to === index);
    const label = `${squareName(index, size)}${piece ? ', ' + names[sideOf(piece)] + (isChess() ? ', ' + chessNames[Math.abs(piece)] : Math.abs(piece) === 2 ? ', дамка' : ', шашка') : ', пусто'}${legal ? ', доступный ход' : ''}`;
    return `<button class="square ${isChess() && game.check && Math.abs(piece) === 6 && sideOf(piece) === game.turn ? 'in-check' : ''} ${(row + col) % 2 ? 'dark' : ''} ${highlighted ? 'last' : ''} ${selected === index ? 'selected' : ''} ${legal ? 'legal' : ''} ${available ? 'available' : ''}" data-index="${index}" aria-label="${label}" aria-pressed="${selected === index}" ${(!isChess() && (row + col) % 2 === 0) ? 'tabindex="-1"' : ''}>${piece ? pieceHTML(piece, game.captured.includes(index)) : ''}${visual >= total - size ? `<span class="coordinate file" aria-hidden="true">${'abcdefghijkl'[col]}</span>` : ''}${visual % size === 0 ? `<span class="coordinate rank" aria-hidden="true">${size - row}</span>` : ''}</button>`;
  }).join('');
  if (focused !== undefined) $('board').querySelector(`[data-index="${focused}"]`)?.focus({ preventScroll: true });
  $('top-player').innerHTML = playerHTML(flipped ? 'white' : 'black');
  $('bottom-player').innerHTML = playerHTML(flipped ? 'black' : 'white');
}
function status() {
  if (mode === 'online' && !room) return ['Играйте на расстоянии', 'Создайте комнату или войдите по приглашению.', '↗'];
  if (animating) return game.winner && game.reason !== 'round' ? ['Красивый финал', 'Показываем анимацию победителя.', '✦'] : ['Шашки в движении', 'Дождитесь завершения удара.', '↗'];
  if (game.winner) { const result = matchResult(game, room?.role); return [result.title, result.text, result.symbol]; }
  if (mode === 'online' && !connected) return ['Соединение прервано', 'Восстанавливаем связь и вашу позицию…', '↻'];
  if (mode === 'online' && !room.ready) return ['Место для друга', 'Отправьте приглашение, чтобы начать партию.', '↗'];
  if (isChess() && game.check) return mode === 'online' && game.turn !== room.role ? ['Шах', 'Король соперника под шахом. Дождитесь его хода.', '♚'] : ['Шах вашему королю', 'Защитите короля: уйдите, закройтесь или возьмите атакующую фигуру.', '♚'];
  if (game.forced !== null) return [canPlay() ? 'Продолжайте взятие' : 'Соперник продолжает', 'Завершите цепочку ударов той же шашкой.', '↗'];
  if (mode === 'online' && game.turn !== room.role) return ['Ход соперника', room.online?.[opposite(room.role)] ? 'Пока можно обдумать следующий ход.' : 'Соперник отключился. Партия сохранена.', '…'];
  if (isChapaev()) return [mode === 'online' ? 'Ваш удар' : 'Удар ' + (game.turn === 'white' ? 'белых' : 'чёрных'), 'Оттяните свою шашку назад и отпустите. Стрелка показывает направление.', '↗'];
  if (isChess()) return [mode === 'online' ? 'Ваш ход' : game.turn === 'white' ? 'Ход белых' : 'Ход чёрных', 'Перетащите фигуру или выберите её и клетку кликом.', '♞'];
  return [mode === 'online' ? 'Ваш ход' : 'Ход ' + (game.turn === 'white' ? 'белых' : 'чёрных'), legalMoves(game).some(m => m.capture !== null) ? 'Есть взятие — нужно бить.' : 'Перетащите шашку или выберите её и клетку кликом.', '↗'];
}
function renderHistory() {
  const count = game.history.length;
  const shotsLabel = count % 10 === 1 && count % 100 !== 11 ? 'удар' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'удара' : 'ударов';
  $('move-count').textContent = count + ' ' + (isChapaev() ? shotsLabel : 'полуходов');
  if (!game.history.length) {
    $('history').innerHTML = '<div class="empty-history"><span aria-hidden="true">↗</span><p>У каждой партии есть начало.<br>Сделайте первый ход.</p></div>'; return;
  }
  const rows = [];
  if (isChapaev()) {
    game.history.forEach((move, i) => {
      const row = document.createElement('div'); row.className = 'history-row';
      for (const text of [`Р${move.round || 1} · ${i + 1}`, move.side === 'white' ? move.notation : '—', move.side === 'black' ? move.notation : '—']) {
        const cell = document.createElement('span'); cell.textContent = text; row.append(cell);
      }
      rows.push(row);
    });
    $('history').replaceChildren(...rows); $('history').scrollTop = $('history').scrollHeight; return;
  }
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
  updateBackdrop();
  renderBoard(); renderHistory();
  updateClock(); roomChat.update(mode === 'online' ? room : null, connected);
  $('variant-title').textContent = VARIANTS[variantOf(game)].name;
  $('variant-description').textContent = isChapaev() ? `Раунд ${game.round || 1} · Счёт ${game.score?.white || 0}:${game.score?.black || 0} (белые : чёрные)` : `${boardSize(game)} × ${boardSize(game)} · ${timeControl(variantOf(game)).initial / 60000} мин + 5 сек`;
  $('move-help').textContent = isChess() ? 'Перетаскивайте фигуры или нажмите на фигуру, затем на клетку.' : isChapaev() ? 'Оттяните шашку назад и отпустите. Или выберите направление и силу удара ниже доски.' : 'Перетаскивайте шашки или нажмите на шашку, затем на клетку.';
  $('board-tip').innerHTML = isChess() ? '<span aria-hidden="true">♚</span><p><strong>Берегите короля</strong><br>Рокировка — ход королём на две клетки. Цель игры — поставить мат.</p>' : isChapaev() ? '<span aria-hidden="true">↗</span><p><strong>Удары по очереди</strong><br>После каждого удара очередь переходит сопернику, даже при выбивании.</p>' : '<span aria-hidden="true">✧</span><p><strong>Маленькая подсказка</strong><br>Взятие обязательно. Если можно взять ещё одну шашку, продолжайте ход.</p>';
  $('local-note').querySelector('p').innerHTML = isChapaev() ? 'Меткость важнее силы.<br>Белые начинают, дальше — строго по очереди.' : 'Сядьте поудобнее.<br>Белые начинают, дальше — по очереди.';
  $('flip-button').disabled = animating;
  const [title, text, icon] = status();
  $('status-title').textContent = title; $('status-text').textContent = text; $('status-icon').textContent = icon;
  $('game-panel-title').textContent = mode === 'local' ? 'За одной доской' : 'С другом онлайн';
  $('mode-badge').textContent = mode === 'local' ? 'ЛОКАЛЬНО' : 'ОНЛАЙН';
  $('online-controls').hidden = mode === 'local'; $('local-note').hidden = mode !== 'local';
  $('online-lobby').hidden = !!room; $('room-controls').hidden = !room;
  $('board-caption').textContent = (mode === 'local' ? 'Два игрока, одно устройство' : room ? 'Комната ' + room.code : 'Пригласите друга за доску') + (isChapaev() ? ` · Раунд ${game.round || 1} · ${game.score?.white || 0}:${game.score?.black || 0}` : '');
  $('new-button').textContent = room ? '↗ Покинуть комнату' : '↻ Новая партия';
  $('new-button').hidden = mode === 'online' && !room;
  $('match-actions').hidden = !!game.winner || (mode === 'online' && !room?.ready);
  $('resign-button').disabled = animating || !!game.winner || (mode === 'online' && (!connected || !room?.ready || pending));
  $('draw-button').disabled = animating || !!game.winner || (mode === 'online' && (!connected || pending || !!room?.drawOffer));
  $('draw-button').textContent = room?.drawOffer && room.drawOffer === room.role ? 'Ничья предложена' : 'Предложить ничью';
  $('draw-notice').hidden = !room?.drawOffer || room.drawOffer === room.role || !!game.winner;
  $('accept-draw').disabled = $('decline-draw').disabled = !connected || pending;
  $('rematch-button').hidden = !game.winner || (mode === 'online' && !room);
  $('rematch-button').disabled = animating || (mode === 'online' && (!connected || pending || room?.rematch?.includes(room.role)));
  $('rematch-button').textContent = room?.rematch?.includes(room.role) ? 'Ждём согласия соперника…' : game.reason === 'round' ? 'Следующий раунд →' : room?.rematch?.length ? 'Принять реванш ↻' : 'Реванш ↻';
  if (room) {
    $('room-code').textContent = room.code; $('connection-label').textContent = connected ? '● На связи' : '○ Нет связи';
    $('room-hint').textContent = room.ready ? (room.accountBound?.[room.role] ? 'Ваше место привязано к аккаунту.' : 'Ваше место сохранено в этом браузере.') : 'Отправьте ссылку другу. Вы играете белыми.';
  }
  renderResult();
}

function renderResult() {
  const dialog = $('result-dialog');
  if (!game.winner || animating || $('game-screen').hidden) {
    dialog.close(); shownResult = null; return;
  }
  const result = matchResult(game, room?.role);
  dialog.dataset.result = result.kind;
  $('result-stage').textContent = game.reason === 'round' ? 'РАУНД ЗАВЕРШЁН' : 'ПАРТИЯ ЗАВЕРШЕНА';
  $('result-title').textContent = result.title;
  $('result-text').textContent = result.text;
  $('result-symbol').textContent = result.symbol;
  $('result-rematch').textContent = $('rematch-button').textContent;
  $('result-rematch').disabled = $('rematch-button').disabled;
  $('result-hint').textContent = mode === 'local' ? 'Новая партия на этой же доске. Белые начинают.' : !connected ? 'Восстанавливаем соединение с комнатой…' : room.rematch?.includes(room.role) ? 'Предложение отправлено. Новая партия начнётся, когда соперник согласится.' : room.rematch?.length ? 'Соперник предлагает сыграть ещё раз. Примите реванш, чтобы начать.' : 'Реванш начнётся, когда оба игрока согласятся.';
  if (game.reason === 'round') $('result-hint').textContent = (mode === 'online' ? 'Следующий раунд начнётся, когда оба игрока будут готовы. ' : '') + `Очередь сохраняется: следующий удар у ${game.turn === 'white' ? 'белых' : 'чёрных'}.`;
  const key = `${room?.code || 'local'}:${game.revision}:${game.winner}`;
  if (shownResult !== key) {
    shownResult = key;
    document.querySelectorAll('dialog[open]').forEach(open => open.close());
    confirmAction = null; dialog.showModal();
  }
}
function playMove(from, to, promotion) {
  if (expireLocal()) return;
  if (isChess() && !promotion && legalMoves(game).some(move => move.from === from && move.to === to && move.promotion)) {
    if (!canPlay()) return;
    promotionMove = { from, to, revision: game.revision, code: room?.code };
    $('promotion-dialog').showModal(); return;
  }
  if (!canPlay() || !legalMoves(game).some(move => move.from === from && move.to === to)) return;
  if (mode === 'online') send({ type: 'move', from, to, ...(promotion ? { promotion } : {}) });
  else { const next = applyMove(game, from, to, promotion); next.clock = advanceClock(game.clock, game, next, Date.now()); acceptGame(next); selected = game.forced; localSave(); render(); }
}
document.querySelectorAll('[data-promotion]').forEach(button => { button.onclick = () => {
  const move = promotionMove; $('promotion-dialog').close();
  if (move && move.revision === game.revision && move.code === room?.code) playMove(move.from, move.to, button.dataset.promotion);
}; });
$('promotion-dialog').addEventListener('close', () => { promotionMove = null; });
const boardDrag = attachBoardDrag($('board'), {
  moves: () => canPlay() ? legalMoves(game) : [],
  select: from => { selected = from; renderBoard(true); },
  move: playMove
});
const chapaevBoard = createChapaevBoard({
  impact: () => sounds.play('impact'),
  shoot(id, dx, dy) {
    if (!canPlay()) return;
    if (mode === 'online') send({ type: 'shot', id, dx, dy });
    else {
      try { acceptGame(applyShot(game, id, dx, dy)); localSave(); render(); }
      catch (error) { toast(error.message); }
    }
  }
});
function acceptGame(next, audible = true) {
  const previous = game; game = next;
  if (mode === 'local' && next.winner && next.reason !== 'round') next.finishEffect = next.reason === 'resign' ? currentUser?.finishEffect || 'none' : currentUser?.victoryEffect || 'none';
  const finishing = isFinishTransition(previous, next, audible);
  const shot = audible && next.variant === 'chapaev' && previous.variant === 'chapaev' && next.revision === previous.revision + 1 && next.lastShot?.revision === next.revision;
  const showFinish = () => {
    chapaevBoard.cancel(); animating = true;
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    confirmAction = null;
    rocketEffect.launch(next.winner === (flipped ? 'white' : 'black'), () => {
      animating = false; sounds.transition(previous, next, room?.role); render();
    }, next.finishEffect);
  };
  if (finishing && !shot) {
    showFinish();
    return;
  }
  if (previous.revision !== next.revision || previous.variant !== next.variant) rocketEffect.cancel();
  if (audible && previous.reason === 'round' && next.variant === 'chapaev' && !next.winner && next.round === (previous.round || 1) + 1 && next.revision === previous.revision + 1) {
    animating = true; sounds.play('start');
    chapaevBoard.animateRound(previous, next, () => { animating = false; render(); });
    return;
  }
  if (shot) {
    animating = true; sounds.play('move');
    chapaevBoard.animate(previous, next, () => {
      if (finishing) { renderBoard(); showFinish(); }
      else { animating = false; sounds.transition(previous, next, room?.role, true); }
      render();
    });
  } else {
    if (previous.revision !== next.revision || previous.variant !== next.variant) { chapaevBoard.cancel(); animating = false; }
    if (audible) sounds.transition(previous, next, room?.role);
  }
}
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
  const size = boardSize(game);
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -size, ArrowDown: size }[event.key];
  if (!delta || !event.target.dataset.index) return;
  event.preventDefault();
  const next = Number(event.target.dataset.index) + delta * (flipped ? -1 : 1);
  if (Math.abs(delta) === 1 && Math.floor(next / size) !== Math.floor(Number(event.target.dataset.index) / size)) return;
  $('board').querySelector(`[data-index="${next}"]`)?.focus();
});

async function api(path, data = {}) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Не удалось подключиться.');
  return result;
}
function disconnect() {
  rocketEffect.cancel();
  chapaevBoard.cancel(); animating = false;
  clearTimeout(reconnectTimer); clearInterval(heartbeat);
  const previous = socket; socket = null;
  if (previous) previous.close();
  connected = false; pending = false;
}
function applySnapshot(data, audible = true) {
  const changed = game.revision !== data.game.revision;
  acceptGame(data.game, audible);
  Object.assign(room, { ready: data.ready, online: data.online, rematch: data.rematch, drawOffer: data.drawOffer, names: data.names, cosmetics: data.cosmetics, accountBound: data.accountBound, clock: data.clock, chat: data.chat });
  if (Number.isFinite(data.serverNow)) clockSync = { now: data.serverNow, received: performance.now() };
  if (changed || game.forced !== null) selected = game.turn === room.role ? game.forced : null;
  pending = false; render();
}
function connect() {
  if (!room) return;
  clearTimeout(reconnectTimer);
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/rooms/${room.code}/socket`, ['checkers', room.token]);
  socket = ws; let lastPong = Date.now(), firstSnapshot = true;
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
      if (data.type === 'state') { applySnapshot(data, !firstSnapshot); firstSnapshot = false; }
      if (data.type === 'chat') room.chat = roomChat.receive(data.message);
      if (data.type === 'error') {
        if (data.context === 'chat') roomChat.error(data.message);
        else { pending = false; toast(data.message); render(); }
      }
    } catch { toast('Не удалось обновить позицию. Перезагрузите страницу.'); }
  };
  ws.onclose = event => {
    if (socket !== ws) return;
    clearInterval(heartbeat); connected = false; pending = false; render();
    if (event.code === 4003) {
      $('status-title').textContent = 'Войдите в аккаунт';
      $('status-text').textContent = 'Сессия закончилась. Войдите снова и откройте ссылку на комнату.';
      return;
    }
    if (event.code === 4001 || event.code === 4004) {
      $('status-title').textContent = event.code === 4001 ? 'Игра в другой вкладке' : 'Комната закрыта';
      $('status-text').textContent = event.code === 4001 ? 'Продолжайте там или обновите эту страницу.' : 'Комната удалена после часа без игровых действий. Создайте новую партию.';
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
  if (Number.isFinite(data.serverNow)) clockSync = { now: data.serverNow, received: performance.now() };
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
  rocketEffect.cancel();
  chapaevBoard.cancel(); animating = false;
  boardDrag.cancel();
  $('home-screen').hidden = screen !== 'home';
  $('game-screen').hidden = screen !== 'game';
  updateBackdrop();
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
function updateBackdrop() {
  const variant = $('game-screen').hidden ? $('start-form').elements.variant.value : variantOf(game);
  if (document.body.dataset.backdrop !== variant) document.body.dataset.backdrop = variant;
}
const pauseAmbient = () => document.body.classList.toggle('ambient-paused', document.hidden);
document.addEventListener('visibilitychange', pauseAmbient);
pauseAmbient();
function updateStart() {
  updateBackdrop();
  const local = $('start-form').elements['play-mode'].value === 'local';
  const saved = localGames[$('start-form').elements.variant.value];
  const resume = local && (!saved.winner || saved.reason === 'round') && (saved.history.length || saved.path.length);
  $('start-button').innerHTML = `${local ? resume ? 'Продолжить партию' : 'Начать партию' : 'Создать комнату'} <span aria-hidden="true">↗</span>`;
  $('start-hint').textContent = local ? resume ? 'Ваша партия сохранена. Продолжите с последнего хода.' : 'Белые начинают. Передавайте ход друг другу.' : 'Комната будет готова сразу. Останется пригласить друга.';
}
$('home-button').onclick = goHome;
document.querySelector('.brand').onclick = event => { event.preventDefault(); goHome(); };
$('start-form').onchange = updateStart;
$('start-form').onsubmit = async event => {
  event.preventDefault();
  if ($('start-button').disabled) return;
  const variant = $('start-form').elements.variant.value;
  if ($('start-form').elements['play-mode'].value === 'local') {
    mode = 'local'; game = localGames[variant]; savedLocal = game;
    if (game.winner && game.reason !== 'round') { game = newGame(variant); localSave(); }
    if (!game.clock && !game.winner) game.clock = createClock(variant, Date.now());
    localSave();
    sounds.play('start');
    selected = game.forced; flipped = false; showScreen('game'); render();
    return;
  }
  $('start-button').disabled = true; $('home-join-button').disabled = true;
  $('start-button').textContent = 'Создаём комнату…';
  try { const data = await api('/api/rooms', { variant }); enterRoom(data.code, data); sounds.play('start'); }
  catch (error) { toast(error.message || 'Не удалось создать комнату. Попробуйте ещё раз.'); }
  finally { $('start-button').disabled = false; $('home-join-button').disabled = false; updateStart(); }
};
$('flip-button').onclick = () => { flipped = !flipped; renderBoard(); };
$('rules-button').onclick = () => {
  const variant = $('game-screen').hidden ? $('start-form').elements.variant.value : variantOf(game);
  $('chess-rules').hidden = variant !== 'chess'; $('draughts-rules').hidden = ['chapaev', 'chess'].includes(variant); $('chapaev-rules').hidden = variant !== 'chapaev';
  $('rules-variant').textContent = variant === 'chess' ? 'Классические шахматы. Белые начинают, взятие не обязательно.' : variant === 'chapaev' ? 'Чапаев: партия из раундов на доске 8×8. Выигрывайте раунды и оттесняйте соперника к краю.' : variant === 'russian12' ? 'Доска 12×12, по 30 шашек. Русские правила на большой доске: можно выбрать любое взятие, брать максимум не обязательно.' : 'Доска 8×8, по 12 шашек. Классические русские правила.';
  $('rules-dialog').showModal();
};
$('join-button').onclick = () => { $('join-error').textContent = ''; $('join-dialog').showModal(); };
$('home-join-button').onclick = $('join-button').onclick;
$('settings-button').onclick = () => { closeAccountMenu(); $('settings-dialog').showModal(); };
$('settings-back').onclick = () => $('settings-dialog').close();
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => $(button.dataset.close).close(); });
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
}));
$('confirm-yes').onclick = () => { $('confirm-dialog').close(); confirmAction?.(); };
$('create-button').onclick = async () => {
  $('create-button').disabled = true;
  try { const data = await api('/api/rooms', { variant: $('start-form').elements.variant.value }); enterRoom(data.code, data); sounds.play('start'); }
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
function resetLocal() { chapaevBoard.cancel(); animating = false; game = newGame(variantOf(game)); game.clock = createClock(variantOf(game), Date.now()); selected = null; localSave(); sounds.play('start'); render(); }
$('new-button').onclick = () => {
  if (room) confirm('Покинуть комнату?', 'Партия сохранится. Вы сможете вернуться по той же ссылке в этом браузере.', () => { leave(); mode = 'online'; game = newGame(); render(); }, 'Покинуть');
  else if (game.history.length || game.path.length) confirm('Начать новую партию?', 'Текущая локальная партия будет заменена новой.', resetLocal, 'Начать заново');
  else resetLocal();
};
function finishLocal(winner, reason) {
  if (expireLocal()) return;
  const next = structuredClone(game);
  next.winner = winner; next.reason = reason; next.revision++;
  next.finishEffect = reason === 'resign' ? currentUser?.finishEffect || 'none' : 'none';
  next.clock = advanceClock(game.clock, game, next, Date.now());
  acceptGame(next); selected = null; localSave(); render();
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
function rematch() {
  if (!game.winner || animating) return;
  if (mode === 'online') send({ type: 'rematch' });
  else if (game.reason === 'round') { acceptGame(nextChapaevRound(game)); localSave(); render(); }
  else resetLocal();
}
$('rematch-button').onclick = $('result-rematch').onclick = rematch;
$('result-home').onclick = () => { $('result-dialog').close(); goHome(); };
$('draw-button').onclick = () => {
  if (mode === 'online') send({ type: 'draw' });
  else confirmMatch(`${names[opposite(game.turn)]}, согласны на ничью?`, `${names[game.turn]} предлагают завершить партию вничью. Передайте решение сопернику.`, () => finishLocal('draw', 'agreement'), 'Принять ничью');
};
$('accept-draw').onclick = () => send({ type: 'draw' });
$('decline-draw').onclick = () => send({ type: 'decline-draw' });

document.addEventListener('accountchange', async () => {
  if (!room) { render(); return; }
  const code = room.code;
  disconnect();
  try { await join(code); }
  catch (error) { leave(); mode = 'local'; showScreen('home'); render(); toast(error.message); }
});
updateStart(); render();
setInterval(() => {
  if ($('game-screen').hidden) return;
  if (!expireLocal()) updateClock();
}, 200);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('game-screen').hidden) { expireLocal(); updateClock(); } });
await authReady;
render();
const invite = new URL(location.href).searchParams.get('room');
if (invite) {
  mode = 'online'; showScreen('game'); render(); $('status-title').textContent = 'Открываем комнату…';
  try { await join(extractCode(invite)); }
  catch (error) { toast(error.message); $('status-title').textContent = 'Не удалось войти'; $('status-text').textContent = error.message; }
}
