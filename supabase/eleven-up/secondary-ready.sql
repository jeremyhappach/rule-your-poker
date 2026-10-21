-- LOCAL forward candidate; apply after the released smoke-controls package.
-- Active play-money competitions finish; human eligibility gates the NEXT game.
BEGIN;
DO $patch$
DECLARE d text; marker text; replacement text;
BEGIN
 d:=pg_get_functiondef('private.pause_all_humans_auto_fold(uuid)'::regprocedure);
 marker:='-- eleven_up_ready_all_humans_v1';
 replacement:=marker||chr(10)||' -- eleven_up_active_fake_completion_v1'||chr(10)||
  ' IF g.real_money IS FALSE THEN RETURN false; END IF;';
 IF position('eleven_up_active_fake_completion_v1' IN d)=0 THEN
  IF (length(d)-length(replace(d,marker,'')))/length(marker)<>2 THEN
   RAISE EXCEPTION 'eleven_up:all_human_owner_drift';
  END IF;
  EXECUTE replace(d,marker,replacement);
 END IF;
 -- Keep the canonical participant/dealer eligibility decision at postgame,
 -- including a remaining roster of multiple bots with no eligible human.
 d:=pg_get_functiondef('private.eleven_up_finish_postgame(uuid)'::regprocedure);
 marker:='IF g.pending_session_end THEN target:=''session_ended'';';
 replacement:=marker||$boundary$
  -- eleven_up_next_game_human_eligibility_v1
  ELSIF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=m.game_id
   AND NOT is_bot AND status NOT IN ('left','observer') AND NOT sitting_out AND position IS NOT NULL) THEN
   PERFORM private.resolve_postgame_participation(m.game_id,clock_timestamp());
   SELECT status INTO target FROM public.games WHERE id=m.game_id;$boundary$;
 IF position('eleven_up_next_game_human_eligibility_v1' IN d)=0 THEN
  IF (length(d)-length(replace(d,marker,'')))/length(marker)<>1 THEN
   RAISE EXCEPTION 'eleven_up:postgame_owner_drift';
  END IF;
  EXECUTE replace(d,marker,replacement);
 END IF;
END $patch$;
COMMIT;
