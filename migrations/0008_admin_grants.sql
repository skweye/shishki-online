CREATE TABLE admin_audit_expanded (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK(action IN ('grant_shop', 'revoke_shop', 'grant_admin')),
  created_at INTEGER NOT NULL
);
INSERT INTO admin_audit_expanded SELECT id, actor_id, target_id, action, created_at FROM admin_audit;
DROP TABLE admin_audit;
ALTER TABLE admin_audit_expanded RENAME TO admin_audit;
CREATE INDEX admin_audit_time ON admin_audit(created_at DESC);
