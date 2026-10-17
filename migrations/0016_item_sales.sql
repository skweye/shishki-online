-- Free full-access previews must never turn into an unlimited source of coins.
CREATE TABLE non_resalable_items (
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  PRIMARY KEY(user_id,item_id),
  FOREIGN KEY(user_id,item_id) REFERENCES account_items(user_id,item_id) ON DELETE CASCADE
);
INSERT INTO non_resalable_items(user_id,item_id)
SELECT i.user_id,i.item_id FROM account_items i WHERE i.paid_price=0
  AND EXISTS(SELECT 1 FROM case_openings c WHERE c.user_id=i.user_id AND c.item_id=i.item_id AND c.source='access' AND c.duplicate=0)
  AND NOT EXISTS(SELECT 1 FROM case_openings c WHERE c.user_id=i.user_id AND c.item_id=i.item_id AND c.source!='access' AND c.duplicate=0);
DROP TRIGGER open_case_award;
CREATE TRIGGER open_case_award AFTER INSERT ON case_openings
BEGIN
  UPDATE case_openings SET duplicate=EXISTS(SELECT 1 FROM account_items WHERE user_id=NEW.user_id AND item_id=NEW.item_id)
    WHERE user_id=NEW.user_id AND request_id=NEW.request_id;
  UPDATE account_wallets SET balance=balance-NEW.cost+CASE WHEN NEW.source!='access' AND
    (SELECT duplicate FROM case_openings WHERE user_id=NEW.user_id AND request_id=NEW.request_id)=1 THEN NEW.compensation ELSE 0 END
    WHERE user_id=NEW.user_id;
  INSERT OR IGNORE INTO account_items(user_id,item_id,paid_price,purchased_at) VALUES(NEW.user_id,NEW.item_id,0,NEW.opened_at);
  INSERT OR IGNORE INTO non_resalable_items(user_id,item_id)
    SELECT NEW.user_id,NEW.item_id WHERE NEW.source='access'
      AND (SELECT duplicate FROM case_openings WHERE user_id=NEW.user_id AND request_id=NEW.request_id)=0;
END;

CREATE TABLE item_sales (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK(item_type IN ('skin','cue','ship','card','effect')),
  item_value TEXT NOT NULL,
  credit INTEGER NOT NULL CHECK(credit>0),
  sold_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,request_id)
);
CREATE TRIGGER item_sale_guard BEFORE INSERT ON item_sales
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM account_items WHERE user_id=NEW.user_id AND item_id=NEW.item_id)
    OR EXISTS(SELECT 1 FROM non_resalable_items WHERE user_id=NEW.user_id AND item_id=NEW.item_id)
    OR COALESCE((SELECT shop_access FROM users WHERE id=NEW.user_id),0)=1
    THEN RAISE(ABORT,'sale_not_owned') END;
END;
-- Deletion, equipment reset, and credit are atomic, including concurrent requests.
CREATE TRIGGER item_sale_credit AFTER INSERT ON item_sales
BEGIN
  DELETE FROM account_items WHERE user_id=NEW.user_id AND item_id=NEW.item_id;
  UPDATE account_wallets SET balance=balance+NEW.credit WHERE user_id=NEW.user_id;
  UPDATE users SET
    piece_skin=CASE WHEN NEW.item_type='skin' AND piece_skin=NEW.item_value THEN 'classic' ELSE piece_skin END,
    cue_skin=CASE WHEN NEW.item_type='cue' AND cue_skin=NEW.item_value THEN 'classic' ELSE cue_skin END,
    ship_skin=CASE WHEN NEW.item_type='ship' AND ship_skin=NEW.item_value THEN 'classic' ELSE ship_skin END,
    card_skin=CASE WHEN NEW.item_type='card' AND card_skin=NEW.item_value THEN 'classic' ELSE card_skin END,
    finish_effect=CASE WHEN NEW.item_type='effect' AND finish_effect=NEW.item_value THEN 'none' ELSE finish_effect END,
    victory_effect=CASE WHEN NEW.item_type='effect' AND victory_effect=NEW.item_value THEN 'none' ELSE victory_effect END
    WHERE id=NEW.user_id;
END;
