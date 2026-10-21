-- Local candidate only. Apply AFTER the unchanged qualified bot package.
-- Ready is inactivity; playing is an immutable scoring clock.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('private.eleven_up_bot_choice(jsonb,bigint)') IS NULL
 OR to_regprocedure('public.set_game_paused(uuid,boolean,uuid,bigint)') IS NULL
 OR to_regprocedure('private.pause_all_humans_auto_fold(uuid)') IS NULL THEN
  RAISE EXCEPTION 'eleven_up:missing_canonical_timeout_dependency';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION private.eleven_up_schedule_bot() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE automatic boolean;
BEGIN
 SELECT g.real_money IS FALSE AND (p.is_bot OR p.auto_fold) INTO automatic
 FROM public.games g JOIN public.players p ON p.game_id=g.id
 WHERE g.id=NEW.game_id AND p.id=(NEW.state->'players'->(NEW.state->>'turnIndex')::integer->>'id')::uuid;
 IF NEW.finished OR NEW.settlement IS NOT NULL OR NEW.paused_at IS NOT NULL
 OR NEW.state->>'phase' NOT IN ('ready','playing') OR NOT coalesce(automatic,false) THEN NEW.bot_due_at:=NULL;
 ELSIF TG_OP='INSERT' THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSIF OLD.paused_at IS NOT NULL OR NEW.state IS DISTINCT FROM OLD.state OR NEW.revision<>OLD.revision THEN
  NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSE NEW.bot_due_at:=OLD.bot_due_at; END IF;
 RETURN NEW;
END $$;

-- Canonical player flags are persistent authority. Their changes invalidate all
-- prior action revisions and publish through the existing realtime revision row.
CREATE OR REPLACE FUNCTION private.eleven_up_control_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.auto_fold IS DISTINCT FROM OLD.auto_fold OR NEW.sit_out_next_hand IS DISTINCT FROM OLD.sit_out_next_hand THEN
  UPDATE private.eleven_up_matches m SET revision=revision+1
  FROM public.games g WHERE g.id=NEW.game_id AND g.game_type='eleven-up'
   AND g.current_game_uuid=m.dealer_game_id AND m.game_id=g.id AND NOT m.finished AND m.settlement IS NULL
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=NEW.id::text);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS eleven_up_control_changed ON public.players;
CREATE TRIGGER eleven_up_control_changed AFTER UPDATE OF auto_fold,sit_out_next_hand ON public.players
 FOR EACH ROW EXECUTE FUNCTION private.eleven_up_control_changed();

-- Caller holds round -> game -> match locks. Never called for scoring expiry.
CREATE OR REPLACE FUNCTION private.eleven_up_ready_timeout(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.eleven_up_matches; g public.games; p public.players; at_ms bigint;
 saved jsonb:=private.capture_recovery_context(); result jsonb; choice jsonb;
BEGIN
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_id;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF g.is_paused OR g.status<>'in_progress' OR g.current_game_uuid IS DISTINCT FROM p_id
 OR m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL
 OR m.state->>'phase'<>'ready' OR (m.state->>'deadline')::bigint>at_ms THEN RETURN false; END IF;
 SELECT * INTO STRICT p FROM public.players WHERE game_id=g.id
 AND id=(m.state->'players'->(m.state->>'turnIndex')::integer->>'id')::uuid FOR UPDATE;
 IF p.is_bot THEN RETURN false; END IF;
 -- Renew ONLY the pre-play Ready allowance. Scoring has not begun. Reclaim
 -- itself never renews this allowance; a replay sees the new revision/deadline.
 UPDATE private.eleven_up_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(at_ms+(state#>>'{rules,readyMs}')::bigint)),
  revision=revision+1 WHERE dealer_game_id=p_id;
 IF g.real_money IS DISTINCT FROM false THEN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  result:=public.set_game_paused(g.id,true,g.current_game_uuid,g.pause_version);
  IF coalesce(result->>'outcome','') NOT IN ('paused','already_set') THEN RAISE EXCEPTION 'eleven_up:pause_failed:%',result; END IF;
 ELSE
  UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE id=p.id;
  -- Honor the existing configured all-human safeguard, without changing its
  -- policy or applying it to an active scoring countdown.
  IF NOT private.pause_all_humans_auto_fold(g.id) THEN
   -- Commit the first strategic move atomically with takeover. Reclaim cannot
   -- exploit the scheduler gap to repeatedly renew a pre-play Ready allowance.
   SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_id;
   choice:=private.eleven_up_bot_choice(private.eleven_up_visible(m.state),at_ms);
   IF choice IS NULL THEN RAISE EXCEPTION 'eleven_up:missing_ready_bot_choice'; END IF;
   UPDATE private.eleven_up_matches SET state=private.eleven_up_reduce(m.state,choice->>'action',
    ARRAY(SELECT value::integer FROM jsonb_array_elements_text(choice->'items')),at_ms),revision=revision+1 WHERE dealer_game_id=p_id;
  END IF;
 END IF;
 PERFORM private.restore_recovery_context(saved);
 RETURN true;
EXCEPTION WHEN OTHERS THEN PERFORM private.restore_recovery_context(saved); RAISE;
END $$;

CREATE OR REPLACE FUNCTION public.eleven_up_reclaim(p_dealer_game_id uuid,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.eleven_up_matches; g public.games; p public.players; prior text;
BEGIN
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 SELECT * INTO p FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND NOT is_bot AND status NOT IN ('left','observer') FOR UPDATE;
 IF NOT FOUND OR NOT private.eleven_up_actor_allowed(auth.uid()) OR NOT EXISTS
 (SELECT 1 FROM jsonb_array_elements(m.state->'players') x WHERE x->>'id'=p.id::text) THEN RAISE EXCEPTION 'eleven_up:participant_required' USING ERRCODE='42501'; END IF;
 IF g.game_type<>'eleven-up' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id
 OR g.status<>'in_progress' OR m.finished OR m.settlement IS NOT NULL THEN RAISE EXCEPTION 'eleven_up:inactive'; END IF;
 IF NOT coalesce(p.auto_fold,false) AND NOT coalesce(p.sit_out_next_hand,false) THEN RETURN public.eleven_up_snapshot(m.dealer_game_id); END IF;
 IF p_revision IS DISTINCT FROM m.revision THEN RAISE EXCEPTION 'eleven_up:stale_revision'; END IF;
 -- Canonical control permission permits clearing intent while paused. No
 -- gameplay mutation, resume, scoring-clock shift or extra action is performed.
 prior:=coalesce(current_setting('app.session_pause_write',true),'');
 PERFORM set_config('app.session_pause_write','on',true);
 UPDATE public.players SET auto_fold=false,sit_out_next_hand=false,auto_play_stop_round_id=NULL WHERE id=p.id;
 PERFORM set_config('app.session_pause_write',prior,true);
 RETURN public.eleven_up_snapshot(m.dealer_game_id);
END $$;
REVOKE ALL ON FUNCTION public.eleven_up_reclaim(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleven_up_reclaim(uuid,bigint) TO authenticated;

-- Surgical edits retain all qualified snapshot/financial/action metadata.
DO $patch$
DECLARE d text; marker text;
BEGIN
 d:=pg_get_functiondef('public.eleven_up_snapshot(uuid)'::regprocedure);
 marker:='private.eleven_up_visible(m.state)||jsonb_build_object';
 IF position('eleven_up_human_ready_v1' IN d)=0 THEN
  IF position(marker IN d)=0 OR position('''canAct'',NOT coalesce(paused,false)' IN d)=0 THEN RAISE EXCEPTION 'eleven_up:snapshot_owner_drift'; END IF;
  d:=replace(d,marker,$replace$(private.eleven_up_visible(m.state)||jsonb_build_object('players',
   (SELECT jsonb_agg(x.value||jsonb_build_object('autoplay',coalesce(p.auto_fold,false) AND NOT p.is_bot,'sitOutNextHand',coalesce(p.sit_out_next_hand,false)) ORDER BY x.ordinality)
    FROM jsonb_array_elements(m.state->'players') WITH ORDINALITY x LEFT JOIN public.players p ON p.id=(x.value->>'id')::uuid AND p.game_id=m.game_id)))||jsonb_build_object$replace$);
  d:=replace(d,'''canAct'',NOT coalesce(paused,false)', '''canAct'',NOT EXISTS(SELECT 1 FROM public.players WHERE id=viewer AND auto_fold) AND NOT coalesce(paused,false)');
  EXECUTE replace(d,'BEGIN','BEGIN -- eleven_up_human_ready_v1');
  -- Existing canonical flags may predate this adapter. Publish their newly
  -- projected semantics at a NEW revision, never conflicting equal progress.
  UPDATE private.eleven_up_matches m SET revision=revision+1 FROM public.games g
  WHERE g.id=m.game_id AND g.game_type='eleven-up' AND g.current_game_uuid=m.dealer_game_id
   AND NOT m.finished AND m.settlement IS NULL AND EXISTS
   (SELECT 1 FROM public.players p WHERE p.game_id=m.game_id AND (p.auto_fold OR p.sit_out_next_hand)
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') x WHERE x->>'id'=p.id::text));
 END IF;
 d:=pg_get_functiondef('public.eleven_up_action(uuid,uuid,bigint,text,integer[])'::regprocedure);
 marker:='m.state:=private.eleven_up_reduce(m.state,p_action,p_items,at_ms);';
 IF position('eleven_up_human_ready_v1' IN d)=0 THEN
  IF position(marker IN d)=0 THEN RAISE EXCEPTION 'eleven_up:action_owner_drift'; END IF;
  EXECUTE replace(d,marker,$replace$-- eleven_up_human_ready_v1
 IF m.state->>'phase'='intro' AND (m.state->>'deadline')::bigint<=at_ms THEN
  UPDATE private.eleven_up_matches SET state=private.eleven_up_reduce(state,'tick',NULL,(state->>'deadline')::bigint),revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
  RETURN public.eleven_up_snapshot(m.dealer_game_id);
 END IF;
 IF private.eleven_up_ready_timeout(m.dealer_game_id) THEN RETURN public.eleven_up_snapshot(m.dealer_game_id); END IF;
 IF EXISTS(SELECT 1 FROM public.players WHERE id=player AND auto_fold) THEN RAISE EXCEPTION 'eleven_up:inactive_autoplay'; END IF;
 m.state:=private.eleven_up_reduce(m.state,p_action,p_items,at_ms);$replace$);
 END IF;
END $patch$;

CREATE OR REPLACE FUNCTION private.eleven_up_recover() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate record; m private.eleven_up_matches; g public.games; p public.players;
 at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000); count_i integer:=0; choice jsonb;
BEGIN
 FOR candidate IN SELECT work.dealer_game_id,work.game_id,work.round_id,work.revision
 FROM private.eleven_up_matches work JOIN public.games live ON live.id=work.game_id
 WHERE NOT work.finished AND work.settlement IS NULL AND work.paused_at IS NULL
 AND least((work.state->>'deadline')::bigint,work.bot_due_at)<=at_ms
 AND live.status='in_progress' AND live.game_type='eleven-up' AND live.current_game_uuid=work.dealer_game_id AND NOT live.is_paused
 ORDER BY least((work.state->>'deadline')::bigint,work.bot_due_at),work.dealer_game_id LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=candidate.round_id FOR UPDATE SKIP LOCKED; IF NOT FOUND THEN CONTINUE; END IF;
  SELECT * INTO g FROM public.games WHERE id=candidate.game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR g.is_paused OR g.status<>'in_progress' OR g.game_type<>'eleven-up' OR g.current_game_uuid IS DISTINCT FROM candidate.dealer_game_id THEN CONTINUE; END IF;
  SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=candidate.dealer_game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL OR m.revision<>candidate.revision
   OR m.round_id<>candidate.round_id OR m.game_id<>candidate.game_id THEN CONTINUE; END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  IF private.eleven_up_ready_timeout(m.dealer_game_id) THEN count_i:=count_i+1; CONTINUE; END IF;
  IF m.state->>'phase'='ready' AND private.pause_all_humans_auto_fold(g.id) THEN CONTINUE; END IF;
  IF (m.state->>'deadline')::bigint<=at_ms THEN
   -- One phase transition per wake: never leap over a newly eligible Ready
   -- boundary during zero-client catch-up. All reducer timestamps stay frozen.
   m.state:=private.eleven_up_reduce(m.state,'tick',NULL,(m.state->>'deadline')::bigint);
  ELSE
   SELECT * INTO p FROM public.players WHERE game_id=m.game_id
    AND id=(m.state->'players'->(m.state->>'turnIndex')::integer->>'id')::uuid;
   IF NOT FOUND OR g.real_money IS DISTINCT FROM false OR NOT (p.is_bot OR p.auto_fold)
    OR m.bot_due_at IS NULL OR m.bot_due_at>at_ms THEN CONTINUE; END IF;
   choice:=private.eleven_up_bot_choice(private.eleven_up_visible(m.state),at_ms);
   IF choice IS NULL THEN CONTINUE; END IF;
   m.state:=private.eleven_up_reduce(m.state,choice->>'action',ARRAY(SELECT value::integer FROM jsonb_array_elements_text(choice->'items')),at_ms);
  END IF;
  UPDATE private.eleven_up_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id AND revision=candidate.revision;
  IF m.state->>'phase'='complete' THEN PERFORM private.eleven_up_settle(m.dealer_game_id); END IF;
  count_i:=count_i+1;
 END LOOP;
 FOR candidate IN SELECT dealer_game_id FROM private.eleven_up_matches WHERE NOT finished AND settlement IS NOT NULL
 AND (state#>>'{terminal,deadline}')::bigint<=at_ms ORDER BY dealer_game_id LIMIT 20 LOOP
  PERFORM private.eleven_up_finish_postgame(candidate.dealer_game_id);count_i:=count_i+1;
 END LOOP;
 RETURN count_i;
END $$;
REVOKE ALL ON FUNCTION private.eleven_up_ready_timeout(uuid),private.eleven_up_control_changed(),private.eleven_up_schedule_bot(),private.eleven_up_recover() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
