import { newGame, validVariant } from '../public/game.js';
import { createClock } from '../public/time-control.js';

export const friendCommands = new Set(['room-select','room-ready','room-lobby','room-stay']);
export function createLobby(variant) { return {phase:'lobby',variant,revision:0,ready:[],returnOffer:null}; }

// Both seats share one selection. Readiness belongs to that exact selection;
// delayed clicks cannot start a different game or reset a running match.
export function friendAction(room, role, data, now = Date.now()) {
  const lobby = room.lobby;
  if (!lobby || !['white','black'].includes(role) || !room.players[role]) throw Error('Действие сейчас недоступно.');
  if (data.lobbyRevision !== lobby.revision) throw Error('Выбор игры изменился. Повторите действие.');
  if (data.type === 'room-stay') {
    if (lobby.phase !== 'playing' || !lobby.returnOffer) throw Error('Действие сейчас недоступно.');
    lobby.returnOffer = null;
    return;
  }
  if (data.type === 'room-lobby') {
    if (lobby.phase !== 'playing') throw Error('Действие сейчас недоступно.');
    if ((room.game.winner && room.game.reason !== 'round') || !room.players.black || (lobby.returnOffer && lobby.returnOffer !== role)) {
      lobby.phase = 'lobby'; lobby.ready = []; lobby.returnOffer = null; lobby.revision++;
      room.clock = null; room.drawOffer = null; room.rematch = [];
      room.game.revision++;
    } else { lobby.returnOffer = role; room.drawOffer = null; }
    return;
  }
  if (lobby.phase !== 'lobby') throw Error('Выбор игры доступен в комнате между партиями.');
  if (data.type === 'room-select') {
    if (!validVariant(data.variant)) throw Error('Неизвестный режим игры.');
    if (data.variant !== lobby.variant) { lobby.variant = data.variant; lobby.ready = []; lobby.revision++; }
    return;
  }
  if (data.type !== 'room-ready' || typeof data.ready !== 'boolean') throw Error('Некорректный запрос.');
  lobby.ready = lobby.ready.filter(side => side !== role);
  if (data.ready) lobby.ready.push(role);
  if (lobby.ready.length !== 2 || !room.players.black) return;
  const revision = room.game.revision + 1;
  room.game = newGame(lobby.variant); room.game.revision = revision;
  room.matchId = crypto.randomUUID(); room.resultRecorded = false;
  room.clock = createClock(lobby.variant, now); room.rematch = []; room.drawOffer = null;
  lobby.phase = 'playing'; lobby.ready = []; lobby.returnOffer = null; lobby.revision++;
}
