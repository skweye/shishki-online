CREATE TABLE account_progress (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp INTEGER NOT NULL DEFAULT 0 CHECK(xp >= 0)
);
-- Existing finished matches count too. The result primary key prevents repeat XP.
INSERT INTO account_progress(user_id,xp)
SELECT user_id,SUM(CASE WHEN moves>=4 THEN CASE result WHEN 'win' THEN 100 WHEN 'draw' THEN 60 ELSE 40 END ELSE 0 END)
FROM account_results GROUP BY user_id;
CREATE TRIGGER award_match_xp AFTER INSERT ON account_results
BEGIN
  INSERT INTO account_progress(user_id,xp) VALUES(NEW.user_id,
    CASE WHEN NEW.moves>=4 THEN CASE NEW.result WHEN 'win' THEN 100 WHEN 'draw' THEN 60 ELSE 40 END ELSE 0 END)
  ON CONFLICT(user_id) DO UPDATE SET xp=xp+excluded.xp;
END;
CREATE TABLE case_openings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  case_id TEXT NOT NULL CHECK(case_id IN ('standard','premium','royal')),
  source TEXT NOT NULL CHECK(source IN ('coins','reward','access')),
  item_id TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK(rarity IN ('common','rare','epic','legendary')),
  cost INTEGER NOT NULL CHECK(cost>=0),
  compensation INTEGER NOT NULL CHECK(compensation>=0),
  duplicate INTEGER NOT NULL DEFAULT 0 CHECK(duplicate IN (0,1)),
  opened_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,request_id)
);
CREATE INDEX case_rewards_used ON case_openings(user_id,source,case_id);
CREATE VIEW earned_cases AS
SELECT user_id,
  ((xp/200+1)/10)-((xp/200+1)/20)-((xp/200+1)/50)+((xp/200+1)/100) AS standard,
  ((xp/200+1)/20)-((xp/200+1)/100) AS premium,
  ((xp/200+1)/50) AS royal FROM account_progress;
-- Debit, reward consumption and ownership commit as a single atomic insertion.
CREATE TRIGGER open_case_guard BEFORE INSERT ON case_openings
BEGIN
  SELECT CASE WHEN NEW.source='coins' AND COALESCE((SELECT balance FROM account_wallets WHERE user_id=NEW.user_id),0)<NEW.cost
    THEN RAISE(ABORT,'case_balance') END;
  SELECT CASE WHEN NEW.source='access' AND COALESCE((SELECT shop_access FROM users WHERE id=NEW.user_id),0)!=1
    THEN RAISE(ABORT,'case_access') END;
  SELECT CASE WHEN NEW.source='reward' AND
    COALESCE((SELECT CASE NEW.case_id WHEN 'standard' THEN standard WHEN 'premium' THEN premium ELSE royal END FROM earned_cases WHERE user_id=NEW.user_id),0)
    <=(SELECT COUNT(*) FROM case_openings WHERE user_id=NEW.user_id AND source='reward' AND case_id=NEW.case_id)
    THEN RAISE(ABORT,'case_reward') END;
END;
CREATE TRIGGER open_case_award AFTER INSERT ON case_openings
BEGIN
  UPDATE case_openings SET duplicate=EXISTS(SELECT 1 FROM account_items WHERE user_id=NEW.user_id AND item_id=NEW.item_id)
    WHERE user_id=NEW.user_id AND request_id=NEW.request_id;
  UPDATE account_wallets SET balance=balance-NEW.cost+CASE WHEN NEW.source!='access' AND
    (SELECT duplicate FROM case_openings WHERE user_id=NEW.user_id AND request_id=NEW.request_id)=1 THEN NEW.compensation ELSE 0 END
    WHERE user_id=NEW.user_id;
  INSERT OR IGNORE INTO account_items(user_id,item_id,paid_price,purchased_at) VALUES(NEW.user_id,NEW.item_id,0,NEW.opened_at);
END;
