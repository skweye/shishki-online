ALTER TABLE users ADD COLUMN piece_skin TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE users ADD COLUMN finish_effect TEXT NOT NULL DEFAULT 'none';
ALTER TABLE account_results ADD COLUMN coins INTEGER NOT NULL DEFAULT 0;

CREATE TABLE account_wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 100 CHECK (balance >= 0)
);
CREATE TABLE account_items (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  paid_price INTEGER NOT NULL CHECK (paid_price >= 0),
  purchased_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

-- A result and its reward commit together. Replayed results cannot pay twice.
CREATE TRIGGER award_match_coins AFTER INSERT ON account_results
BEGIN
  INSERT INTO account_wallets(user_id, balance) VALUES (NEW.user_id, 100 + NEW.coins)
  ON CONFLICT(user_id) DO UPDATE SET balance = balance + NEW.coins;
END;

-- Ownership and payment are one transaction, even for simultaneous requests.
CREATE TRIGGER pay_for_item AFTER INSERT ON account_items
BEGIN
  UPDATE account_wallets SET balance = balance - NEW.paid_price WHERE user_id = NEW.user_id;
END;
