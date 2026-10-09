ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0 CHECK(is_admin IN (0, 1));
UPDATE users SET is_admin = 1 WHERE email = 'kkoallqq@gmail.com' AND email_verified = 1 AND google_sub IS NOT NULL;
CREATE TABLE admin_audit (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK(action IN ('grant_shop', 'revoke_shop')),
  created_at INTEGER NOT NULL
);
CREATE INDEX admin_audit_time ON admin_audit(created_at DESC);
