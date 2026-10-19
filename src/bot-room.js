import { applyMove } from '../public/game.js';
import { applyShot } from '../public/chapaev.js';
import { rollNarde, randomDice } from '../public/narde.js';
import { applyPoolShot, placePoolCue } from '../public/pool.js';
import { actDurak } from '../public/durak.js';
import { actDomino, readyDominoRound } from '../public/domino.js';
import { actBattleship } from '../public/battleship.js';

export function botNeeded(room) {
  if (!room.bot) return false;
  const g = room.game;
  if (g.winner) return room.rematch.includes('white');
  if (room.drawOffer === 'white') return true;
  if (g.variant === 'battleship' && g.phase === 'setup') return !g.ready.black;
  if (g.variant === 'domino' && g.roundResult) return !g.readyNext.includes('black');
  return g.turn === 'black';
}
export function botDelay(game) {
  // Leave the existing animation enough time to finish before the next update.
  if (game.lastShot?.revision === game.revision) return 800 + 1000 * (game.lastShot.duration ?? 10) / (game.variant === 'chapaev' ? .8 : 1);
  if (game.variant === 'chapaev' && game.round > 1 && !game.lastShot) return 1800;
  if (game.variant === 'narde' && game.lastAction?.kind === 'roll') return 2200;
  if (game.variant === 'battleship' && game.lastSeaShot?.result === 'sunk') return 2200;
  if (game.variant?.startsWith('durak-')) return 1600;
  return 850;
}
export function applyBotAction(game, side, action) {
  if (!action) throw Error('Bot has no legal action');
  if (action.type === 'fleet-ready' || action.type === 'sea-fire') return actBattleship(game, side, action);
  if (action.type === 'domino-ready') return readyDominoRound(game, side);
  if (game.turn !== side || game.winner) throw Error('Bot action out of turn');
  if (action.type.startsWith('durak-')) return actDurak(game, side, action);
  if (action.type.startsWith('domino-')) return actDomino(game, action);
  if (action.type === 'roll') return rollNarde(game, randomDice(game.opening));
  if (action.type === 'pool-place') return placePoolCue(game, action.x, action.y);
  if (action.type === 'pool-shot') return applyPoolShot(game, action);
  if (action.type === 'shot') return applyShot(game, action.id, action.dx, action.dy);
  if (action.type === 'move') return applyMove(game, action.from, action.to, action.promotion);
  throw Error('Unknown bot action');
}
