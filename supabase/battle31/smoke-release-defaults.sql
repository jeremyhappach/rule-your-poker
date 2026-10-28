-- Approved Battle31 owner-smoke release, 2026-10-26.
-- Data-only change. New admissions freeze 30 seconds; existing matches stay intact.
-- Refuse an unexpected intervening timer change; preserve admission and other defaults.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL statement_timeout='15s';
DO $proof$
DECLARE defaults_before jsonb; matches_before text; configs_before text; gate_before jsonb; n integer;
BEGIN
 SELECT jsonb_object_agg(game_type,to_jsonb(d)-'updated_at'-CASE WHEN game_type='battle-31' THEN 'decision_timer_seconds' ELSE '__unchanged__' END) INTO defaults_before FROM public.game_defaults d;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(m) ORDER BY dealer_game_id)::text,'[]')) INTO matches_before FROM private.battle31_matches m;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(d) ORDER BY id)::text,'[]')) INTO configs_before FROM public.dealer_games d WHERE game_type='battle-31';
 SELECT jsonb_agg(to_jsonb(r)) INTO gate_before FROM private.battle31_release r;
 UPDATE public.game_defaults SET decision_timer_seconds=30 WHERE game_type='battle-31' AND decision_timer_seconds IN (10,30);
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'battle31 default row count %',n; END IF;
 IF (SELECT decision_timer_seconds FROM public.game_defaults WHERE game_type='battle-31')<>30 THEN RAISE EXCEPTION 'default did not update'; END IF;
 IF defaults_before IS DISTINCT FROM (SELECT jsonb_object_agg(game_type,to_jsonb(d)-'updated_at'-CASE WHEN game_type='battle-31' THEN 'decision_timer_seconds' ELSE '__unchanged__' END) FROM public.game_defaults d) THEN RAISE EXCEPTION 'unrelated default changed';END IF;
 IF matches_before IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(m) ORDER BY dealer_game_id)::text,'[]')) FROM private.battle31_matches m) THEN RAISE EXCEPTION 'existing match changed';END IF;
 IF configs_before IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(d) ORDER BY id)::text,'[]')) FROM public.dealer_games d WHERE game_type='battle-31') THEN RAISE EXCEPTION 'frozen configuration changed';END IF;
 IF gate_before IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(r)) FROM private.battle31_release r) THEN RAISE EXCEPTION 'admission changed';END IF;
END $proof$;
COMMIT;

