-- Local qualification only. Not a registered migration or production operation.
DO $patch$
DECLARE d text; marker text;
BEGIN
 d:=pg_get_functiondef('private.pause_all_humans_auto_fold(uuid)'::regprocedure);
 IF position('golf_active_play_money_continuation_v1' IN d)=0 THEN
  IF md5(d)<>'643abd1e2b49cf147268e68f2c4b3340' THEN RAISE EXCEPTION 'golf:pause_owner_drift';END IF;
  marker:=' IF coalesce(g.is_paused,false) THEN RETURN true; END IF;';
  -- Reconciled against the installed HOLM/357 last-present-human policy.
  -- Eleven Up Ready and both pre/post-lock poker checks remain byte-identical.
  -- Preserve deliberate pauses. Eligible-dealer checks still run at canonical
  -- postgame; this guard applies only while the admitted play-money match lives.
  IF (length(d)-length(replace(d,marker,'')))/length(marker)<>2
   OR position('real_money_poker_last_present_human_v1' IN d)=0
   OR position('eleven_up_ready_all_humans_v1' IN d)=0 THEN
   RAISE EXCEPTION 'golf:pause_owner_shape';END IF;
  d:=replace(d,marker,marker||$guard$
 -- golf_active_play_money_continuation_v1
 IF g.game_type='six-card-golf' AND g.real_money IS FALSE AND EXISTS(
  SELECT 1 FROM private.golf_matches m WHERE m.game_id=g.id
   AND m.dealer_game_id=g.current_game_uuid AND NOT m.finished)
 THEN RETURN false;END IF;
$guard$);
  EXECUTE d;
 END IF;
 d:=pg_get_functiondef('private.golf_recover()'::regprocedure);
 IF position('golf_active_timeout_continuation_v1' IN d)=0 THEN
  IF md5(d)<>'f697e0c82c68ba862fe85c0657b2aa5f' THEN RAISE EXCEPTION 'golf:recovery_owner_drift';END IF;
  d:=replace(d,'    IF private.pause_all_humans_auto_fold(g.id) THEN CONTINUE;END IF;',
   '    -- golf_active_timeout_continuation_v1: finish this admitted match; postgame owns eligibility.');
  d:=replace(d,'-- Renew the unresolved allowance before the all-human pause so explicit','-- Renew an expired automatic allowance before the legal reducer action;');
  d:=replace(d,'-- resume has a usable whole turn; no card/queue/counter changes occur.','-- real-money and deliberate pauses retain their separate branch above.');
  EXECUTE d;
 END IF;
 d:=pg_get_functiondef('public.admin_blast_fake_money_game(uuid)'::regprocedure);
 IF position('golf_canonical_blast_cleanup_v1' IN d)=0 THEN
  IF md5(d)<>'06c2cedb3ef0b85485b0281f24f8cfcf' THEN RAISE EXCEPTION 'golf:blast_owner_drift';END IF;
  marker:='  -- This archive intentionally has no game foreign key, so it is the only';
  IF position(marker IN d)=0 THEN RAISE EXCEPTION 'golf:blast_owner_shape';END IF;
  -- Only the existing locked, admin-authorized, explicitly fake-money operation
  -- may retire liabilities before its atomic session cascade. Direct roster
  -- deletion stays forbidden. A failure rolls this deletion back with the rest.
  EXECUTE replace(d,marker,$cleanup$
  -- golf_canonical_blast_cleanup_v1
  DELETE FROM private.golf_matches WHERE game_id=p_game_id;

$cleanup$||marker);
 END IF;
END $patch$;
