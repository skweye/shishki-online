ALTER TABLE users ADD COLUMN admin_level INTEGER NOT NULL DEFAULT 0 CHECK(admin_level BETWEEN 0 AND 3);
UPDATE users SET admin_level=2 WHERE is_admin=1;
UPDATE users SET admin_level=3 WHERE email='kkoallqq@gmail.com' AND is_admin=1 AND email_verified=1;
CREATE TRIGGER sync_admin_flag AFTER UPDATE OF admin_level ON users
BEGIN
  UPDATE users SET is_admin=(NEW.admin_level>0) WHERE id=NEW.id;
END;

CREATE TABLE admin_audit_levels (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK(action IN ('grant_shop','revoke_shop','grant_admin','set_level','grant_coins')),
  created_at INTEGER NOT NULL,
  from_level INTEGER,
  to_level INTEGER,
  amount INTEGER,
  request_id TEXT,
  UNIQUE(actor_id,request_id)
);
INSERT INTO admin_audit_levels(id,actor_id,target_id,action,created_at)
SELECT id,actor_id,target_id,action,created_at FROM admin_audit;
DROP TABLE admin_audit;
ALTER TABLE admin_audit_levels RENAME TO admin_audit;
CREATE INDEX admin_audit_time ON admin_audit(created_at DESC);

-- Recheck hierarchy in the same statement that grants the coins.
CREATE TRIGGER admin_coin_guard BEFORE INSERT ON admin_audit WHEN NEW.action='grant_coins'
BEGIN
  SELECT CASE WHEN NEW.amount IS NULL OR typeof(NEW.amount)!='integer' OR NEW.amount<1 OR NEW.amount>1000000 OR NEW.request_id IS NULL
    THEN RAISE(ABORT,'invalid_coin_grant') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users actor JOIN users target ON target.id=NEW.target_id
    WHERE actor.id=NEW.actor_id AND actor.admin_level>=2 AND
    (actor.admin_level>target.admin_level OR (actor.admin_level=3 AND actor.id=target.id)))
    THEN RAISE(ABORT,'admin_hierarchy') END;
  SELECT CASE WHEN COALESCE((SELECT balance FROM account_wallets WHERE user_id=NEW.target_id),100)+NEW.amount>1000000000000
    THEN RAISE(ABORT,'coin_balance_limit') END;
END;
CREATE TRIGGER admin_coin_award AFTER INSERT ON admin_audit WHEN NEW.action='grant_coins'
BEGIN
  INSERT INTO account_wallets(user_id,balance) VALUES(NEW.target_id,100+NEW.amount)
  ON CONFLICT(user_id) DO UPDATE SET balance=balance+NEW.amount;
END;
