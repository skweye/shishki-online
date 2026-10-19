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
export function botDelay(game, previous) {
  // Leave the existing animation enough time to finish before the next update.
  if (game.lastShot?.revision === game.revision) return 250 + 1000 * (game.lastShot.duration ?? 10) / (game.variant === 'chapaev' ? .8 : 1);
  if (game.variant === 'chapaev' && game.round > 1 && !game.lastShot) return 950;
  if (game.variant === 'narde' && game.lastAction?.kind === 'roll') return 1250;
  if (game.variant === 'battleship' && game.lastSeaShot?.revision === game.revision) return game.lastSeaShot.result === 'sunk' ? 2100 : 1150;
  if (game.variant?.startsWith('durak-')) {
    if (!previous || previous.dealId !== game.dealId) return 1200;
    if (previous.table.length && !game.table.length) {
      const cards = previous.table.reduce((n, p) => n + 1 + Number(p.defend !== null), 0);
      const drawn = previous.stock.length - game.stock.length;
      return 420 + Math.max(0, cards - 1) * 45 + (drawn ? (drawn - 1) * 75 + 380 : 0) + 60;
    }
    return 400;
  }
  return 100;
}

export const botPreviewDuration = action => ['pool-shot', 'shot'].includes(action.type) ? 420 : action.type === 'pool-place' ? 280 : 180;
// Explicit allowlist: planned cards, tiles and fleets remain server-private.
export function botPreview(room) {
  const plan = room.botPlan;
  if (!room.bot || !plan || plan.revision !== room.game.revision || room.game.winner || room.drawOffer) return null;
  const a = plan.action, preview = { revision: plan.revision, kind: a.type, role: 'black', executeAt: plan.executeAt };
  if (a.type === 'pool-shot') Object.assign(preview, { angle: Math.atan2(a.dy, a.dx) * 180 / Math.PI, power: Math.min(1, Math.hypot(a.dx, a.dy)), placing: false });
  else if (a.type === 'shot') Object.assign(preview, { id: a.id, dx: a.dx, dy: a.dy });
  else if (a.type === 'move') Object.assign(preview, { from: a.from, to: a.to });
  else if (a.type === 'pool-place') Object.assign(preview, { x: a.x, y: a.y });
  else if (a.type === 'sea-fire') preview.cell = a.cell;
  else if (a.type === 'domino-play') preview.end = a.end;
  else if (a.type === 'durak-defend') preview.target = a.target;
  return preview;
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
