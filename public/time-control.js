export function timeControl(variant) {
  return ['chapaev','narde'].includes(variant) ? null : { initial: variant === 'russian12' ? 600000 : 300000, increment: 5000 };
}
export function createClock(variant, startedAt = null) {
  const control = timeControl(variant);
  return control ? { white: control.initial, black: control.initial, increment: control.increment, startedAt } : null;
}
export function remainingTime(clock, turn, now) {
  if (!clock) return null;
  const elapsed = clock.startedAt === null ? 0 : Math.max(0, now - clock.startedAt);
  return { white: Math.max(0, clock.white - (turn === 'white' ? elapsed : 0)), black: Math.max(0, clock.black - (turn === 'black' ? elapsed : 0)) };
}
export function expiredSide(clock, game, now) {
  return clock && clock.startedAt !== null && !game.winner && remainingTime(clock, game.turn, now)[game.turn] <= 0 ? game.turn : null;
}
export function advanceClock(clock, before, after, now) {
  if (!clock) return null;
  const remaining = remainingTime(clock, before.turn, now);
  // A chain of draughts captures is one turn. Offers and resignations earn no bonus.
  if (after.history.length > before.history.length && after.forced === null) remaining[before.turn] += clock.increment;
  return { ...clock, ...remaining, startedAt: after.winner ? null : now };
}
export function timeoutGame(game, loser) {
  return { ...game, winner: loser === 'white' ? 'black' : 'white', reason: 'timeout', revision: game.revision + 1 };
}
export function clockDeadline(clock, game) {
  return clock && clock.startedAt !== null && !game.winner ? clock.startedAt + clock[game.turn] : Infinity;
}
export function formatClock(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
