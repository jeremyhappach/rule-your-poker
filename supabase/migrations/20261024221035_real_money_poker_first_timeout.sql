-- October 24: real-money HOLM/357 cannot play a human decision automatically.
-- Qualified under ROLLBACK before registration; modifies no session rows.
-- Existing timeout producers mark intent before entering this shared guard.
-- Keep the same guard on continuation/resume so clearing automatic intent and
-- an authorized explicit resume are both required. Dice policy is unchanged.
DO $policy$
DECLARE body text; old_guard text := 'IF humans=0 OR automatic<>humans THEN RETURN false; END IF;';
new_guard text := $guard$IF humans=0 OR automatic=0 OR (
  NOT (coalesce(g.real_money,false) AND g.game_type IN ('holm','holm-game','3-5-7','3-5-7-game','357'))
  AND automatic<>humans
 ) THEN RETURN false; END IF;$guard$;
BEGIN
 SELECT pg_get_functiondef('private.pause_all_humans_auto_fold(uuid)'::regprocedure) INTO body;
 IF body LIKE '%-- real_money_poker_first_timeout_v1%' THEN RETURN; END IF;
 IF md5(body)<>'e87283dcb929ce4d86a280e8971ccf42'
   OR (length(body)-length(replace(body,old_guard,'')))/length(old_guard)<>2
 THEN RAISE EXCEPTION 'real_money_poker_timeout:baseline_drift'; END IF;
 body:=replace(body,old_guard,'-- real_money_poker_first_timeout_v1'||chr(10)||new_guard);
 EXECUTE body;
END $policy$;
