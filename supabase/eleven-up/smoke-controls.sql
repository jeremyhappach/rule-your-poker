-- Local forward candidate only. No registered or production migration.
-- Apply after the qualified bots and human-ready packages.
BEGIN;
CREATE OR REPLACE FUNCTION private.eleven_up_expiry_control() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games; p public.players; result jsonb;
 saved jsonb:=private.capture_recovery_context();
BEGIN
 IF NEW.finished OR NEW.settlement IS NOT NULL THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id;
 IF g.game_type<>'eleven-up' OR g.current_game_uuid IS DISTINCT FROM NEW.dealer_game_id
 OR g.status<>'in_progress' OR g.is_paused THEN RETURN NEW; END IF;
 IF OLD.state->>'phase'='playing' AND NEW.state->>'phase'='stage_complete'
 AND NEW.state#>>'{result,reason}'='timeout' THEN
  -- The reducer has already finalized the exact expiry score and timestamp.
  -- Canonical flags change control, never the frozen roster or round schedule.
  UPDATE public.players SET auto_fold=true,sit_out_next_hand=true
  WHERE game_id=NEW.game_id AND NOT is_bot
   AND id=(OLD.state->'players'->(OLD.state->>'turnIndex')::integer->>'id')::uuid;
 ELSIF OLD.state->>'phase'='intro' AND NEW.state->>'phase'='ready'
 AND g.real_money IS DISTINCT FROM false THEN
  SELECT * INTO p FROM public.players WHERE game_id=NEW.game_id
   AND id=(NEW.state->'players'->(NEW.state->>'turnIndex')::integer->>'id')::uuid;
  IF NOT p.is_bot AND p.auto_fold THEN
   IF (NEW.state->>'deadline')::bigint<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint THEN
    -- Zero-client catch-up can reach Ready late. Reuse its existing pre-play
    -- allowance/pause owner; never touch the already-finalized scoring clock.
    PERFORM private.eleven_up_ready_timeout(NEW.dealer_game_id);
    RETURN NEW;
   END IF;
   PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
   result:=public.set_game_paused(g.id,true,g.current_game_uuid,g.pause_version);
   IF coalesce(result->>'outcome','') NOT IN ('paused','already_set') THEN
    RAISE EXCEPTION 'eleven_up:away_pause_failed:%',result;
   END IF;
  END IF;
 END IF;
 PERFORM private.restore_recovery_context(saved);
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN PERFORM private.restore_recovery_context(saved); RAISE;
END $$;
REVOKE ALL ON FUNCTION private.eleven_up_expiry_control() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS eleven_up_expiry_control ON private.eleven_up_matches;
CREATE TRIGGER eleven_up_expiry_control AFTER UPDATE OF state ON private.eleven_up_matches
 FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state)
 EXECUTE FUNCTION private.eleven_up_expiry_control();

-- A confirmed bot group is presented one selected ball per 750 ms. Pace its
-- next decision accordingly; deadline recovery still preempts this due time.
DO $patch$
DECLARE d text; marker text:=' RETURN NEW;';
BEGIN
 d:=pg_get_functiondef('private.eleven_up_schedule_bot()'::regprocedure);
 IF position('eleven_up_group_presentation_v1' IN d)=0 THEN
  IF position(marker IN d)=0 THEN RAISE EXCEPTION 'eleven_up:schedule_owner_drift'; END IF;
  EXECUTE replace(d,marker,$pace$
 -- eleven_up_group_presentation_v1
 IF TG_OP='UPDATE' AND NEW.bot_due_at IS NOT NULL
 AND NEW.state->>'turnIndex'=OLD.state->>'turnIndex' AND NEW.state->>'stage'=OLD.state->>'stage'
 AND (NEW.state->>'groups')::integer=(OLD.state->>'groups')::integer+1 THEN
  NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750*(
   (SELECT count(*) FROM jsonb_array_elements(OLD.state->'slots') WITH ORDINALITY x(v,i)
    WHERE v<>'null'::jsonb AND NEW.state->'slots'->(i::integer-1)='null'::jsonb)
   +CASE WHEN OLD.state->'current' IS DISTINCT FROM NEW.state->'current' THEN 1 ELSE 0 END);
 END IF;
 RETURN NEW;$pace$);
 END IF;
END $patch$;
COMMIT;
