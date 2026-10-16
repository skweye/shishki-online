ALTER TABLE users ADD COLUMN owner_pranks INTEGER NOT NULL DEFAULT 0 CHECK(owner_pranks IN (0,1));
-- Only the existing verified owner; recreating the account never inherits access.
UPDATE users SET owner_pranks=1 WHERE email='kkoallqq@gmail.com' AND email_verified=1 AND google_sub IS NOT NULL;
-- Administrators cannot transfer this private capability, even through direct updates.
CREATE TRIGGER owner_pranks_restrict_insert BEFORE INSERT ON users
WHEN NEW.owner_pranks=1 BEGIN SELECT RAISE(ABORT,'Owner capability cannot be granted'); END;
CREATE TRIGGER owner_pranks_restrict_update BEFORE UPDATE OF owner_pranks ON users
WHEN NEW.owner_pranks=1 AND OLD.owner_pranks=0 BEGIN SELECT RAISE(ABORT,'Owner capability cannot be granted'); END;
