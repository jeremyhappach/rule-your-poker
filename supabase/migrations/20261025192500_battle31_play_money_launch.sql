-- All-user play-money launch. Existing rules, clocks and financial owners are unchanged.
ALTER TABLE private.battle31_release ADD CONSTRAINT battle31_play_money_only CHECK (NOT real_qualified);
ALTER TABLE public.games ADD CONSTRAINT battle31_play_money_only CHECK (game_type IS DISTINCT FROM 'battle-31' OR real_money IS FALSE);
DO $patch$
DECLARE d text; marker text:=' IF coalesce(g.is_paused,false) THEN RETURN true; END IF;';
BEGIN
 d:=pg_get_functiondef('private.pause_all_humans_auto_fold(uuid)'::regprocedure);
 IF md5(d)<>'347ab39eadb7ae710292d01be7985161' THEN RAISE EXCEPTION 'battle31:pause_owner_drift';END IF;
 IF (length(d)-length(replace(d,marker,'')))/length(marker)<>2 THEN RAISE EXCEPTION 'battle31:pause_owner_shape';END IF;
 EXECUTE replace(d,marker,marker||$guard$
 -- battle31_active_play_money_continuation_v1
 IF g.game_type='battle-31' AND g.real_money IS FALSE AND EXISTS(
  SELECT 1 FROM private.battle31_matches m WHERE m.game_id=g.id
   AND m.dealer_game_id=g.current_game_uuid AND NOT m.finished)
 THEN RETURN false;END IF;
$guard$);
END $patch$;
-- Admission is activated separately only after publication verification.
