-- Recalibrate historical XP once, retaining the level and fraction of its bar.
-- Existing reward consumption and ownership remain unchanged.
UPDATE account_progress SET xp=
  25*(xp/200)*(xp/200+7)+(xp%200)*(200+50*(xp/200))/200;

-- Integer binary search mirrors levelThreshold in public/cases.js. A correlated
-- subquery permits indexed user lookup and takes logarithmic, not linear, steps.
CREATE VIEW account_levels AS
SELECT p.user_id,(WITH RECURSIVE search(lo,hi) AS (
  SELECT 1,p.xp/200+2
  UNION ALL
  SELECT CASE WHEN 25.0*((lo+hi)/2-1)*((lo+hi)/2+6)<=p.xp THEN (lo+hi)/2 ELSE lo END,
         CASE WHEN 25.0*((lo+hi)/2-1)*((lo+hi)/2+6)<=p.xp THEN hi ELSE (lo+hi)/2 END
  FROM search WHERE hi-lo>1
) SELECT lo FROM search WHERE hi-lo=1) AS level FROM account_progress p;

DROP VIEW earned_cases;
CREATE VIEW earned_cases AS
SELECT user_id,level/10-level/20-level/50+level/100 AS standard,
  level/20-level/100 AS premium,level/50 AS royal FROM account_levels;
