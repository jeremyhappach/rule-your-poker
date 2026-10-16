-- Run21 only. Admission must remain closed during the qualified release.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
LOCK TABLE private.run21_matches IN ACCESS EXCLUSIVE MODE NOWAIT;
DO $$ BEGIN
 IF EXISTS(SELECT FROM private.run21_production_release WHERE qualified) THEN RAISE EXCEPTION 'run21:close_admission_before_lifecycle_migration'; END IF;
 IF md5(pg_get_functiondef('public.run21_recovery_claim(uuid)'::regprocedure))<>'ed5180600a1b54baf7eaa29b21a800fa' THEN RAISE EXCEPTION 'run21:authority_changed:run21_recovery_claim'; END IF;
 IF md5(pg_get_functiondef('public.run21_recovery_load(uuid,uuid)'::regprocedure))<>'f9781f1d3c36f30ce459594a62329566' THEN RAISE EXCEPTION 'run21:authority_changed:run21_recovery_load'; END IF;
 IF md5(pg_get_functiondef('public.run21_server_close(uuid,uuid)'::regprocedure))<>'e57f2fcd24eee243f38c9696c7ac1e54' THEN RAISE EXCEPTION 'run21:authority_changed:run21_server_close'; END IF;
END $$;
CREATE TEMP TABLE run21_lifecycle_preservation ON COMMIT DROP AS SELECT
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(m)-'lifecycle_version' ORDER BY dealer_game_id)::text,'')) FROM private.run21_matches m) matches,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY dealer_game_id,sequence)::text,'')) FROM private.run21_events e) events,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY dealer_game_id)::text,'')) FROM private.run21_settlements s) receipts;
ALTER TABLE private.run21_matches ADD COLUMN lifecycle_version smallint NOT NULL DEFAULT 1 CHECK(lifecycle_version IN(1,2));
ALTER TABLE private.run21_matches ALTER COLUMN lifecycle_version SET DEFAULT 2;
CREATE OR REPLACE FUNCTION private.run21_finish_postgame(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
 m private.run21_matches; g public.games; winner uuid; receipt private.run21_settlements;
 active_count integer; human_count integer; eligible_count integer;
 allow_bots boolean:=false; make_take boolean:=false; positions integer[];
 next_position integer; target text; deadline timestamptz;
BEGIN
 PERFORM private.run21_require_local();
 SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id;
  PERFORM 1 FROM public.rounds WHERE id=m.first_round_id FOR UPDATE;
  SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
  SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM private.run21_settlements WHERE dealer_game_id=m.dealer_game_id) THEN
  RAISE EXCEPTION 'run21:close_denied' USING ERRCODE='42501'; END IF;
 IF m.finished THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF (g.real_money AND m.financial_version<>2) OR g.is_paused OR g.game_type IS DISTINCT FROM 'run21' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id THEN
  RAISE EXCEPTION 'run21:inactive_identity'; END IF;
 SELECT * INTO STRICT receipt FROM private.run21_settlements WHERE dealer_game_id=m.dealer_game_id;
 winner:=receipt.winner_id;
 IF m.state#>>'{settlement,resultId}' IS DISTINCT FROM receipt.id::text
  OR m.state#>>'{settlement,transferBatchId}' IS DISTINCT FROM receipt.transfer_batch_id::text
  OR m.state#>>'{settlement,key}' IS DISTINCT FROM receipt.settlement_key
  OR m.state#>>'{settlement,winnerId}' IS DISTINCT FROM receipt.winner_id::text
  OR m.state#>>'{settlement,loserId}' IS DISTINCT FROM receipt.loser_id::text
  OR (m.state#>>'{settlement,amount}')::numeric IS DISTINCT FROM receipt.amount THEN
  RAISE EXCEPTION 'run21:settlement_conflict'; END IF;
 IF m.state->'settlement' IS NULL OR m.state->'settlement'='null'::jsonb OR m.state->>'winnerId' IS DISTINCT FROM winner::text THEN
  RAISE EXCEPTION 'run21:not_settled'; END IF;
 IF g.status='session_ended' THEN
  target:='session_ended';
 ELSE
  PERFORM 1 FROM public.players WHERE game_id=m.game_id ORDER BY id FOR UPDATE;
  UPDATE public.players SET
   status=CASE WHEN stand_up_next_hand THEN 'left' ELSE status END,
   sitting_out=CASE WHEN stand_up_next_hand OR sit_out_next_hand THEN true WHEN waiting THEN false ELSE sitting_out END,
   waiting=false,stand_up_next_hand=false,sit_out_next_hand=false,auto_fold=false,auto_play_stop_round_id=NULL,
   current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,ante_decision=NULL,auto_ante=false,auto_ante_runback=false
  WHERE game_id=m.game_id;
  SELECT count(*),count(*) FILTER(WHERE NOT is_bot) INTO active_count,human_count FROM public.players
   WHERE game_id=m.game_id AND NOT sitting_out AND status NOT IN ('observer','left') AND position IS NOT NULL;
  -- Same session-level dealer policy source as Yahtzee; no game scoring defaults.
  SELECT coalesce(allow_bot_dealers,false) INTO allow_bots FROM public.game_defaults WHERE game_type='holm';
  allow_bots:=coalesce(allow_bots,false);
  SELECT array_agg(position ORDER BY position DESC),count(*) INTO positions,eligible_count FROM public.players
   WHERE game_id=m.game_id AND NOT sitting_out AND status NOT IN ('observer','left') AND position IS NOT NULL
    AND (allow_bots OR NOT is_bot);
  IF g.pending_session_end THEN target:='session_ended';
  ELSIF human_count=0 OR active_count<2 OR eligible_count=0 THEN
   -- Canonical participant admission distinguishes seated/sitting-out humans
   -- from a truly ended session and preserves its financial finalization rules.
   PERFORM private.resolve_postgame_participation(m.game_id,clock_timestamp());
   SELECT status INTO target FROM public.games WHERE id=m.game_id;
  ELSE
   SELECT coalesce((value->>'enabled')::boolean,false) INTO make_take FROM public.system_settings WHERE key='make_it_take_it';
   IF coalesce(make_take,false) THEN
    SELECT position INTO next_position FROM public.players WHERE id=winner AND game_id=m.game_id
     AND NOT is_bot AND NOT sitting_out AND status NOT IN ('observer','left') AND position IS NOT NULL;
    IF next_position IS NULL THEN
     IF eligible_count=1 THEN next_position:=positions[1]; ELSE target:='dealer_selection'; END IF;
    END IF;
   END IF;
   IF target IS NULL THEN
    IF next_position IS NULL THEN
     -- Canonical clockwise is next LOWER occupied position, wrapping.
     SELECT max(p) INTO next_position FROM unnest(positions) p WHERE p<g.dealer_position;
     next_position:=coalesce(next_position,positions[1]);
    END IF;
    target:='game_selection';
    deadline:=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.game_setup_timer_seconds,30)));
   END IF;
  END IF;
  -- No dealer game is committed in canonical setup/waiting. Retire only the
  -- live family discriminator; immutable dealer-game/round/history keep Run21.
  -- A later setup timer has its own transaction and must use canonical authority,
  -- never a prior game claim from this continuation. Ended frames retain it.
  UPDATE public.games SET status=target,
   game_type=CASE WHEN target IN ('game_selection','dealer_selection','waiting') THEN NULL ELSE game_type END,
   config_complete=false,config_deadline=deadline,ante_decision_deadline=NULL,
   last_round_result=NULL,current_round=NULL,awaiting_next_round=false,next_round_number=NULL,pot=0,
   all_decisions_in=false,all_decisions_in_round_id=NULL,game_over_at=NULL,buck_position=NULL,total_hands=0,
   is_first_hand=false,current_game_uuid=NULL,dealer_selection_state=NULL,
   dealer_position=CASE WHEN target='game_selection' THEN next_position ELSE dealer_position END,
   pending_session_end=CASE WHEN target='session_ended' THEN false ELSE pending_session_end END,
   session_ended_at=CASE WHEN target='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END
  WHERE id=m.game_id;
 END IF;
 UPDATE private.run21_matches SET finished=true WHERE dealer_game_id=m.dealer_game_id;
END $function$;

CREATE OR REPLACE FUNCTION public.run21_recovery_claim(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE selected_games uuid[];
BEGIN
  PERFORM 1 FROM private.run21_recovery_state WHERE singleton AND token=p_token
    AND expires_at>clock_timestamp() AND NOT claimed FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('accepted',false); END IF;
  SELECT coalesce(array_agg(game_id),'{}'::uuid[]) INTO selected_games FROM (
    SELECT m.game_id FROM private.run21_matches m JOIN public.games g ON g.id=m.game_id
    WHERE m.financial_version=2 AND NOT m.finished
      AND ((nullif(m.state->'settlement','null'::jsonb) IS NULL AND g.status='in_progress')
        OR (m.lifecycle_version=2 AND nullif(m.state->'settlement','null'::jsonb) IS NOT NULL AND g.status IN ('game_over','session_ended'))) AND g.current_game_uuid=m.dealer_game_id AND g.game_type='run21' AND NOT g.is_paused
      AND (nullif(m.state->'settlement','null'::jsonb) IS NOT NULL OR m.state IS NULL OR nullif(m.state->>'winnerId','') IS NOT NULL
        OR m.state#>>'{rounds,-1,revealed}'='true'
        OR (m.state#>>'{rounds,-1,scorePresentation,endsAt}')::bigint<=extract(epoch FROM clock_timestamp())*1000
        OR (m.state#>>ARRAY['rounds','-1','boards',m.state#>>'{rounds,-1,active_player_id}','deadline'])::bigint<=extract(epoch FROM clock_timestamp())*1000
        OR (m.state#>>ARRAY['rounds','-1','boards',m.state#>>'{rounds,-1,active_player_id}','firstPlacementDeadline'])::bigint<=extract(epoch FROM clock_timestamp())*1000
        OR m.bot_due_at<=extract(epoch FROM clock_timestamp())*1000)
    ORDER BY m.created_at LIMIT 20
  ) candidates;
  UPDATE private.run21_recovery_state SET claimed=true,games=selected_games WHERE singleton;
  RETURN jsonb_build_object('accepted',true,'games',selected_games);
END $function$;

CREATE OR REPLACE FUNCTION public.run21_recovery_load(p_token uuid, p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.run21_recovery_state WHERE singleton AND token=p_token AND claimed
    AND expires_at>clock_timestamp() AND p_game_id=ANY(games)) THEN
    RAISE EXCEPTION 'run21:recovery_token_denied' USING ERRCODE='42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(m)||jsonb_build_object('dealer_user_id',d.dealer_user_id) ORDER BY m.created_at)
    FROM private.run21_matches m JOIN public.games g ON g.id=m.game_id JOIN public.dealer_games d ON d.id=m.dealer_game_id
    WHERE m.game_id=p_game_id AND m.financial_version=2 
      AND ((g.current_game_uuid=m.dealer_game_id AND g.status IN ('in_progress','game_over','session_ended'))
        OR (m.lifecycle_version=2 AND m.finished AND g.current_game_uuid IS NULL)) AND NOT g.is_paused),'[]'::jsonb);
END $function$;


REVOKE ALL ON FUNCTION private.run21_finish_postgame(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.run21_server_close(p_dealer_game_id uuid,p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.run21_server_authorize(p_user_id) OR NOT EXISTS(
  SELECT FROM private.run21_matches m, jsonb_array_elements(m.participants) p
  WHERE m.dealer_game_id=p_dealer_game_id AND p->>'userId'=p_user_id::text AND p->>'kind'='human'
 ) THEN RAISE EXCEPTION 'run21:close_denied' USING ERRCODE='42501'; END IF;
 PERFORM private.run21_finish_postgame(p_dealer_game_id);
END $$;
CREATE FUNCTION private.run21_continue_after_settlement() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.lifecycle_version=2 AND NOT NEW.finished AND nullif(NEW.state->'settlement','null'::jsonb) IS NOT NULL THEN
  PERFORM private.run21_finish_postgame(NEW.dealer_game_id);
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION private.run21_preserve_lifecycle_version() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.lifecycle_version IS DISTINCT FROM OLD.lifecycle_version THEN RAISE EXCEPTION 'run21:lifecycle_version_immutable'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.run21_continue_after_settlement(), private.run21_preserve_lifecycle_version() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER run21_preserve_lifecycle_version BEFORE UPDATE OF lifecycle_version ON private.run21_matches
 FOR EACH ROW EXECUTE FUNCTION private.run21_preserve_lifecycle_version();
CREATE TRIGGER zz_run21_continue AFTER INSERT OR UPDATE OF state ON private.run21_matches
 FOR EACH ROW EXECUTE FUNCTION private.run21_continue_after_settlement();
CREATE FUNCTION public.run21_recovery_finish(p_token uuid,p_dealer_game_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.run21_matches;
BEGIN
 SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id;
 IF NOT EXISTS(SELECT FROM private.run21_recovery_state WHERE singleton AND token=p_token AND claimed
  AND expires_at>clock_timestamp() AND m.game_id=ANY(games))
  OR m.lifecycle_version<>2 THEN RAISE EXCEPTION 'run21:recovery_token_denied' USING ERRCODE='42501'; END IF;
 IF nullif(m.state->'settlement','null'::jsonb) IS NULL THEN RETURN; END IF;
 PERFORM private.run21_finish_postgame(p_dealer_game_id);
END $$;
REVOKE ALL ON FUNCTION public.run21_recovery_finish(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run21_recovery_finish(uuid,uuid) TO service_role;
DO $$ DECLARE saved record; BEGIN
 SELECT * INTO STRICT saved FROM run21_lifecycle_preservation;
 IF saved.matches IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(m)-'lifecycle_version' ORDER BY dealer_game_id)::text,'')) FROM private.run21_matches m)
 OR saved.events IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY dealer_game_id,sequence)::text,'')) FROM private.run21_events e)
 OR saved.receipts IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY dealer_game_id)::text,'')) FROM private.run21_settlements s) THEN
  RAISE EXCEPTION 'run21:historical_records_changed';
 END IF;
END $$;
