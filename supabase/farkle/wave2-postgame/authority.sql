-- Additive Wave 2 continuation. No scoring, settlement, or existing-game owner changes.
CREATE TABLE IF NOT EXISTS private.farkle_postgame_control_v2 (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT true
);
INSERT INTO private.farkle_postgame_control_v2 VALUES(true,true)
 ON CONFLICT(singleton) DO UPDATE SET enabled=true;
CREATE TABLE IF NOT EXISTS private.farkle_postgame_receipts_v2 (
 game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
 dealer_game_id uuid NOT NULL REFERENCES public.dealer_games(id) ON DELETE CASCADE,
 round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
 hand_number integer NOT NULL CHECK(hand_number>0),
 winner_player_id uuid NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(game_id,dealer_game_id,round_id,hand_number)
);
ALTER TABLE private.farkle_postgame_control_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.farkle_postgame_receipts_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.farkle_postgame_control_v2,private.farkle_postgame_receipts_v2 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.farkle_advance_postgame(
 p_game_id uuid,p_round_id uuid,p_dealer_game_id uuid,p_hand_number integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE
 actor uuid:=auth.uid(); service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
 prior_claim text:=coalesce(current_setting('app.farkle_authority',true),'');
 r public.rounds; g public.games; receipt jsonb; outcome jsonb; winner uuid;
 result_count integer; active_count integer; human_count integer; eligible_count integer;
 allow_bots boolean:=false; make_take boolean:=false; positions integer[];
 next_position integer; target text; deadline timestamptz;
BEGIN
 IF p_game_id IS NULL OR p_round_id IS NULL OR p_dealer_game_id IS NULL OR p_hand_number IS NULL OR p_hand_number<1
 THEN RAISE EXCEPTION 'farkle_postgame:missing_identity'; END IF;
 IF actor IS NULL AND NOT service THEN RAISE EXCEPTION 'farkle_postgame:authentication_required' USING ERRCODE='42501'; END IF;
 -- Same serialization protocol as creation and forward recovery; held to COMMIT.
 PERFORM pg_advisory_xact_lock_shared(19092026,1);
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id FOR UPDATE;
 IF NOT FOUND OR r.game_id IS DISTINCT FROM p_game_id OR r.dealer_game_id IS DISTINCT FROM p_dealer_game_id
 OR r.hand_number IS DISTINCT FROM p_hand_number OR r.farkle_state IS NULL
 THEN RAISE EXCEPTION 'farkle_postgame:round_identity_mismatch'; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'farkle_postgame:missing_game'; END IF;
 IF NOT service AND NOT public.has_role(actor,'admin'::public.app_role)
 AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=p_game_id AND user_id=actor AND status<>'left')
 AND NOT EXISTS(SELECT 1 FROM public.session_player_snapshots WHERE game_id=p_game_id AND dealer_game_id=p_dealer_game_id
   AND hand_number=p_hand_number AND user_id=actor)
 THEN RAISE EXCEPTION 'farkle_postgame:not_in_session' USING ERRCODE='42501'; END IF;
 SELECT result INTO receipt FROM private.farkle_postgame_receipts_v2
 WHERE game_id=p_game_id AND dealer_game_id=p_dealer_game_id AND round_id=p_round_id AND hand_number=p_hand_number;
 IF FOUND THEN RETURN receipt||jsonb_build_object('outcome','already_advanced','deduped',true); END IF;
 IF NOT EXISTS(SELECT 1 FROM private.farkle_postgame_control_v2 WHERE singleton AND enabled)
 THEN RETURN jsonb_build_object('outcome','recovery_disabled'); END IF;
 IF g.game_type IS DISTINCT FROM 'farkle' OR g.current_game_uuid IS DISTINCT FROM p_dealer_game_id
 OR g.total_hands IS DISTINCT FROM p_hand_number OR g.current_round IS DISTINCT FROM r.round_number
 OR g.status NOT IN ('game_over','session_ended')
 THEN RETURN jsonb_build_object('outcome','stale_identity'); END IF;
 IF g.is_paused THEN RETURN jsonb_build_object('outcome','paused'); END IF;
 winner:=(r.farkle_state->>'winnerPlayerId')::uuid;
 IF r.status IS DISTINCT FROM 'completed' OR r.farkle_state->>'gamePhase' IS DISTINCT FROM 'complete' OR winner IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.dealer_games WHERE id=p_dealer_game_id AND session_id=p_game_id
   AND game_type='farkle' AND config=r.farkle_state->'config')
 THEN RAISE EXCEPTION 'farkle_postgame:not_terminal'; END IF;
 SELECT count(*) INTO result_count FROM public.game_results
 WHERE game_id=p_game_id AND dealer_game_id=p_dealer_game_id AND hand_number=p_hand_number
 AND game_type='farkle' AND settlement_key='farkle_terminal';
 IF result_count<>1 OR NOT EXISTS(SELECT 1 FROM public.game_results
 WHERE game_id=p_game_id AND dealer_game_id=p_dealer_game_id AND hand_number=p_hand_number
 AND settlement_key='farkle_terminal' AND winner_player_id=winner)
 THEN RAISE EXCEPTION 'farkle_postgame:settlement_not_committed'; END IF;
 -- Pending session end may already have been committed by Wave 1 settlement.
 -- Preserve that terminal frame for connected presentation and fresh admission.
 IF g.status='session_ended' THEN
  target:='session_ended';
 ELSE
  PERFORM private.farkle_claim_v1(p_game_id,p_dealer_game_id,p_round_id,'cleanup');
  PERFORM 1 FROM public.players WHERE game_id=p_game_id ORDER BY id FOR UPDATE;
  DELETE FROM public.players WHERE game_id=p_game_id AND is_bot AND stand_up_next_hand;
  UPDATE public.players SET
   status=CASE WHEN stand_up_next_hand THEN 'left' ELSE status END,
   sitting_out=CASE WHEN stand_up_next_hand OR sit_out_next_hand THEN true WHEN waiting THEN false ELSE sitting_out END,
   waiting=false,stand_up_next_hand=false,sit_out_next_hand=false,auto_fold=false,auto_play_stop_round_id=NULL,
   current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,ante_decision=NULL,auto_ante=false,auto_ante_runback=false
  WHERE game_id=p_game_id;
  SELECT count(*),count(*) FILTER(WHERE NOT is_bot) INTO active_count,human_count FROM public.players
   WHERE game_id=p_game_id AND NOT sitting_out AND status NOT IN ('observer','left') AND position IS NOT NULL;
  -- Same session-level dealer policy source as Yahtzee; no Farkle scoring defaults.
  SELECT coalesce(allow_bot_dealers,false) INTO allow_bots FROM public.game_defaults WHERE game_type='holm';
  allow_bots:=coalesce(allow_bots,false);
  SELECT array_agg(position ORDER BY position DESC),count(*) INTO positions,eligible_count FROM public.players
   WHERE game_id=p_game_id AND NOT sitting_out AND status NOT IN ('observer','left') AND position IS NOT NULL
    AND (allow_bots OR NOT is_bot);
  IF g.pending_session_end THEN target:='session_ended';
  ELSIF human_count=0 OR active_count<2 OR eligible_count=0 THEN
   -- Canonical participant admission distinguishes seated/sitting-out humans
   -- from a truly ended session and preserves its financial finalization rules.
   PERFORM private.resolve_postgame_participation(p_game_id,clock_timestamp());
   SELECT status INTO target FROM public.games WHERE id=p_game_id;
  ELSE
   SELECT coalesce((value->>'enabled')::boolean,false) INTO make_take FROM public.system_settings WHERE key='make_it_take_it';
   IF coalesce(make_take,false) THEN
    SELECT position INTO next_position FROM public.players WHERE id=winner AND game_id=p_game_id
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
  UPDATE public.games SET status=target,config_complete=false,config_deadline=deadline,ante_decision_deadline=NULL,
   last_round_result=NULL,current_round=NULL,awaiting_next_round=false,next_round_number=NULL,pot=0,
   all_decisions_in=false,all_decisions_in_round_id=NULL,game_over_at=NULL,buck_position=NULL,total_hands=0,
   is_first_hand=false,current_game_uuid=NULL,dealer_selection_state=NULL,
   dealer_position=CASE WHEN target='game_selection' THEN next_position ELSE dealer_position END,
   pending_session_end=CASE WHEN target='session_ended' THEN false ELSE pending_session_end END,
   session_ended_at=CASE WHEN target='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END
  WHERE id=p_game_id;
 END IF;
 outcome:=jsonb_build_object('outcome','advanced','deduped',false,'status',target,'winner_player_id',winner,
  'dealer_position',CASE WHEN target='game_selection' THEN next_position END,'config_deadline',deadline);
 INSERT INTO private.farkle_postgame_receipts_v2(game_id,dealer_game_id,round_id,hand_number,winner_player_id,result)
 VALUES(p_game_id,p_dealer_game_id,p_round_id,p_hand_number,winner,outcome);
 PERFORM set_config('app.farkle_authority',prior_claim,true);
 RETURN outcome;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.farkle_authority',prior_claim,true); RAISE;
END $f$;
REVOKE ALL ON FUNCTION public.farkle_advance_postgame(uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.farkle_advance_postgame(uuid,uuid,uuid,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.farkle_sync_postgame_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE r public.rounds;
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'farkle' OR NEW.status IS DISTINCT FROM 'game_over'
 OR NEW.current_game_uuid IS NULL OR NEW.game_over_at IS NULL
 OR NOT EXISTS(SELECT 1 FROM private.farkle_postgame_control_v2 WHERE singleton AND enabled) THEN RETURN NEW; END IF;
 SELECT * INTO STRICT r FROM public.rounds WHERE game_id=NEW.id AND dealer_game_id=NEW.current_game_uuid
  AND hand_number=NEW.total_hands AND round_number=NEW.current_round;
 IF r.status IS DISTINCT FROM 'completed' OR r.farkle_state->>'gamePhase' IS DISTINCT FROM 'complete'
 THEN RAISE EXCEPTION 'farkle_postgame:timer_not_terminal'; END IF;
 -- Durable fallback mirrors the established 15-second dice presentation window.
 -- Connected clients call the same owner on actual presentation completion.
 PERFORM private.register_game_timer(NEW.id,'farkle_postgame',r.id::text,'canonical_timers',
  NEW.game_over_at+interval '15 seconds',r.dealer_game_id,r.id,r.hand_number,NULL,'game_over','{}');
 -- Do not lock/cancel this timer from continuation: workers lock timer before
 -- round/game. A late worker reads the durable receipt and completes harmlessly.
 RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION private.farkle_sync_postgame_v2() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS farkle_sync_postgame_v2 ON public.games;
CREATE TRIGGER farkle_sync_postgame_v2 AFTER INSERT OR UPDATE OF status,current_game_uuid,game_over_at ON public.games
 FOR EACH ROW EXECUTE FUNCTION private.farkle_sync_postgame_v2();
