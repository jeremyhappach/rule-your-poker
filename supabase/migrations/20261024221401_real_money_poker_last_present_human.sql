-- Supersedes the first-timeout interpretation following Jeremy's correction.
-- Timeout still marks auto-fold; real-money HOLM/357 pause only when no more
-- than one eligible human remains outside auto-fold. No session rows change.
DO $policy$
DECLARE body text;
old_guard text := $guard$IF humans=0 OR automatic=0 OR (
  NOT (coalesce(g.real_money,false) AND g.game_type IN ('holm','holm-game','3-5-7','3-5-7-game','357'))
  AND automatic<>humans
 ) THEN RETURN false; END IF;$guard$;
new_guard text := $guard$IF humans=0 OR automatic=0 OR (CASE
  WHEN coalesce(g.real_money,false) AND g.game_type IN ('holm','holm-game','3-5-7','3-5-7-game','357')
  THEN humans-automatic>1
  ELSE automatic<>humans
 END) THEN RETURN false; END IF;$guard$;
BEGIN
 SELECT pg_get_functiondef('private.pause_all_humans_auto_fold(uuid)'::regprocedure) INTO body;
 IF body LIKE '%-- real_money_poker_last_present_human_v1%' THEN RETURN; END IF;
 IF md5(body)<>'ff0fb4f11e9da8b8f03e5b8bb6fc6218'
   OR (length(body)-length(replace(body,old_guard,'')))/length(old_guard)<>2
 THEN RAISE EXCEPTION 'real_money_poker_last_present_human:baseline_drift'; END IF;
 body:=replace(replace(body,old_guard,new_guard),
   '-- real_money_poker_first_timeout_v1','-- real_money_poker_last_present_human_v1');
 EXECUTE body;
END $policy$;
