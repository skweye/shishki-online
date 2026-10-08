CREATE TABLE account_results (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  result TEXT NOT NULL CHECK(result IN ('win','loss','draw')),
  moves INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, match_id)
);
CREATE INDEX account_results_recent ON account_results(user_id, finished_at DESC);
CREATE TABLE account_rooms (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  PRIMARY KEY(user_id, code)
);
