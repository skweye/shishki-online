import { matchCoins } from '../public/shop-catalog.js';

export async function accountStats(env, userId) {
  const [summary, recent] = await env.AUTH_DB.batch([
    env.AUTH_DB.prepare(`SELECT variant, COUNT(*) AS played,
      SUM(result = 'win') AS wins, SUM(result = 'loss') AS losses, SUM(result = 'draw') AS draws
      FROM account_results WHERE user_id = ? GROUP BY variant`).bind(userId),
    env.AUTH_DB.prepare('SELECT variant, result, moves, finished_at, coins FROM account_results WHERE user_id = ? ORDER BY finished_at DESC LIMIT 20').bind(userId)
  ]);
  return { modes: summary.results, recent: recent.results };
}
export async function writeResults(env, results) {
  if (!results.length) return;
  await env.AUTH_DB.batch(results.map(row => env.AUTH_DB.prepare(`INSERT OR IGNORE INTO account_results
    (user_id, match_id, variant, result, moves, finished_at, coins)
    SELECT id, ?, ?, ?, ?, ?, ? FROM users WHERE id = ?`)
    .bind(row.matchId, row.variant, row.result, row.moves, row.finishedAt, matchCoins(row.result, row.moves), row.userId)));
}
