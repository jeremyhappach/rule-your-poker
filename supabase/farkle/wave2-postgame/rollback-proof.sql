BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='90s';
DO $guard$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.advance_due_canonical_game_timers(integer)'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('e7c784e3fa2e412d3333ffd2355096f4','3f60fdfc00de2466dd2f31060892db0d') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig=ARRAY['search_path=""']::text[] AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false) THEN RAISE EXCEPTION 'farkle_wave2:shared_metadata_drift'; END IF; END $guard$;
DO $gate$ BEGIN IF NOT EXISTS(SELECT 1 FROM private.farkle_release WHERE singleton AND NOT creation_enabled AND admin_only AND NOT production_defaults_approved) OR EXISTS(SELECT 1 FROM public.game_defaults WHERE game_type='farkle') THEN RAISE EXCEPTION 'farkle_wave2:release_gate_changed'; END IF; END $gate$;
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

CREATE OR REPLACE FUNCTION private.advance_due_canonical_game_timers(p_limit integer DEFAULT 64)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_timer private.game_timer_registry%ROWTYPE;
  v_legacy record;
  v_result jsonb;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_decision text;
  v_fold_probability numeric;
  v_processed integer:=0;
  v_failed integer:=0;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  FOR v_timer IN
    SELECT timer.*
      FROM private.game_timer_registry timer
      JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE timer.owner_task='canonical_timers'
       AND timer.state='scheduled'
       AND timer.due_at<=clock_timestamp()
       AND NOT coalesce(game_row.is_paused,false)
     ORDER BY timer.due_at,timer.id
     LIMIT greatest(1,least(coalesce(p_limit,64),256))
     FOR UPDATE OF timer SKIP LOCKED
  LOOP
    UPDATE private.game_timer_registry
       SET state='processing',attempt_count=attempt_count+1,
           last_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_timer.id;
    BEGIN
      v_result:=NULL;
      CASE v_timer.timer_kind
        WHEN 'dealer_selection_prepare' THEN
          v_result:=private.prepare_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'dealer_selection_complete' THEN
          v_result:=private.complete_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'config_timeout' THEN
          v_result:=private.handle_config_deadline_timeout_exact(
            v_timer.game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            (v_timer.metadata->>'expected_dealer_position')::integer
          );
        WHEN 'ante_phase' THEN
          v_result:=private.advance_ante_phase_exact(
            v_timer.game_id,v_timer.dealer_game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            clock_timestamp()
          );
        WHEN 'holm_decision' THEN
          SELECT * INTO v_player FROM public.players
           WHERE id=v_timer.actor_player_id;
          IF NOT FOUND THEN
            v_result:=jsonb_build_object('outcome','stale_actor');
          ELSE
            IF coalesce(v_player.is_bot,false) THEN
              SELECT coalesce(defaults.bot_fold_probability,30)
                INTO v_fold_probability FROM public.game_defaults defaults
               WHERE defaults.game_type='holm' LIMIT 1;
              v_decision:=CASE WHEN private.secure_random_unit()*100<coalesce(v_fold_probability,30)
                               THEN 'fold' ELSE 'stay' END;
            ELSE
              v_decision:='fold';
            END IF;
            SELECT public.holm_apply_deadline_decision(
              v_timer.game_id,v_timer.round_id,v_player.id,v_decision,
              NOT coalesce(v_player.is_bot,false)
            ) INTO v_result;
          END IF;
        WHEN 'farkle_postgame' THEN
          v_result:=public.farkle_advance_postgame(
            v_timer.game_id,v_timer.round_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        WHEN 'farkle_turn' THEN
          v_result:=private.farkle_advance_due_v1(v_timer.round_id,clock_timestamp());
        WHEN 'horses_scc_turn' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
        WHEN 'horses_scc_terminal' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
          IF v_result->>'status'='tie_waiting_for_client' THEN
            v_result:=private.horses_scc_rollover_abandoned_round(
              v_timer.round_id,clock_timestamp()
            );
          END IF;
        WHEN 'standard_postgame' THEN
          v_result:=private.advance_standard_postgame(
            v_timer.game_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        ELSE
          RAISE EXCEPTION 'advance_due_canonical_game_timers:unknown_kind:%',
            v_timer.timer_kind;
      END CASE;

      IF v_result->>'outcome' IN ('pending','paused','not_prepared','no_eligible_players','deadline_not_expired') THEN
        SELECT * INTO v_game FROM public.games WHERE id=v_timer.game_id;
        UPDATE private.game_timer_registry
           SET state='scheduled',
               due_at=CASE WHEN v_result->>'outcome' IN ('pending','deadline_not_expired')
                 AND v_result->>'deadline' IS NOT NULL
                 THEN (v_result->>'deadline')::timestamptz
                 ELSE clock_timestamp()+interval '1 second' END,
               metadata=CASE WHEN v_timer.timer_kind='ante_phase'
                 AND v_game.ante_decision_deadline IS NOT NULL
                 THEN metadata || jsonb_build_object(
                   'expected_deadline',v_game.ante_decision_deadline
                 ) ELSE metadata END,
               updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      ELSE
        UPDATE private.game_timer_registry
           SET state='completed',completed_at=clock_timestamp(),
               metadata=metadata || jsonb_build_object(
                 'result',coalesce(v_result,'{}'::jsonb)
               ),updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      END IF;
      v_processed:=v_processed+1;
    EXCEPTION WHEN OTHERS THEN
      v_error:=SQLSTATE || ':' || SQLERRM;
      UPDATE private.game_timer_registry
         SET state='scheduled',due_at=clock_timestamp()+interval '5 seconds',
             last_error=v_error,updated_at=clock_timestamp()
       WHERE id=v_timer.id;
      v_failed:=v_failed+1;
    END;
  END LOOP;

  -- Client-created legacy dice rounds used NULL as a bot-delay sentinel.
  -- Convert only the exact active post-cutover actor to a database timestamp;
  -- no historical row is scanned or admitted.
  FOR v_legacy IN
    SELECT round_row.id,round_row.game_id,defaults.bot_decision_delay_seconds
    FROM public.rounds round_row CROSS JOIN public.games game_row
    JOIN public.game_defaults defaults
      ON defaults.game_type=game_row.game_type
    JOIN public.players actor
      ON actor.game_id=game_row.id AND actor.is_bot=true
   WHERE round_row.game_id=game_row.id
     AND game_row.game_type IN ('horses','ship-captain-crew')
     AND game_row.status='in_progress'
     AND NOT coalesce(game_row.is_paused,false)
     AND game_row.current_game_uuid IS NOT DISTINCT FROM round_row.dealer_game_id
     AND round_row.horses_state->>'gamePhase'='playing'
     AND nullif(round_row.horses_state->>'turnDeadline','') IS NULL
     AND actor.id::text=round_row.horses_state->>'currentTurnPlayerId'
     AND EXISTS (
       SELECT 1 FROM private.game_timer_cutover cutover
        WHERE cutover.singleton=true
          AND game_row.timer_generation>0
     )
     AND NOT private.recovery_session_deferred('canonical_timers',game_row.id)
     ORDER BY round_row.id LIMIT 64
  LOOP
    BEGIN
      UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{turnDeadline}',to_jsonb(
        clock_timestamp()+make_interval(secs=>greatest(0.1,coalesce(v_legacy.bot_decision_delay_seconds,2)))),true)
      WHERE id=v_legacy.id;
      PERFORM private.clear_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN jsonb_build_object(
    'outcome',CASE WHEN v_failed=0 THEN 'completed' ELSE 'partial_failure' END,
    'processed',v_processed,'failed',v_failed
  );
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$
;

-- Caller wraps candidate + this proof + recovery twice in BEGIN/ROLLBACK.
-- Every numeric rule in this file is TEST ONLY, not a production recommendation.
CREATE TEMP TABLE farkle_proof_log(case_name text PRIMARY KEY);
CREATE FUNCTION pg_temp.farkle_identity(id uuid) RETURNS void LANGUAGE plpgsql AS $p$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',id::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::text,true);
END $p$;
CREATE FUNCTION pg_temp.farkle_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $p$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'farkle_proof:%',label; END IF;
 INSERT INTO farkle_proof_log VALUES(label); END $p$;
CREATE TEMP TABLE farkle_test_config(config jsonb);
INSERT INTO farkle_test_config VALUES ('{"version":1,"testOnly":true,"testLabel":"TEST ONLY: authority proof; NOT APPROVED PRODUCTION RULES","ante_amount":7,"targetScore":1000,"endgame":"immediate","turnSeconds":30,"botDelayMs":1000,"botPolicy":"balanced","botBankThreshold":100,"rules":{"version":1,"singles":{"1":100,"5":50},"ofAKind":{"3":[1000,200,300,400,500,600],"4":[2000,2000,2000,2000,2000,2000],"5":[3000,3000,3000,3000,3000,3000],"6":[4000,4000,4000,4000,4000,4000]},"straight":1500,"threePairs":1500,"twoTriplets":2500,"fourPlusPair":1500}}');

DO $proof$ DECLARE c jsonb; rules jsonb; s jsonb; original jsonb; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); ids jsonb; denied boolean; mode text;
BEGIN
 SELECT config INTO c FROM farkle_test_config; rules:=c->'rules'; ids:=jsonb_build_array(a,b,d);
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,1,1],rules)=1000,'selected triple only');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,1,1,1],rules)=2000,'best four interpretation');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,1,1,1],jsonb_set(rules,'{ofAKind,4,0}','1000'))=1100,'triple plus single beats four kind');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,1,1,1,1,1],rules)=4000,'best six interpretation');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,2,3,4,5,6],rules)=1500,'straight');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[2,2,3,3,4,4],rules)=1500,'three pairs');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[2,2,2,3,3,3],rules)=2500,'two triplets');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[2,2,2,2,3,3],rules)=1500,'four plus pair');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,5],rules)=150,'independent scoring partition');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,2],rules)=0,'every selected die must score');
 s:=private.farkle_new_state_v1(ids,c,gen_random_uuid());
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,2,3,4,6,2]);
 s:=private.farkle_reduce_v1(s,'hold','[0]');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,1,2,3,4]);
 denied:=false; BEGIN PERFORM private.farkle_reduce_v1(s,'hold','[0,1,2]');
 EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:non_scoring_selection'; END;
 PERFORM pg_temp.farkle_assert(denied,'previous roll indexes cannot join a later hold');
 s:=private.farkle_reduce_v1(s,'hold','[1,2]');
 PERFORM pg_temp.farkle_assert(s->>'thisTurn'='300','ones across rolls cannot become a triple');
 s:=private.farkle_new_state_v1(ids,c,gen_random_uuid());
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,5,2,3,4,4]);
 PERFORM pg_temp.farkle_assert(s->>'thisTurn'='0' AND s->>'stage'='hold','roll does not commit scoring');
 s:=private.farkle_reduce_v1(s,'hold','[0,1]');
 PERFORM pg_temp.farkle_assert(s->>'thisTurn'='150' AND s->'available'='[2,3,4,5]'::jsonb,'partial hold');
 denied:=false;BEGIN PERFORM private.farkle_reduce_v1(s,'hold','[2]'); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:illegal_hold'; END;
 PERFORM pg_temp.farkle_assert(denied,'one hold per roll');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,2,2,2]);
 s:=private.farkle_reduce_v1(s,'hold','[2,3,4,5]');
 PERFORM pg_temp.farkle_assert(s->>'thisTurn'='2150' AND s->>'scoringCycle'='2' AND s->'available'='[0,1,2,3,4,5]'::jsonb,'hot dice across rolls');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
 PERFORM pg_temp.farkle_assert(s->>'thisTurn'='0' AND s->>'currentTurnPlayerId'=b::text AND s->'playerStates'->a::text->>'completedTurns'='1'
 AND s->'playerStates'->a::text->>'banked'='0','farkle loses whole accumulated turn only');
 FOREACH mode IN ARRAY ARRAY['immediate','equal_turns','one_last_turn'] LOOP
  s:=private.farkle_new_state_v1(ids,c||jsonb_build_object('endgame',mode),gen_random_uuid());
  s:=s||jsonb_build_object('stage','bank_or_roll','thisTurn',1000);
  s:=private.farkle_reduce_v1(s,'bank','[]');
  IF mode='immediate' THEN PERFORM pg_temp.farkle_assert(s->>'gamePhase'='complete' AND s->>'winnerPlayerId'=a::text,'immediate terminal');
  ELSE
   PERFORM pg_temp.farkle_assert(s->'finalQueue'=jsonb_build_array(b,d),'final queue '||mode);
   s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
   s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
   PERFORM pg_temp.farkle_assert(s->>'gamePhase'='complete' AND s->>'winnerPlayerId'=a::text
    AND NOT EXISTS(SELECT 1 FROM jsonb_each(s->'playerStates') WHERE value->>'completedTurns'<>'1'),'exact final counts '||mode);
  END IF;
 END LOOP;
 -- Trigger in the middle of a cycle. Last-turn queue wraps past the dealer,
 -- excludes the trigger and is not restarted by later target-reaching BANKs.
 s:=private.farkle_new_state_v1(ids,c||jsonb_build_object('endgame','one_last_turn'),gen_random_uuid());
 s:=jsonb_set(s,ARRAY['playerStates',a::text,'completedTurns'],'1');
 s:=s||jsonb_build_object('currentTurnPlayerId',b,'stage','bank_or_roll','thisTurn',1000);
 s:=private.farkle_reduce_v1(s,'bank','[]');
 PERFORM pg_temp.farkle_assert(s->'finalQueue'=jsonb_build_array(d,a),'one last turn clockwise wrap');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
 s:=private.farkle_reduce_v1(s||jsonb_build_object('stage','bank_or_roll','thisTurn',1000),'bank','[]');
 PERFORM pg_temp.farkle_assert(s->>'tiebreakTurn'='1' AND s->'eligible'=jsonb_build_array(a,b)
  AND s->'playerStates'->a::text->>'completedTurns'='2' AND s->'playerStates'->b::text->>'completedTurns'='1','equal tiebreak exact lifetime counts');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
 PERFORM pg_temp.farkle_assert(s->>'tiebreakTurn'='2' AND s->'finalQueue'=jsonb_build_array(a,b),'repeat equal tiebreak cycle');
 s:=private.farkle_reduce_v1(s||jsonb_build_object('stage','bank_or_roll','thisTurn',100),'bank','[]');
 PERFORM pg_temp.farkle_assert(s->>'gamePhase'='playing' AND s->>'currentTurnPlayerId'=b::text,'tiebreak leader cannot finish early');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
 PERFORM pg_temp.farkle_assert(s->>'winnerPlayerId'=a::text AND s->'playerStates'->d::text->>'completedTurns'='1','tiebreak winner excludes prior nonleaders');
END $proof$;

DO $proof$ DECLARE admin_id uuid; other_id uuid; fixture_game_id uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 c jsonb; input jsonb; g public.games; dg uuid; rd uuid; s jsonb; before_state jsonb; answer jsonb; replay jsonb; req uuid; bank_req uuid;
 denied boolean; intent bigint; version bigint; first_actor uuid; actor_user uuid; cash jsonb; after_cash jsonb; cfg_deadline timestamptz:=clock_timestamp()+interval '15 minutes';
BEGIN
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 SELECT id INTO other_id FROM public.profiles WHERE id<>admin_id AND NOT public.has_role(id,'admin'::public.app_role) ORDER BY id LIMIT 1;
 IF admin_id IS NULL OR other_id IS NULL THEN RAISE EXCEPTION 'farkle_proof:requires_admin_and_peer'; END IF;
 PERFORM pg_temp.farkle_identity(admin_id);
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true); PERFORM set_config('request.jwt.claim.role','authenticated',true);
 SELECT config INTO c FROM farkle_test_config;
 input:=jsonb_build_object('ante_amount',7,'targetScore',1000,'endgame','immediate','testConfiguration',
  jsonb_build_object('testOnly',true,'label',c->'testLabel','rules',c->'rules','turnSeconds',30,'botDelayMs',1000,'botBankThreshold',100,'botPolicy','balanced'));
 INSERT INTO public.games(id,name,status,game_type,current_host,dealer_position,config_complete,config_deadline,real_money,pot,current_round,total_hands)
 VALUES(fixture_game_id,'TEST ONLY: Farkle rollback proof','game_selection',NULL,admin_id,1,false,cfg_deadline,false,0,0,0);
 INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,is_bot) VALUES
 (a,fixture_game_id,admin_id,1,100,'active',false,false),(b,fixture_game_id,other_id,3,100,'active',false,false);
 denied:=false;BEGIN PERFORM public.configure_dealer_game(fixture_game_id,a,1,'farkle',input,cfg_deadline); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:creation_disabled'; END;
 PERFORM pg_temp.farkle_assert(denied,'creation disabled before client release');
 UPDATE private.farkle_release SET creation_enabled=true WHERE singleton;
 PERFORM pg_temp.farkle_identity(other_id);
 UPDATE public.games SET dealer_position=3 WHERE id=fixture_game_id;
 denied:=false;BEGIN PERFORM public.configure_dealer_game(fixture_game_id,b,3,'farkle',input,cfg_deadline); EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'farkle:admin_only' THEN RAISE; END IF; denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'nonadmin direct setup rejected');
 UPDATE public.games SET dealer_position=1 WHERE id=fixture_game_id;
 PERFORM pg_temp.farkle_identity(admin_id);
 denied:=false;BEGIN PERFORM public.configure_dealer_game(fixture_game_id,a,1,'farkle',input-'testConfiguration',cfg_deadline); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:production_defaults_unapproved'; END;
 PERFORM pg_temp.farkle_assert(denied,'unapproved defaults never resolve');
 answer:=public.configure_dealer_game(fixture_game_id,a,1,'farkle',input,cfg_deadline); dg:=(answer->'dealer_game'->>'id')::uuid;
 answer:=public.configure_dealer_game(fixture_game_id,a,1,'farkle',input,cfg_deadline);
 PERFORM pg_temp.farkle_assert(answer->>'deduped'='true','idempotent configuration');
 denied:=false;BEGIN UPDATE public.dealer_games SET config=jsonb_set(config,'{rules,singles,1}','999') WHERE id=dg; EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:frozen_config_immutable'; END;
 PERFORM pg_temp.farkle_assert(denied,'frozen rules cannot change');
 denied:=false;BEGIN UPDATE public.dealer_games SET game_type='horses' WHERE id=dg; EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:frozen_config_immutable'; END;
 PERFORM pg_temp.farkle_assert(denied,'game type cannot bypass immutable rules');
 SELECT * INTO g FROM public.games WHERE id=fixture_game_id;
 PERFORM private.farkle_claim_v1(g.id,dg,NULL,'configure'); -- trusted synthetic fixture writes only
 PERFORM pg_temp.farkle_assert(private.farkle_resolve_config_v1(g,jsonb_build_object('ante_amount',7,'runBackDealerGameId',dg))=(SELECT config FROM public.dealer_games WHERE id=dg),'run back uses exact frozen snapshot');
 UPDATE public.players SET ante_decision='ante_up' WHERE game_id=g.id;
 answer:=private.advance_ante_phase_exact(g.id,dg,g.ante_decision_deadline,clock_timestamp());
 SELECT id,farkle_state INTO rd,s FROM public.rounds WHERE dealer_game_id=dg;
 PERFORM set_config('app.farkle_authority','',true);
 denied:=false; BEGIN PERFORM public.increment_player_chips(b,1); EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:authority_claim_required'; END;
 PERFORM pg_temp.farkle_assert(denied,'generic increment definer cannot move Farkle chips');
 denied:=false; BEGIN PERFORM public.decrement_player_chips(ARRAY[b],1); EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:authority_claim_required'; END;
 PERFORM pg_temp.farkle_assert(denied,'generic decrement definer cannot move Farkle chips');
 denied:=false; BEGIN UPDATE public.rounds SET farkle_state=NULL WHERE id=rd; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'owner role without claim cannot clear Farkle state');
 denied:=false; BEGIN UPDATE public.games SET game_type='horses' WHERE id=g.id; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'owner role without claim cannot switch Farkle game');
 PERFORM pg_temp.farkle_assert(s->'turnOrder'=jsonb_build_array(b,a) AND s->>'currentTurnPlayerId'=b::text,'left of dealer across empty seat');
 PERFORM pg_temp.farkle_assert((SELECT sum(chips) FROM public.players WHERE game_id=g.id)=200 AND (SELECT pot FROM public.games WHERE id=g.id)=0,'no chip ante for fixed stake');
 PERFORM pg_temp.farkle_identity(other_id);
 req:=gen_random_uuid(); answer:=public.farkle_apply_action(rd,b,'roll',0,req);
 replay:=public.farkle_apply_action(rd,b,'roll',0,req);
 PERFORM pg_temp.farkle_assert(coalesce(current_setting('app.farkle_authority',true),'')='','action authority claim cannot leak to next RPC');
 PERFORM pg_temp.farkle_assert(answer->>'outcome'='applied' AND replay->>'deduped'='true' AND answer->'state'=replay->'state','duplicate roll never rerolls');
 denied:=false;BEGIN PERFORM public.farkle_apply_action(rd,b,'bank',0,req); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:replay_payload_mismatch'; END;
 PERFORM pg_temp.farkle_assert(denied,'request id payload binding');
 PERFORM pg_temp.farkle_assert(public.farkle_apply_action(rd,b,'roll',0,gen_random_uuid())->>'outcome'='stale_action','stale sequence rejected');
 PERFORM pg_temp.farkle_identity(gen_random_uuid());
 denied:=false;BEGIN PERFORM public.farkle_apply_action(rd,b,'roll',1,gen_random_uuid()); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'outsider cannot act');
 -- Fresh deterministic authority fixture state, not client-supplied randomness.
 PERFORM private.farkle_claim_v1(g.id,dg,NULL,'configure');
 s:=private.farkle_new_state_v1(jsonb_build_array(b,a),c,rd);
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,5,2,3,4,4]);
 s:=s||jsonb_build_object('actionSequence',10,'turnDeadline',clock_timestamp()-interval '1 second');
 UPDATE public.rounds SET farkle_state=s WHERE id=rd;
 UPDATE public.games SET real_money=true WHERE id=g.id;
 before_state:=s; answer:=private.farkle_advance_due_v1(rd);
 SELECT farkle_state INTO s FROM public.rounds WHERE id=rd;
 PERFORM pg_temp.farkle_assert((SELECT is_paused FROM public.games WHERE id=g.id) AND (s-'turnDeadline')=(before_state-'turnDeadline')
 AND NOT (SELECT auto_fold FROM public.players WHERE id=b),'real timeout pauses without scoring decisions');
 SELECT pause_version INTO version FROM public.games WHERE id=g.id;
 PERFORM pg_temp.farkle_identity(admin_id);
 answer:=public.set_game_paused(g.id,false,dg,version);
 PERFORM pg_temp.farkle_assert(answer->>'outcome'='resumed' AND (SELECT (farkle_state->>'turnDeadline')::timestamptz>clock_timestamp() FROM public.rounds WHERE id=rd),'resume gives human decision window');
 UPDATE public.games SET real_money=false WHERE id=g.id;
 UPDATE public.rounds SET farkle_state=jsonb_set(farkle_state,'{turnDeadline}',to_jsonb(clock_timestamp()-interval '1 second')) WHERE id=rd;
 answer:=private.farkle_advance_due_v1(rd);
 PERFORM pg_temp.farkle_assert(answer->>'outcome'='applied' AND (SELECT auto_fold AND sit_out_next_hand FROM public.players WHERE id=b)
 AND answer->'state'->>'stage'='bank_or_roll','fake timeout uses authoritative hold path');
 PERFORM pg_temp.farkle_identity(other_id);
 SELECT intent_version INTO intent FROM public.players WHERE id=b;
 answer:=public.set_automatic_play(g.id,rd,dg,b,intent,false);
 PERFORM pg_temp.farkle_assert(answer->>'deferred'='true' AND (SELECT auto_fold AND auto_play_stop_round_id=rd AND NOT sit_out_next_hand FROM public.players WHERE id=b),'active turn reclaim is persisted and deferred');
 PERFORM public.read_session_frame(g.id);
 PERFORM pg_temp.farkle_assert((SELECT auto_fold AND auto_play_stop_round_id=rd FROM public.players WHERE id=b),'reconnect does not reclaim');
 -- Shared resume writes Horses columns too: it must not consume Farkle's request.
 UPDATE public.rounds SET horses_state=horses_state WHERE id=rd;
 PERFORM pg_temp.farkle_assert((SELECT auto_fold AND auto_play_stop_round_id=rd FROM public.players WHERE id=b),'shared consume respects active Farkle turn');
 UPDATE public.rounds SET farkle_state=jsonb_set(farkle_state,'{turnDeadline}',to_jsonb(clock_timestamp()-interval '1 second')) WHERE id=rd;
 answer:=private.farkle_advance_due_v1(rd);
 PERFORM pg_temp.farkle_assert(answer->>'outcome'='applied' AND answer->'state'->>'currentTurnPlayerId'=a::text
 AND (SELECT NOT auto_fold AND auto_play_stop_round_id IS NULL FROM public.players WHERE id=b),'bank completes deferred reclaim');
 SELECT farkle_state INTO s FROM public.rounds WHERE id=rd;
 s:=s||jsonb_build_object('stage','bank_or_roll','thisTurn',1000);
 UPDATE public.rounds SET farkle_state=s WHERE id=rd;
 PERFORM pg_temp.farkle_identity(admin_id);
 bank_req:=gen_random_uuid();answer:=public.farkle_apply_action(rd,a,'bank',(s->>'actionSequence')::bigint,bank_req);
 SELECT jsonb_object_agg(id,chips) INTO cash FROM public.players WHERE game_id=g.id;
 PERFORM pg_temp.farkle_assert(cash->>a::text='107' AND cash->>b::text='93' AND (SELECT count(*) FROM public.game_results WHERE dealer_game_id=dg AND settlement_key='farkle_terminal')=1,'fixed stake winner paid once');
 replay:=public.farkle_apply_action(rd,a,'bank',(s->>'actionSequence')::bigint,bank_req);
 PERFORM pg_temp.farkle_assert(replay->>'deduped'='true' AND replay->'settlement'=answer->'settlement','terminal action replay receipt');
 PERFORM private.farkle_settle_v1(rd);
 PERFORM pg_temp.farkle_assert((SELECT jsonb_object_agg(id,chips) FROM public.players WHERE game_id=g.id)=cash,'settlement replay cannot move chips');
 PERFORM pg_temp.farkle_assert((SELECT count(*) FROM public.session_player_snapshots WHERE dealer_game_id=dg)=2
 AND (SELECT status FROM public.rounds WHERE id=rd)='completed' AND (SELECT status FROM public.games WHERE id=g.id)='game_over','terminal snapshots and lifecycle');
 replay:=public.farkle_read_replay(rd);
 PERFORM pg_temp.farkle_assert(replay->'config'=(SELECT config FROM public.dealer_games WHERE id=dg)
 AND jsonb_array_length(replay->'events')>=4,'semantic replay retains frozen rules and events');
 UPDATE public.games SET game_type='yahtzee',status='game_selection',current_game_uuid=NULL WHERE id=g.id;
 replay:=public.farkle_apply_action(rd,a,'bank',(s->>'actionSequence')::bigint,bank_req);
 PERFORM pg_temp.farkle_assert(replay->>'deduped'='true' AND (SELECT jsonb_object_agg(id,chips) FROM public.players WHERE game_id=g.id)=cash,'late replay after game transition');
 PERFORM pg_temp.farkle_assert(NOT has_function_privilege('authenticated','private.farkle_reduce_v1(jsonb,text,jsonb,integer[])','EXECUTE'),'private authority not publicly executable');
 UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
END $proof$;

-- Synthetic fixtures only; this entire file runs inside the outer rollback.
CREATE FUNCTION pg_temp.farkle_generic_definer(target_game uuid,target_round uuid,target_player uuid,target_dealer uuid,kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $p$
BEGIN
 CASE kind
 WHEN 'game' THEN UPDATE public.games SET pot=pot+1 WHERE id=target_game;
 WHEN 'round' THEN UPDATE public.rounds SET farkle_state=NULL WHERE id=target_round;
 WHEN 'round_insert' THEN INSERT INTO public.rounds(game_id,hand_number,round_number,cards_dealt,status,pot) VALUES(target_game,2,2,0,'betting',0);
 WHEN 'player' THEN UPDATE public.players SET chips=chips+1 WHERE id=target_player;
 WHEN 'delete_player' THEN DELETE FROM public.players WHERE id=target_player;
 WHEN 'delete_game' THEN DELETE FROM public.games WHERE id=target_game;
 WHEN 'result' THEN INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,game_type,winner_player_id,pot_won) VALUES(target_game,target_dealer,1,'farkle',target_player,99);
 WHEN 'snapshot' THEN INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,hand_number,player_id,user_id,username,chips,is_bot)
 SELECT target_game,target_dealer,1,id,user_id,'TEST ONLY',999,is_bot FROM public.players WHERE id=target_player;
 END CASE;
END $p$;
DO $proof$
DECLARE admin_id uuid; peer_id uuid; bot_user uuid; gid uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); bot uuid:=gen_random_uuid();
 c jsonb; input jsonb; g public.games; dg uuid; rd uuid; s jsonb; ans jsonb; denied boolean; intent bigint; deadline timestamptz; kind text;
BEGIN
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 SELECT id INTO peer_id FROM public.profiles WHERE id<>admin_id AND NOT public.has_role(id,'admin'::public.app_role) ORDER BY id LIMIT 1;
 SELECT id INTO bot_user FROM public.profiles WHERE id NOT IN (admin_id,peer_id) ORDER BY id LIMIT 1;
 SELECT config INTO c FROM farkle_test_config;
 input:=jsonb_build_object('ante_amount',7,'targetScore',1000,'endgame','immediate','testConfiguration',
  jsonb_build_object('testOnly',true,'label',c->'testLabel','rules',c->'rules','turnSeconds',30,'botDelayMs',1000,'botBankThreshold',100,'botPolicy','balanced'));
 PERFORM set_config('app.farkle_authority','',true);
 PERFORM pg_temp.farkle_identity(admin_id);
 UPDATE private.farkle_release SET creation_enabled=true,admin_only=false WHERE singleton;
 deadline:=clock_timestamp()+interval '15 minutes';
 INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline,real_money,pot,current_round,total_hands)
 VALUES(gid,'TEST ONLY: Farkle hardening','game_selection',admin_id,4,false,deadline,false,0,0,0);
 INSERT INTO public.players(id,game_id,user_id,position,chips,status,is_bot) VALUES
 (a,gid,admin_id,4,100,'active',false),(b,gid,peer_id,3,100,'active',false),(bot,gid,bot_user,5,100,'active',true);
 SELECT * INTO g FROM public.games WHERE id=gid;
 PERFORM pg_temp.farkle_identity(peer_id);
 denied:=false; BEGIN PERFORM private.farkle_resolve_config_v1(g,input); EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:test_config_admin_only'; END;
 PERFORM pg_temp.farkle_assert(denied,'test configuration stays admin only with public release gate');
 UPDATE public.games SET dealer_position=3 WHERE id=gid;
 denied:=false; BEGIN PERFORM public.configure_dealer_game(gid,b,3,'farkle',input,deadline); EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:test_config_admin_only'; END;
 PERFORM pg_temp.farkle_assert(denied,'public dealer RPC rejects nonadmin test scoring after release gate opens');
 UPDATE public.games SET dealer_position=4 WHERE id=gid;
 PERFORM pg_temp.farkle_identity(admin_id);
 g.real_money:=true;
 denied:=false; BEGIN PERFORM private.farkle_resolve_config_v1(g,input); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:test_rules_fake_money_only'; END;
 PERFORM pg_temp.farkle_assert(denied,'real money rejects test scoring');
 g.real_money:=false;
 denied:=false; BEGIN PERFORM private.farkle_resolve_config_v1(g,jsonb_set(input,'{testConfiguration,botPolicy}','"aggressive"')); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:unsupported_bot_policy'; END;
 PERFORM pg_temp.farkle_assert(denied,'unimplemented aggressive policy rejected');
 denied:=false; BEGIN PERFORM private.farkle_resolve_config_v1(g,jsonb_set(input,'{testConfiguration,botPolicy}','"conservative"')); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:unsupported_bot_policy'; END;
 PERFORM pg_temp.farkle_assert(denied,'unimplemented conservative policy rejected');
 ans:=public.configure_dealer_game(gid,a,4,'farkle',input,deadline); dg:=(ans->'dealer_game'->>'id')::uuid;
 PERFORM pg_temp.farkle_assert(coalesce(current_setting('app.farkle_authority',true),'')='','configuration claim restored after return');
 PERFORM private.farkle_claim_v1(gid,dg,NULL,'configure');
 UPDATE public.players SET ante_decision='ante_up',sitting_out=false WHERE game_id=gid;
 UPDATE public.players SET auto_fold=true WHERE id=b;
 SELECT * INTO g FROM public.games WHERE id=gid;
 PERFORM private.advance_ante_phase_exact(gid,dg,g.ante_decision_deadline,clock_timestamp());
 SELECT id,farkle_state INTO rd,s FROM public.rounds WHERE dealer_game_id=dg;
 PERFORM pg_temp.farkle_assert(s->'turnOrder'=jsonb_build_array(b,bot,a),'middle dealer lower occupied seats clockwise with gaps 3 5 4');
 PERFORM pg_temp.farkle_assert((s->>'turnDeadline')::timestamptz BETWEEN clock_timestamp()-interval '1 second' AND clock_timestamp()+interval '2 seconds','initial bot policy deadline uses bot delay');
 denied:=false; BEGIN EXECUTE 'DO $guard$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=''private.advance_due_canonical_game_timers(integer)''::regprocedure AND md5(pg_get_functiondef(p.oid)) IN (''e7c784e3fa2e412d3333ffd2355096f4'',''3f60fdfc00de2466dd2f31060892db0d'') AND pg_get_userbyid(p.proowner)=''postgres'' AND p.prosecdef=true AND p.proconfig=ARRAY[''search_path=""'']::text[] AND p.proacl::text=''{postgres=X/postgres,service_role=X/postgres}'' AND p.provolatile=''v'' AND p.proparallel=''u'' AND p.proleakproof=false AND p.proisstrict=false) THEN RAISE EXCEPTION ''farkle_wave2:shared_metadata_drift''; END IF; END $guard$;
SELECT id FROM private.game_timer_registry WHERE timer_kind=''farkle_postgame'' AND state IN (''scheduled'',''processing'') ORDER BY due_at,id FOR UPDATE;
SELECT pg_advisory_xact_lock(19092026,1);
UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
UPDATE private.farkle_postgame_control_v2 SET enabled=false WHERE singleton;
DO $active$ BEGIN IF EXISTS(SELECT 1 FROM public.games WHERE game_type=''farkle'' AND status IN (''ante_decision'',''in_progress'',''game_over'')) THEN RAISE EXCEPTION ''farkle_wave2:active_games_require_compatible_recovery''; END IF; END $active$;
UPDATE private.game_timer_registry SET state=''cancelled'',completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE timer_kind=''farkle_postgame'' AND state IN (''scheduled'',''processing'');
CREATE OR REPLACE FUNCTION private.advance_due_canonical_game_timers(p_limit integer DEFAULT 64)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''''
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_timer private.game_timer_registry%ROWTYPE;
  v_legacy record;
  v_result jsonb;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_decision text;
  v_fold_probability numeric;
  v_processed integer:=0;
  v_failed integer:=0;
  v_error text;
BEGIN
  PERFORM set_config(''request.jwt.claim.role'',''service_role'',true);
  PERFORM set_config(''request.jwt.claims'',''{"role":"service_role"}'',true);

  FOR v_timer IN
    SELECT timer.*
      FROM private.game_timer_registry timer
      JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE timer.owner_task=''canonical_timers''
       AND timer.state=''scheduled''
       AND timer.due_at<=clock_timestamp()
       AND NOT coalesce(game_row.is_paused,false)
     ORDER BY timer.due_at,timer.id
     LIMIT greatest(1,least(coalesce(p_limit,64),256))
     FOR UPDATE OF timer SKIP LOCKED
  LOOP
    UPDATE private.game_timer_registry
       SET state=''processing'',attempt_count=attempt_count+1,
           last_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_timer.id;
    BEGIN
      v_result:=NULL;
      CASE v_timer.timer_kind
        WHEN ''dealer_selection_prepare'' THEN
          v_result:=private.prepare_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>''timer_generation'')::bigint
          );
        WHEN ''dealer_selection_complete'' THEN
          v_result:=private.complete_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>''timer_generation'')::bigint
          );
        WHEN ''config_timeout'' THEN
          v_result:=private.handle_config_deadline_timeout_exact(
            v_timer.game_id,
            (v_timer.metadata->>''expected_deadline'')::timestamptz,
            (v_timer.metadata->>''expected_dealer_position'')::integer
          );
        WHEN ''ante_phase'' THEN
          v_result:=private.advance_ante_phase_exact(
            v_timer.game_id,v_timer.dealer_game_id,
            (v_timer.metadata->>''expected_deadline'')::timestamptz,
            clock_timestamp()
          );
        WHEN ''holm_decision'' THEN
          SELECT * INTO v_player FROM public.players
           WHERE id=v_timer.actor_player_id;
          IF NOT FOUND THEN
            v_result:=jsonb_build_object(''outcome'',''stale_actor'');
          ELSE
            IF coalesce(v_player.is_bot,false) THEN
              SELECT coalesce(defaults.bot_fold_probability,30)
                INTO v_fold_probability FROM public.game_defaults defaults
               WHERE defaults.game_type=''holm'' LIMIT 1;
              v_decision:=CASE WHEN private.secure_random_unit()*100<coalesce(v_fold_probability,30)
                               THEN ''fold'' ELSE ''stay'' END;
            ELSE
              v_decision:=''fold'';
            END IF;
            SELECT public.holm_apply_deadline_decision(
              v_timer.game_id,v_timer.round_id,v_player.id,v_decision,
              NOT coalesce(v_player.is_bot,false)
            ) INTO v_result;
          END IF;
        WHEN ''farkle_turn'' THEN
          v_result:=private.farkle_advance_due_v1(v_timer.round_id,clock_timestamp());
        WHEN ''horses_scc_turn'' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
        WHEN ''horses_scc_terminal'' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
          IF v_result->>''status''=''tie_waiting_for_client'' THEN
            v_result:=private.horses_scc_rollover_abandoned_round(
              v_timer.round_id,clock_timestamp()
            );
          END IF;
        WHEN ''standard_postgame'' THEN
          v_result:=private.advance_standard_postgame(
            v_timer.game_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        ELSE
          RAISE EXCEPTION ''advance_due_canonical_game_timers:unknown_kind:%'',
            v_timer.timer_kind;
      END CASE;

      IF v_result->>''outcome'' IN (''pending'',''paused'',''not_prepared'',''no_eligible_players'',''deadline_not_expired'') THEN
        SELECT * INTO v_game FROM public.games WHERE id=v_timer.game_id;
        UPDATE private.game_timer_registry
           SET state=''scheduled'',
               due_at=CASE WHEN v_result->>''outcome'' IN (''pending'',''deadline_not_expired'')
                 AND v_result->>''deadline'' IS NOT NULL
                 THEN (v_result->>''deadline'')::timestamptz
                 ELSE clock_timestamp()+interval ''1 second'' END,
               metadata=CASE WHEN v_timer.timer_kind=''ante_phase''
                 AND v_game.ante_decision_deadline IS NOT NULL
                 THEN metadata || jsonb_build_object(
                   ''expected_deadline'',v_game.ante_decision_deadline
                 ) ELSE metadata END,
               updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      ELSE
        UPDATE private.game_timer_registry
           SET state=''completed'',completed_at=clock_timestamp(),
               metadata=metadata || jsonb_build_object(
                 ''result'',coalesce(v_result,''{}''::jsonb)
               ),updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      END IF;
      v_processed:=v_processed+1;
    EXCEPTION WHEN OTHERS THEN
      v_error:=SQLSTATE || '':'' || SQLERRM;
      UPDATE private.game_timer_registry
         SET state=''scheduled'',due_at=clock_timestamp()+interval ''5 seconds'',
             last_error=v_error,updated_at=clock_timestamp()
       WHERE id=v_timer.id;
      v_failed:=v_failed+1;
    END;
  END LOOP;

  -- Client-created legacy dice rounds used NULL as a bot-delay sentinel.
  -- Convert only the exact active post-cutover actor to a database timestamp;
  -- no historical row is scanned or admitted.
  FOR v_legacy IN
    SELECT round_row.id,round_row.game_id,defaults.bot_decision_delay_seconds
    FROM public.rounds round_row CROSS JOIN public.games game_row
    JOIN public.game_defaults defaults
      ON defaults.game_type=game_row.game_type
    JOIN public.players actor
      ON actor.game_id=game_row.id AND actor.is_bot=true
   WHERE round_row.game_id=game_row.id
     AND game_row.game_type IN (''horses'',''ship-captain-crew'')
     AND game_row.status=''in_progress''
     AND NOT coalesce(game_row.is_paused,false)
     AND game_row.current_game_uuid IS NOT DISTINCT FROM round_row.dealer_game_id
     AND round_row.horses_state->>''gamePhase''=''playing''
     AND nullif(round_row.horses_state->>''turnDeadline'','''') IS NULL
     AND actor.id::text=round_row.horses_state->>''currentTurnPlayerId''
     AND EXISTS (
       SELECT 1 FROM private.game_timer_cutover cutover
        WHERE cutover.singleton=true
          AND game_row.timer_generation>0
     )
     AND NOT private.recovery_session_deferred(''canonical_timers'',game_row.id)
     ORDER BY round_row.id LIMIT 64
  LOOP
    BEGIN
      UPDATE public.rounds SET horses_state=jsonb_set(horses_state,''{turnDeadline}'',to_jsonb(
        clock_timestamp()+make_interval(secs=>greatest(0.1,coalesce(v_legacy.bot_decision_delay_seconds,2)))),true)
      WHERE id=v_legacy.id;
      PERFORM private.clear_recovery_unit_failure(''canonical_timers'',v_legacy.game_id,''legacy:''||v_legacy.id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure(''canonical_timers'',v_legacy.game_id,''legacy:''||v_legacy.id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN jsonb_build_object(
    ''outcome'',CASE WHEN v_failed=0 THEN ''completed'' ELSE ''partial_failure'' END,
    ''processed'',v_processed,''failed'',v_failed
  );
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$
;
ALTER FUNCTION private.advance_due_canonical_game_timers(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.advance_due_canonical_game_timers(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.advance_due_canonical_game_timers(integer) TO postgres;
GRANT EXECUTE ON FUNCTION private.advance_due_canonical_game_timers(integer) TO service_role;
DO $verify$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=''private.advance_due_canonical_game_timers(integer)''::regprocedure AND md5(pg_get_functiondef(p.oid)) IN (''e7c784e3fa2e412d3333ffd2355096f4'') AND pg_get_userbyid(p.proowner)=''postgres'' AND p.prosecdef=true AND p.proconfig=ARRAY[''search_path=""'']::text[] AND p.proacl::text=''{postgres=X/postgres,service_role=X/postgres}'' AND p.provolatile=''v'' AND p.proparallel=''u'' AND p.proleakproof=false AND p.proisstrict=false) THEN RAISE EXCEPTION ''farkle_wave2:restoration_metadata_mismatch''; END IF; END $verify$;
'; EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle_wave2:active_games_require_compatible_recovery'; END; PERFORM pg_temp.farkle_assert(denied AND (SELECT creation_enabled FROM private.farkle_release WHERE singleton),'Wave2 recovery blocks active game atomically');
 PERFORM set_config('app.farkle_authority','',true);
 FOREACH kind IN ARRAY ARRAY['game','round','round_insert','player','delete_player','delete_game','result','snapshot'] LOOP
  denied:=false; BEGIN PERFORM pg_temp.farkle_generic_definer(gid,rd,b,dg,kind); EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:authority_claim_required'; END;
  PERFORM pg_temp.farkle_assert(denied,'future generic definer rejected for '||kind);
 END LOOP;
 PERFORM private.farkle_claim_v1(gid,dg,NULL,'configure');
 UPDATE public.players SET auto_fold=true WHERE id=a;
 SELECT intent_version INTO intent FROM public.players WHERE id=a;
 ans:=public.set_automatic_play(gid,rd,dg,a,intent,false);
 PERFORM pg_temp.farkle_assert(ans->>'deferred'='false' AND (SELECT NOT auto_fold AND auto_play_stop_round_id IS NULL FROM public.players WHERE id=a),'out of turn reclaim is immediate');
 PERFORM set_config('app.farkle_authority',jsonb_build_object('game',gen_random_uuid(),'operation','action')::text,true);
 denied:=false; BEGIN UPDATE public.rounds SET pot=1 WHERE id=rd; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'wrong game authority claim cannot mutate round');
 PERFORM private.farkle_claim_v1(gid,dg,NULL,'configure');
 UPDATE public.players SET auto_fold=false WHERE id=b;
 s:=s||jsonb_build_object('stage','bank_or_roll','thisTurn',1000);
 UPDATE public.rounds SET farkle_state=s WHERE id=rd;
 UPDATE public.games SET pending_session_end=true WHERE id=gid;
 PERFORM set_config('app.farkle_authority','',true);
 PERFORM pg_temp.farkle_identity(peer_id);
 ans:=public.farkle_apply_action(rd,b,'bank',0,gen_random_uuid());
 PERFORM pg_temp.farkle_assert(ans->'settlement'->>'terminal_disposition'='session_ended'
 AND (SELECT status='session_ended' AND NOT pending_session_end AND session_ended_at IS NOT NULL FROM public.games WHERE id=gid)
 AND (SELECT sum(chips)=300 FROM public.players WHERE game_id=gid),'pending session end settles once and conserves chips');
 PERFORM private.farkle_claim_v1(gid,dg,NULL,'cleanup');
 DELETE FROM public.games WHERE id=gid;
 PERFORM pg_temp.farkle_assert(NOT EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=gid)
 AND NOT EXISTS(SELECT 1 FROM public.rounds WHERE game_id=gid)
 AND NOT EXISTS(SELECT 1 FROM private.farkle_events WHERE round_id=rd)
 AND NOT EXISTS(SELECT 1 FROM private.farkle_action_receipts WHERE round_id=rd),'fixture cascade removes configuration actions events and receipts');
 PERFORM set_config('app.farkle_authority','',true);
 UPDATE private.farkle_release SET creation_enabled=false,admin_only=true WHERE singleton;
END $proof$;

SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='3cd85a247c2cbcecf6f64ef05dc74052' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[] FROM pg_proc p WHERE p.oid='public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure),'Wave1 unchanged: configure_dealer_game');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='08008547a8c6728231ef68054ced5400' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=ARRAY['postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='private.consume_automatic_play_stop()'::regprocedure),'Wave1 unchanged: consume_automatic_play_stop');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='a5244a4d537f034e8a125edf8e27a6eb' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=ARRAY['postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)'::regprocedure),'Wave1 unchanged: advance_ante_phase_exact');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='6a65b8a32ff86b01f9cc420a83e069a8' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='public.read_session_frame(uuid)'::regprocedure),'Wave1 unchanged: read_session_frame');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='340cd2c6b16f12770242f39ebf53b6ff' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)'::regprocedure),'Wave1 unchanged: set_automatic_play');
SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))='ae070b19f465ca8c16c8700e48f7af34' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[] FROM pg_proc p WHERE p.oid='public.set_game_paused(uuid,boolean,uuid,bigint)'::regprocedure),'Wave1 unchanged: set_game_paused');
SELECT pg_temp.farkle_assert(EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.advance_due_canonical_game_timers(integer)'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('3f60fdfc00de2466dd2f31060892db0d') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig=ARRAY['search_path=""']::text[] AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false),'candidate: definition owner security attributes grants');

SAVEPOINT existing_games;

DO $proof$
DECLARE users uuid[]; g uuid; dg uuid; rd uuid; p uuid; peer uuid; kind text; ctx text; r jsonb; v bigint;
 denied boolean; before_round jsonb; before_game jsonb; deadline timestamptz; after_deadline timestamptz; duration numeric;
BEGIN
 SELECT array_agg(id) INTO users FROM (SELECT pr.id FROM public.profiles pr JOIN auth.users a ON a.id=pr.id WHERE pr.is_active
 AND NOT public.has_role(pr.id,'admin') ORDER BY pr.id LIMIT 2) q;
 IF cardinality(users)<2 THEN RAISE EXCEPTION 'proof:auth_fixtures'; END IF;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 FOREACH kind IN ARRAY ARRAY['3-5-7','holm-game','horses','ship-captain-crew','cribbage','gin-rummy','yahtzee'] LOOP
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'on',true); END LOOP;
  deadline:=clock_timestamp()+interval '1 minute';
  INSERT INTO public.games(name,status,real_money,game_type,total_hands,current_round,current_host)
   VALUES('Rollback pause '||kind,'in_progress',false,kind,1,1,users[1]) RETURNING id INTO g;
  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,users[1],kind) RETURNING id INTO dg;
  UPDATE public.games SET current_game_uuid=dg WHERE id=g;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[1],1,0,'active') RETURNING id INTO p;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[2],4,0,'active') RETURNING id INTO peer;
  INSERT INTO public.rounds(game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,current_turn_position,decision_deadline,presentation_fallback_at,horses_state,yahtzee_state)
   VALUES(g,dg,1,1,0,'betting',1,CASE WHEN kind IN ('cribbage','gin-rummy') THEN NULL ELSE deadline END,deadline,
   CASE WHEN kind IN ('horses','ship-captain-crew') THEN jsonb_build_object('gamePhase','playing','currentTurnPlayerId',p,'turnDeadline',deadline,'actionSequence',0) END,
   CASE WHEN kind='yahtzee' THEN jsonb_build_object('gamePhase','playing','currentTurnPlayerId',p,'turnDeadline',deadline,'actionSequence',0) END) RETURNING id INTO rd;
  IF kind='gin-rummy' THEN
   INSERT INTO private.gin_rummy_round_states(round_id,state) VALUES(rd,jsonb_build_object('phase','playing','playerStates','{}'::jsonb,'scoringDueAt',deadline,'completeDueAt',deadline,'botActionDueAt',deadline,'actionCount',0));
  ELSIF kind='cribbage' THEN
   INSERT INTO private.cribbage_round_states(round_id,state) VALUES(rd,jsonb_build_object('phase','counting','playerStates','{}'::jsonb,'countingResolution',jsonb_build_object('presentationReleaseAt',deadline-interval '5 seconds','presentationFallbackAt',deadline)));
  END IF;
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'',true); END LOOP;
  PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[2],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'not_authorized' THEN RAISE EXCEPTION 'proof:peer_pause:%',r; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'paused' OR (r->>'pause_version')::bigint<>1 THEN RAISE EXCEPTION 'proof:pause:%:%',kind,r; END IF;
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:old_pause_replay'; END IF;
  r:=public.set_game_paused(g,true,dg,1);
  IF r->>'outcome'<>'already_set' THEN RAISE EXCEPTION 'proof:identical_pause'; END IF;
  SELECT to_jsonb(x) INTO before_round FROM public.rounds x WHERE id=rd;
  -- Direct action requests must fail before consuming any legal turn.
  denied:=false;
  BEGIN
   CASE kind
    WHEN '3-5-7' THEN r:=public.three_five_seven_submit_decision(g,rd,dg,1,1,p,'stay');
    WHEN 'holm-game' THEN r:=public.holm_submit_decision(g,rd,p,'stay');
    WHEN 'horses' THEN r:=public.horses_scc_apply_action(rd,p,'roll',0,NULL);
    WHEN 'ship-captain-crew' THEN r:=public.horses_scc_apply_action(rd,p,'roll',0,NULL);
    WHEN 'yahtzee' THEN r:=public.yahtzee_apply_action(rd,p,'roll',NULL,NULL,NULL,0);
    WHEN 'cribbage' THEN r:=public.cribbage_apply_discard(rd,p,ARRAY[0]);
    WHEN 'gin-rummy' THEN r:=public.gin_rummy_apply_action(rd,p,'draw_stock',NULL,NULL,0);
   END CASE;
   denied:=r->>'outcome' IN ('paused','game_paused') OR r->>'reason' IN ('paused','game-paused','round_not_current') OR coalesce((r->>'game_paused')::boolean,false);
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT ILIKE '%paus%' THEN RAISE; END IF;
   denied:=true;
  END;
  IF NOT coalesce(denied,false) OR (SELECT to_jsonb(x) FROM public.rounds x WHERE id=rd) IS DISTINCT FROM before_round THEN RAISE EXCEPTION 'proof:paused_action_mutated:%:%',kind,r; END IF;
  r:=public.set_game_paused(g,false,dg,0);
  IF r->>'outcome'<>'stale_identity' OR NOT (SELECT is_paused FROM public.games WHERE id=g) THEN RAISE EXCEPTION 'proof:stale_resume'; END IF;
  EXECUTE 'RESET ROLE';
  -- The owner-role fallback is also barred: service identity cannot skip pause.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  denied:=false; BEGIN UPDATE public.rounds SET pot=pot+1 WHERE id=rd; EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:service_round_bypass'; END IF;
  denied:=false; BEGIN UPDATE public.games SET total_hands=total_hands+1 WHERE id=g; EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:service_game_bypass'; END IF;
  denied:=false; BEGIN UPDATE public.players SET chips=chips+1 WHERE id=p; EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:service_money_bypass'; END IF;
  -- Advance only the synthetic pause clock; no real waiting or shared setting.
  UPDATE public.games SET timer_paused_at=timer_paused_at-interval '5 seconds' WHERE id=g;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.set_game_paused(g,false,dg,1);
  IF r->>'outcome'<>'resumed' OR (r->>'pause_version')::bigint<>2 THEN RAISE EXCEPTION 'proof:resume:%:%',kind,r; END IF;
  duration:=(r->>'paused_duration_seconds')::numeric;
  SELECT presentation_fallback_at INTO after_deadline FROM public.rounds WHERE id=rd;
  IF abs(extract(epoch FROM(after_deadline-deadline))-duration)>0.001 THEN RAISE EXCEPTION 'proof:lease_shift:%',kind; END IF;
  IF kind IN ('cribbage','gin-rummy') AND (SELECT decision_deadline IS NOT NULL FROM public.rounds WHERE id=rd) THEN RAISE EXCEPTION 'proof:invented_human_timer'; END IF;
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'stale_identity' OR (SELECT is_paused FROM public.games WHERE id=g) THEN RAISE EXCEPTION 'proof:late_pause'; END IF;
  r:=public.set_game_paused(g,true,gen_random_uuid(),2);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:wrong_dealer_game'; END IF;
  EXECUTE 'RESET ROLE';
  IF kind='gin-rummy' AND abs(extract(epoch FROM ((SELECT (state->>'botActionDueAt')::timestamptz FROM private.gin_rummy_round_states WHERE round_id=rd)-deadline))-duration)>0.001 THEN RAISE EXCEPTION 'proof:gin_due_shift'; END IF;
  IF kind='cribbage' AND abs(extract(epoch FROM ((SELECT (state->'countingResolution'->>'presentationFallbackAt')::timestamptz FROM private.cribbage_round_states WHERE round_id=rd)-deadline))-duration)>0.001 THEN RAISE EXCEPTION 'proof:cribbage_due_shift'; END IF;
  IF (SELECT sum(chips) FROM public.players WHERE game_id=g)<>0 OR EXISTS(SELECT 1 FROM public.game_results WHERE game_id=g) THEN RAISE EXCEPTION 'proof:pause_financial_change'; END IF;
  FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
   IF coalesce(current_setting(ctx,true),'')<>'' THEN RAISE EXCEPTION 'proof:authority_leak:%',ctx; END IF; END LOOP;
 END LOOP;

 -- Ending neutral paused setup remains a control request, not gameplay.
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.create_session(gen_random_uuid(),'Rollback paused end',true,1);
 g:=(r->>'game_id')::uuid;
 EXECUTE 'RESET ROLE';
 UPDATE public.games SET status='game_selection',config_deadline=clock_timestamp()+interval '1 minute' WHERE id=g;
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.set_game_paused(g,true,NULL,0);
 r:=public.request_session_end(g,NULL,(SELECT timer_generation FROM public.games WHERE id=g));
 IF r->>'terminal_disposition'<>'session_ended' THEN RAISE EXCEPTION 'proof:paused_control_end'; END IF;
 r:=public.set_game_paused(g,false,NULL,1);
 IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:ended_resume'; END IF;
 EXECUTE 'RESET ROLE';
END $proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'candidate: seven_game_pause_rollback_proof.sql');

SAVEPOINT existing_games;

-- Caller-owned rollback proof for the shared dealer configuration handoff.
-- Exercises every supported game plus authorization, validation, duplicate,
-- exact-identity replay, and late replay behavior.

DO $proof$
DECLARE
  v_users uuid[];
  v_outsider uuid:=gen_random_uuid();
  v_types text[]:=ARRAY['3-5-7','holm-game','cribbage','gin-rummy','horses','ship-captain-crew','yahtzee'];
  v_type text;
  v_game uuid;
  v_dealer_player uuid;
  v_other_player uuid;
  v_deadline timestamptz;
  v_config jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_dealer_game uuid;
  v_before jsonb;
  v_count integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at,id) INTO v_users FROM (
    SELECT p.id,p.created_at FROM public.profiles p JOIN auth.users u ON u.id=p.id ORDER BY p.created_at,p.id LIMIT 2
  ) profiles;
  IF coalesce(cardinality(v_users),0)<2 THEN
    RAISE EXCEPTION 'dealer_setup_proof:requires_two_profiles';
  END IF;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);

  FOREACH v_type IN ARRAY v_types LOOP
    v_game:=gen_random_uuid();
    v_deadline:=clock_timestamp()+interval '20 minutes';
    INSERT INTO public.games(
      id,name,status,game_type,current_host,dealer_position,config_complete,
      config_deadline,ante_decision_timer_seconds,pot,current_round,total_hands
    ) VALUES(
      v_game,'Codex rollback proof - setup '||v_type,'game_selection',NULL,
      v_users[1],1,false,v_deadline,30,CASE WHEN v_type='cribbage' THEN 0 ELSE 9 END,0,0
    );
    INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision,current_decision,decision_locked,auto_fold)
    VALUES
      (v_game,v_users[1],1,100,'active',true,false,NULL,'fold',true,true),
      (v_game,v_users[2],2,100,'folded',false,false,'ante_up','stay',true,true);
    SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
    SELECT id INTO v_other_player FROM public.players WHERE game_id=v_game AND position=2;

    v_config:=CASE v_type
      WHEN '3-5-7' THEN '{"ante_amount":3,"rollover_amount":1,"leg_value":2,"pussy_tax_enabled":true,"pussy_tax_value":1,"legs_to_win":3,"pot_max_enabled":true,"pot_max_value":12,"reveal_at_showdown":true}'::jsonb
      WHEN 'holm-game' THEN '{"ante_amount":2,"leg_value":2,"pussy_tax_enabled":true,"pussy_tax_value":1,"legs_to_win":3,"pot_max_enabled":true,"pot_max_value":12,"chucky_cards":4,"rabbit_hunt":true}'::jsonb
      WHEN 'cribbage' THEN '{"ante_amount":2,"points_to_win":121,"skunk_enabled":true,"skunk_threshold":91,"double_skunk_enabled":true,"double_skunk_threshold":61,"game_mode":"full"}'::jsonb
      WHEN 'gin-rummy' THEN '{"ante_amount":2,"points_to_win":100,"per_point_value":1,"gin_bonus":25,"undercut_bonus":25}'::jsonb
      ELSE '{"ante_amount":2}'::jsonb
    END;

    SET LOCAL ROLE authenticated;
    BEGIN
      UPDATE public.games SET ante_amount=989 WHERE id=v_game;
      RAISE EXCEPTION 'direct_ante_configuration_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      UPDATE public.games SET points_to_win=989 WHERE id=v_game;
      RAISE EXCEPTION 'direct_scoring_configuration_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      UPDATE public.games SET game_setup_timer_seconds=989 WHERE id=v_game;
      RAISE EXCEPTION 'direct_timer_configuration_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      UPDATE public.games SET dealer_selection_state='{"isComplete":true,"winnerPosition":1}'::jsonb WHERE id=v_game;
      RAISE EXCEPTION 'direct_draw_forgery_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config)
      VALUES(v_game,v_users[1],v_type,v_config);
      RAISE EXCEPTION 'direct_dealer_game_insert_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    SELECT public.configure_dealer_game(v_game,v_dealer_player,1,v_type,v_config,v_deadline) INTO v_result;
    RESET ROLE;
    v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
    IF v_result->>'outcome'<>'configured' OR coalesce((v_result->>'deduped')::boolean,true)
       OR (v_result#>>'{game,status}')<>'ante_decision'
       OR (v_result#>>'{game,current_game_uuid}')::uuid<>v_dealer_game
       OR v_result#>>'{game,ante_decision_deadline}' IS NULL
       OR v_result#>>'{game,config_deadline}' IS NOT NULL
       OR (v_result#>>'{dealer_game,game_type}')<>v_type
       OR (SELECT ante_decision FROM public.players WHERE id=v_dealer_player)<>'ante_up'
       OR (SELECT sitting_out FROM public.players WHERE id=v_dealer_player)
       OR (SELECT ante_decision FROM public.players WHERE id=v_other_player) IS NOT NULL
       OR (SELECT status FROM public.players WHERE id=v_other_player)<>'active'
       OR EXISTS(SELECT 1 FROM public.players WHERE game_id=v_game AND (current_decision IS NOT NULL OR decision_locked OR auto_fold))
       OR (SELECT count(*) FROM public.dealer_games WHERE session_id=v_game)<>1
       OR (SELECT count(*) FROM private.dealer_game_setup_commits WHERE game_id=v_game)<>1 THEN
      RAISE EXCEPTION 'dealer_setup_proof:atomic_handoff_invalid:%:%',v_type,v_result;
    END IF;
    IF (v_type='3-5-7' AND (
          (v_result#>>'{game,rollover_amount}')::integer<>1
          OR (v_result#>>'{game,leg_value}')::integer<>2
          OR (v_result#>>'{game,reveal_at_showdown}')::boolean IS NOT TRUE
       ))
       OR (v_type='holm-game' AND (
          (v_result#>>'{game,current_round}')::integer<>1
          OR (v_result#>>'{game,chucky_cards}')::integer<>4
          OR (v_result#>>'{game,rabbit_hunt}')::boolean IS NOT TRUE
       ))
       OR (v_type='cribbage' AND (
          (v_result#>>'{game,pot}')::integer<>0
          OR (v_result#>>'{game,points_to_win}')::integer<>121
          OR (v_result#>>'{game,skunk_threshold}')::integer<>91
       ))
       OR (v_type='gin-rummy' AND (
          (v_result#>>'{game,points_to_win}')::integer<>100
          OR (v_result#>>'{dealer_game,config,gin_bonus}')::integer<>25
       ))
       OR (v_type IN ('horses','ship-captain-crew','yahtzee') AND (
          (v_result#>>'{game,leg_value}')::integer<>0
          OR (v_result#>>'{game,pot_max_enabled}')::boolean IS NOT FALSE
       )) THEN
      RAISE EXCEPTION 'dealer_setup_proof:game_specific_state_invalid:%:%',v_type,v_result;
    END IF;
    SELECT public.configure_dealer_game(v_game,v_dealer_player,1,v_type,v_config,v_deadline) INTO v_replay;
    IF v_replay->>'outcome'<>'already_configured' OR coalesce((v_replay->>'deduped')::boolean,false) IS NOT TRUE
       OR (v_replay#>>'{dealer_game,id}')::uuid<>v_dealer_game
       OR (SELECT count(*) FROM public.dealer_games WHERE session_id=v_game)<>1 THEN
      RAISE EXCEPTION 'dealer_setup_proof:duplicate_changed_state:%:%',v_type,v_replay;
    END IF;
    IF v_type='yahtzee' THEN
      BEGIN
        PERFORM public.configure_dealer_game(v_game,v_dealer_player,1,v_type,'{"ante_amount":3}'::jsonb,v_deadline);
        RAISE EXCEPTION 'dealer_setup_proof:mismatched_replay_succeeded';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM='dealer_setup_proof:mismatched_replay_succeeded'
           OR SQLERRM NOT LIKE '%replay_payload_mismatch%' THEN RAISE; END IF;
      END;
    END IF;
  END LOOP;

  -- Unauthorized callers cannot create a setup commit.
  v_game:=gen_random_uuid(); v_deadline:=clock_timestamp()+interval '20 minutes';
  INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline)
  VALUES(v_game,'Codex rollback proof - unauthorized','game_selection',v_users[1],1,false,v_deadline);
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES(v_game,v_users[1],1,100,'active',false),(v_game,v_users[2],2,100,'active',false);
  SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_outsider)::text,true);
  BEGIN
    PERFORM public.configure_dealer_game(v_game,v_dealer_player,1,'yahtzee','{"ante_amount":2}'::jsonb,v_deadline);
    RAISE EXCEPTION 'dealer_setup_proof:outsider_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='dealer_setup_proof:outsider_succeeded' OR SQLERRM NOT LIKE '%not_in_session%' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=v_game) THEN
    RAISE EXCEPTION 'dealer_setup_proof:unauthorized_call_partially_mutated';
  END IF;

  -- Invalid configuration is atomic and creates no dealer-game row or claim.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  BEGIN
    PERFORM public.configure_dealer_game(v_game,v_dealer_player,1,'3-5-7','{"ante_amount":3,"rollover_amount":0}'::jsonb,v_deadline);
    RAISE EXCEPTION 'dealer_setup_proof:invalid_config_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='dealer_setup_proof:invalid_config_succeeded' OR SQLERRM NOT LIKE '%invalid_card_game_config%' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=v_game)
     OR EXISTS(SELECT 1 FROM private.dealer_game_setup_commits WHERE game_id=v_game) THEN
    RAISE EXCEPTION 'dealer_setup_proof:invalid_config_partially_mutated';
  END IF;

  -- A human session member may configure an eligible bot dealer. The bot's
  -- user identity, not the caller identity, owns the dealer-game row.
  v_game:=gen_random_uuid(); v_deadline:=clock_timestamp()+interval '20 minutes';
  INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline)
  VALUES(v_game,'Codex rollback proof - bot dealer','game_selection',v_users[1],1,false,v_deadline);
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES(v_game,v_users[2],1,100,'active',true),(v_game,v_users[1],2,100,'active',false);
  SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
  SELECT public.configure_dealer_game(v_game,v_dealer_player,1,'yahtzee','{"ante_amount":2}'::jsonb,v_deadline) INTO v_result;
  IF (v_result#>>'{dealer_game,dealer_user_id}')::uuid<>v_users[2]
     OR (SELECT ante_decision FROM public.players WHERE id=v_dealer_player)<>'ante_up' THEN
    RAISE EXCEPTION 'dealer_setup_proof:bot_dealer_invalid:%',v_result;
  END IF;

  -- Late replay returns its stored result and cannot overwrite a newer setup.
  v_game:=gen_random_uuid(); v_deadline:=clock_timestamp()+interval '20 minutes';
  INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline)
  VALUES(v_game,'Codex rollback proof - late replay','game_selection',v_users[1],1,false,v_deadline);
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES(v_game,v_users[1],1,100,'active',false),(v_game,v_users[2],2,100,'active',false);
  SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
  SELECT public.configure_dealer_game(v_game,v_dealer_player,1,'horses','{"ante_amount":2}'::jsonb,v_deadline) INTO v_result;
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.games SET status='game_selection',dealer_position=2,
    config_complete=false,config_deadline=v_deadline+interval '1 hour',current_game_uuid=NULL
   WHERE id=v_game;
  SELECT to_jsonb(game) INTO v_before FROM public.games game WHERE id=v_game;
  SELECT public.configure_dealer_game(v_game,v_dealer_player,1,'horses','{"ante_amount":2}'::jsonb,v_deadline) INTO v_replay;
  IF v_replay->>'outcome'<>'already_configured'
     OR (SELECT to_jsonb(game) FROM public.games game WHERE id=v_game) IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'dealer_setup_proof:late_replay_mutated_newer_setup:%',v_replay;
  END IF;

  SELECT count(*) INTO v_count FROM private.dealer_game_setup_commits;
  IF v_count<9 THEN RAISE EXCEPTION 'dealer_setup_proof:missing_claims:%',v_count; END IF;
END;
$proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'candidate: rule_configuration_authority_rollback_proof.sql');

SAVEPOINT existing_games;
SELECT set_config('app.three_five_seven_test_no_sweep','on',true);
-- Caller-owned rollback proof for the authenticated ante-decision request
-- boundary. The caller must apply the candidate migration in the same
-- transaction for the pre-deployment proof, then wrap this file in
-- BEGIN/ROLLBACK for the post-deployment proof.

DO $proof$
DECLARE
  v_users uuid[];
  v_outsider uuid:=gen_random_uuid();
  v_357_sit uuid:=gen_random_uuid();
  v_357_start uuid:=gen_random_uuid();
  v_yahtzee_sit uuid:=gen_random_uuid();
  v_deadline_357_sit timestamptz:=clock_timestamp()+interval '20 minutes';
  v_deadline_357_start timestamptz:=clock_timestamp()+interval '21 minutes';
  v_deadline_yahtzee_sit timestamptz:=clock_timestamp()+interval '22 minutes';
  v_dealer uuid;
  v_other uuid;
  v_dealer_game uuid;
  v_result jsonb;
  v_before_rounds integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at,id) INTO v_users FROM (
    SELECT id,created_at FROM public.profiles ORDER BY created_at,id LIMIT 2
  ) profiles;
  IF coalesce(cardinality(v_users),0)<2 THEN
    RAISE EXCEPTION 'ante_authority_proof:requires_two_profiles';
  END IF;

  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);

  INSERT INTO public.games(
    id,name,status,game_type,current_host,dealer_position,config_complete,
    config_deadline,ante_decision_timer_seconds,game_setup_timer_seconds,
    pot,current_round,total_hands,real_money
  ) VALUES
    (v_357_sit,'Codex rollback proof - 357 Sit Out','game_selection',NULL,
      v_users[1],1,false,v_deadline_357_sit,30,30,0,0,0,false),
    (v_357_start,'Codex rollback proof - 357 start','game_selection',NULL,
      v_users[1],1,false,v_deadline_357_start,30,30,0,0,0,false),
    (v_yahtzee_sit,'Codex rollback proof - Yahtzee Sit Out','game_selection',NULL,
      v_users[1],1,false,v_deadline_yahtzee_sit,30,30,0,0,0,false);

  INSERT INTO public.players(
    game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision
  ) VALUES
    (v_357_sit,v_users[1],1,100,'active',false,false,NULL),
    (v_357_sit,v_users[2],2,100,'active',false,false,NULL),
    (v_357_start,v_users[1],1,100,'active',false,false,NULL),
    (v_357_start,v_users[2],2,100,'active',false,false,NULL),
    (v_yahtzee_sit,v_users[1],1,100,'active',false,false,NULL),
    (v_yahtzee_sit,v_users[2],2,100,'active',false,false,NULL);

  -- 3-5-7 final Sit Out: setup and ante submission are separate HTTP
  -- transactions. Explicitly clear every setup authority flag before the
  -- second call so this proof cannot inherit setup's trusted context.
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_357_sit AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_357_sit AND position=2;
  SELECT public.configure_dealer_game(
    v_357_sit,v_dealer,1,'3-5-7',jsonb_build_object(
      'ante_amount',3,'rollover_amount',1,'leg_value',2,
      'pussy_tax_enabled',true,'pussy_tax_value',1,'legs_to_win',3,
      'pot_max_enabled',true,'pot_max_value',15,
      'reveal_at_showdown',true
    ),v_deadline_357_sit
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'ante_authority_proof:357_sit_setup_failed:%',v_result;
  END IF;
  PERFORM set_config('app.cribbage_authoritative_write','off',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.yahtzee_authoritative_write','off',true);

  -- Authorization remains in the public wrapper and cannot partially mutate.
  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_outsider
  )::text,true);
  SELECT public.submit_ante_decision(
    v_357_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'not_authorized'
     OR (SELECT ante_decision FROM public.players WHERE id=v_other) IS NOT NULL
     OR coalesce((SELECT sitting_out FROM public.players WHERE id=v_other),false) THEN
    RAISE EXCEPTION 'ante_authority_proof:unauthorized_357_sit_mutated:%',v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT public.submit_ante_decision(
    v_357_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'not_enough_players'
     OR v_result#>>'{phase,reason}'<>'waiting-not-enough-players'
     OR (SELECT status FROM public.games WHERE id=v_357_sit)<>'waiting'
     OR (SELECT current_game_uuid FROM public.games WHERE id=v_357_sit) IS NOT NULL
     OR (SELECT ante_decision FROM public.players WHERE id=v_other)<>'sit_out'
     OR NOT coalesce((SELECT sitting_out FROM public.players WHERE id=v_other),false) THEN
    RAISE EXCEPTION 'ante_authority_proof:357_sit_not_committed:%',v_result;
  END IF;
  SELECT public.submit_ante_decision(
    v_357_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'stale_identity'
     OR (SELECT count(*) FROM public.rounds WHERE game_id=v_357_sit)<>0 THEN
    RAISE EXCEPTION 'ante_authority_proof:357_sit_replay_changed_state:%',v_result;
  END IF;

  -- The same protected branch must work for Yahtzee without weakening its
  -- game-authority trigger.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_yahtzee_sit AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_yahtzee_sit AND position=2;
  SELECT public.configure_dealer_game(
    v_yahtzee_sit,v_dealer,1,'yahtzee',jsonb_build_object('ante_amount',3),
    v_deadline_yahtzee_sit
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'ante_authority_proof:yahtzee_sit_setup_failed:%',v_result;
  END IF;
  PERFORM set_config('app.cribbage_authoritative_write','off',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.yahtzee_authoritative_write','off',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT public.submit_ante_decision(
    v_yahtzee_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'not_enough_players'
     OR (SELECT status FROM public.games WHERE id=v_yahtzee_sit)<>'waiting'
     OR (SELECT ante_decision FROM public.players WHERE id=v_other)<>'sit_out'
     OR NOT coalesce((SELECT sitting_out FROM public.players WHERE id=v_other),false) THEN
    RAISE EXCEPTION 'ante_authority_proof:yahtzee_sit_not_committed:%',v_result;
  END IF;

  -- Normal 3-5-7 continuation remains exactly once and replay safe.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_357_start AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_357_start AND position=2;
  SELECT public.configure_dealer_game(
    v_357_start,v_dealer,1,'3-5-7',jsonb_build_object(
      'ante_amount',3,'rollover_amount',1,'leg_value',2,
      'pussy_tax_enabled',true,'pussy_tax_value',1,'legs_to_win',3,
      'pot_max_enabled',true,'pot_max_value',15,
      'reveal_at_showdown',true
    ),v_deadline_357_start
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'ante_authority_proof:357_start_setup_failed:%',v_result;
  END IF;
  PERFORM set_config('app.cribbage_authoritative_write','off',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.yahtzee_authoritative_write','off',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT count(*) INTO v_before_rounds FROM public.rounds
   WHERE game_id=v_357_start;
  SELECT public.submit_ante_decision(
    v_357_start,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'advanced'
     OR (SELECT status FROM public.games WHERE id=v_357_start)<>'in_progress'
     OR (SELECT count(*) FROM public.rounds WHERE game_id=v_357_start)
        <>v_before_rounds+1 THEN
    RAISE EXCEPTION 'ante_authority_proof:357_start_failed:%',v_result;
  END IF;
  SELECT public.submit_ante_decision(
    v_357_start,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'stale_identity'
     OR (SELECT count(*) FROM public.rounds WHERE game_id=v_357_start)
        <>v_before_rounds+1 THEN
    RAISE EXCEPTION 'ante_authority_proof:357_start_replay_changed_state:%',v_result;
  END IF;
END;
$proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'candidate: ante_decision_authority_boundary_rollback_proof.sql');

SAVEPOINT existing_games;

DO $proof$
DECLARE users uuid[]; req uuid:=gen_random_uuid(); g uuid; p uuid; peer uuid; dg uuid; rd uuid; r jsonb; v bigint;
 denied boolean; gen bigint; kind text; ctx text; before_count bigint;
BEGIN
 SELECT array_agg(id) INTO users FROM (SELECT pr.id FROM public.profiles pr JOIN auth.users a ON a.id=pr.id
 WHERE pr.is_active AND NOT public.has_role(pr.id,'admin') ORDER BY pr.id LIMIT 3) q;
 IF cardinality(users)<3 THEN RAISE EXCEPTION 'proof:three_auth_fixtures'; END IF;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.create_session(req,'Rollback atomic creation',false,1);
 g:=(r->>'game_id')::uuid; p:=(r->>'player_id')::uuid;
 IF r->>'outcome'<>'created' OR (SELECT current_host FROM public.games WHERE id=g) IS DISTINCT FROM users[1]
 OR (SELECT count(*) FROM public.players WHERE game_id=g)<>1 OR (SELECT chips FROM public.players WHERE id=p)<>0
 OR (SELECT pot FROM public.games WHERE id=g)<>0 THEN RAISE EXCEPTION 'proof:atomic_genesis:%',r; END IF;
 r:=public.create_session(req,'Rollback atomic creation',false,1);
 IF r->>'outcome'<>'already_created' OR (r->>'game_id')::uuid<>g THEN RAISE EXCEPTION 'proof:create_duplicate'; END IF;
 denied:=false; BEGIN PERFORM public.create_session(req,'Different payload',true,1); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:create_payload_replay'; END IF;
 SELECT count(*) INTO before_count FROM public.games;
 denied:=false; BEGIN PERFORM public.create_session(gen_random_uuid(),'Invalid seat',false,8); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied OR (SELECT count(*) FROM public.games)<>before_count THEN RAISE EXCEPTION 'proof:creation_failure_orphan'; END IF;
 denied:=false; BEGIN INSERT INTO public.games(name,status,real_money) VALUES('Raw creation denied','waiting',false); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_genesis'; END IF;
 denied:=false; BEGIN UPDATE public.players SET auto_fold=true WHERE id=p; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_gameplay'; END IF;
 denied:=false; BEGIN DELETE FROM public.players WHERE id=p; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_delete'; END IF;
 denied:=false; BEGIN INSERT INTO public.players(game_id,user_id,chips,position) VALUES(g,users[1],0,3); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_player_genesis'; END IF;
 UPDATE public.players SET deck_color_mode='four_color' WHERE id=p;
 IF (SELECT deck_color_mode FROM public.players WHERE id=p)<>'four_color' THEN RAISE EXCEPTION 'proof:own_color'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[2],'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false; BEGIN PERFORM public.create_session(req,'Rollback atomic creation',false,1); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:create_actor_replay'; END IF;
 UPDATE public.players SET deck_color_mode='two_color' WHERE id=p;
 IF FOUND THEN RAISE EXCEPTION 'proof:peer_color'; END IF;
 r:=public.session_take_seat(g,4,NULL,NULL); peer:=(r->>'player_id')::uuid;
 IF r->>'outcome'<>'seated' THEN RAISE EXCEPTION 'proof:admission'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 SELECT timer_generation INTO gen FROM public.games WHERE id=g;
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.request_session_end(g,NULL,gen);
 IF r->>'terminal_disposition'<>'deleted' THEN RAISE EXCEPTION 'proof:fake_cleanup'; END IF;
 r:=public.create_session(req,'Rollback atomic creation',false,1);
 IF r->>'outcome'<>'already_deleted' OR r->>'game_id' IS NOT NULL THEN RAISE EXCEPTION 'proof:late_creation_resurrected'; END IF;
 EXECUTE 'RESET ROLE';

 FOREACH kind IN ARRAY ARRAY['3-5-7','holm-game','horses','ship-captain-crew','cribbage','gin-rummy','yahtzee'] LOOP
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'on',true); END LOOP;
  INSERT INTO public.games(name,status,real_money,game_type,total_hands,current_round,current_host)
   VALUES('Rollback automatic play '||kind,'in_progress',false,kind,1,1,users[1]) RETURNING id INTO g;
  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,users[1],kind) RETURNING id INTO dg;
  UPDATE public.games SET current_game_uuid=dg WHERE id=g;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[1],1,0,'active') RETURNING id INTO p;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[2],4,0,'active') RETURNING id INTO peer;
  INSERT INTO public.rounds(game_id,dealer_game_id,round_number,hand_number,status,cards_dealt,horses_state)
   VALUES(g,dg,1,1,'betting',0,jsonb_build_object('gamePhase','playing','currentTurnPlayerId',p)) RETURNING id INTO rd;
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'',true); END LOOP;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT intent_version INTO v FROM public.players WHERE id=p;
  denied:=false; BEGIN PERFORM public.set_automatic_play(g,rd,dg,peer,0,true); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:peer_automatic_play:%',kind; END IF;
  r:=public.set_automatic_play(g,rd,gen_random_uuid(),p,v,true);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:wrong_dealer_game'; END IF;
  r:=public.set_automatic_play(g,rd,dg,p,v,true);
  IF r->>'outcome'<>'accepted' OR NOT (r->'player'->>'auto_fold')::boolean THEN RAISE EXCEPTION 'proof:enable:%:%',kind,r; END IF;
  r:=public.set_automatic_play(g,rd,dg,p,v,false);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:stale_intent'; END IF;
  SELECT intent_version INTO v FROM public.players WHERE id=p;
  r:=public.set_automatic_play(g,rd,dg,p,v,false);
  IF r->>'outcome'<>'accepted' THEN RAISE EXCEPTION 'proof:disable:%',kind; END IF;
  IF kind IN ('horses','ship-captain-crew') THEN
   IF NOT (r->>'deferred')::boolean OR NOT (r->'player'->>'auto_fold')::boolean OR (r->'player'->>'auto_play_stop_round_id')::uuid<>rd THEN RAISE EXCEPTION 'proof:deferred_request'; END IF;
   -- Duplicate old disable cannot override a newer deliberate enable.
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:queue_version'; END IF;
   EXECUTE 'RESET ROLE';
   -- No connected browser action: server turn advance alone consumes the intent.
   UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{currentTurnPlayerId}',to_jsonb(peer::text)) WHERE id=rd;
   IF (SELECT auto_fold OR auto_play_stop_round_id IS NOT NULL FROM public.players WHERE id=p) THEN RAISE EXCEPTION 'proof:disconnect_stop_lost'; END IF;
   EXECUTE 'SET LOCAL ROLE authenticated';
  ELSIF (r->'player'->>'auto_fold')::boolean OR (r->>'deferred')::boolean THEN RAISE EXCEPTION 'proof:immediate_stop:%',kind;
  END IF;
  EXECUTE 'RESET ROLE';
  IF kind IN ('horses','ship-captain-crew') THEN
   UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{currentTurnPlayerId}',to_jsonb(p::text)) WHERE id=rd;
   UPDATE public.games SET is_paused=true WHERE id=g;
   EXECUTE 'SET LOCAL ROLE authenticated';
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,true);
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF NOT (r->>'deferred')::boolean THEN RAISE EXCEPTION 'proof:paused_stop'; END IF;
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,true);
   IF r->'player'->>'auto_play_stop_round_id' IS NOT NULL THEN RAISE EXCEPTION 'proof:enable_did_not_cancel_stop'; END IF;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:old_stop_overrode_enable'; END IF;
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   EXECUTE 'RESET ROLE';
   -- A delayed old-round completion must never disable automation in a new dealer game.
   INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,users[1],kind) RETURNING id INTO dg;
   UPDATE public.games SET is_paused=false WHERE id=g;
   UPDATE public.games SET current_game_uuid=dg WHERE id=g;
   UPDATE public.rounds SET status='completed' WHERE id=rd;
   IF NOT (SELECT auto_fold FROM public.players WHERE id=p) OR
    (SELECT auto_play_stop_round_id IS NOT NULL FROM public.players WHERE id=p) THEN RAISE EXCEPTION 'proof:cross_identity_stop'; END IF;
   EXECUTE 'SET LOCAL ROLE authenticated';
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:completed_round_toggle'; END IF;
   EXECUTE 'RESET ROLE';
  END IF;
  IF (SELECT sum(chips) FROM public.players WHERE game_id=g)<>0 OR (SELECT pot FROM public.games WHERE id=g)<>0 THEN RAISE EXCEPTION 'proof:money_changed'; END IF;
  IF coalesce(current_setting('app.three_five_seven_authoritative_write',true),'')<>'' THEN RAISE EXCEPTION 'proof:authority_leak'; END IF;
 END LOOP;
 -- Preference arguments cannot bypass the mutually exclusive server intent.
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false; BEGIN PERFORM public.submit_ante_decision(g,dg,p,'ante_up',true,true); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:conflicting_ante_preferences'; END IF;
 EXECUTE 'RESET ROLE';
 IF has_table_privilege('authenticated','public.players','UPDATE') OR has_table_privilege('authenticated','public.games','INSERT')
 OR has_column_privilege('authenticated','public.players','chips','UPDATE')
 OR has_column_privilege('authenticated','public.players','auto_play_stop_round_id','UPDATE')
 THEN RAISE EXCEPTION 'proof:privilege_closure'; END IF;
END $proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'candidate: final_player_authority_rollback_proof.sql');

SAVEPOINT existing_games;

-- Caller-owned rollback proof for canonical timer ownership.
-- Covers authorization, future-only admission, ante continuation, a dice tie
-- and successor, a terminal winner, duplicate/replay/late-replay behavior,
-- and pause/resume deadline preservation.  The caller must wrap this file in
-- BEGIN/ROLLBACK.

DO $proof$
DECLARE
  v_users uuid[];
  v_outsider uuid:=gen_random_uuid();
  v_game uuid:=gen_random_uuid();
  v_pause_game uuid:=gen_random_uuid();
  v_dealer uuid;
  v_other uuid;
  v_deadline timestamptz:=clock_timestamp()+interval '20 minutes';
  v_dealer_game uuid;
  v_round uuid;
  v_successor uuid;
  v_result jsonb;
  v_replay jsonb;
  v_tie_state jsonb;
  v_winner_state jsonb;
  v_before_count integer;
  v_after_count integer;
  v_before_deadline timestamptz;
  v_after_deadline timestamptz;
  v_cutover timestamptz;
BEGIN
  SELECT array_agg(id ORDER BY created_at,id) INTO v_users FROM (
    SELECT id,created_at FROM public.profiles ORDER BY created_at,id LIMIT 2
  ) profiles;
  IF coalesce(cardinality(v_users),0)<2 THEN
    RAISE EXCEPTION 'canonical_timer_proof:requires_two_profiles';
  END IF;

  SELECT cutover_at INTO v_cutover FROM private.game_timer_cutover
   WHERE singleton=true;
  IF EXISTS (
    SELECT 1 FROM private.game_timer_registry timer
     WHERE timer.created_at>=v_cutover
       AND timer.due_at<v_cutover
  ) THEN
    RAISE EXCEPTION 'canonical_timer_proof:expired_history_was_admitted';
  END IF;

  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);

  INSERT INTO public.games(
    id,name,status,game_type,current_host,dealer_position,config_complete,
    config_deadline,ante_decision_timer_seconds,game_setup_timer_seconds,
    pot,current_round,total_hands,real_money
  ) VALUES (
    v_game,'Codex rollback proof - canonical timers','game_selection',NULL,
    v_users[1],1,false,v_deadline,30,30,0,0,0,false
  );
  INSERT INTO public.players(
    game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision
  ) VALUES
    (v_game,v_users[1],1,100,'active',false,false,NULL),
    (v_game,v_users[2],2,100,'active',false,false,NULL);
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_game AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_game AND position=2;

  SELECT public.configure_dealer_game(
    v_game,v_dealer,1,'horses','{"ante_amount":2}'::jsonb,v_deadline
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'canonical_timer_proof:setup_failed:%',v_result;
  END IF;

  -- Authorization: an outsider cannot submit another player's ante and the
  -- failed call cannot partially mutate the player.
  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_outsider
  )::text,true);
  SELECT public.submit_ante_decision(
    v_game,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'not_authorized'
     OR (SELECT ante_decision FROM public.players WHERE id=v_other) IS NOT NULL THEN
    RAISE EXCEPTION 'canonical_timer_proof:unauthorized_ante_mutated:%',v_result;
  END IF;

  -- The second valid ante atomically continues into the database-owned dice
  -- first round.  No browser start callback is involved.
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT public.submit_ante_decision(
    v_game,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'advanced'
     OR (SELECT status FROM public.games WHERE id=v_game)<>'in_progress'
     OR (SELECT count(*) FROM public.rounds
          WHERE game_id=v_game AND dealer_game_id=v_dealer_game)<>1 THEN
    RAISE EXCEPTION 'canonical_timer_proof:ante_continuation_failed:%',v_result;
  END IF;
  SELECT id INTO v_round FROM public.rounds
   WHERE game_id=v_game AND dealer_game_id=v_dealer_game
     AND hand_number=1 AND round_number=1;

  -- Duplicate decision/replay cannot create another first round.
  SELECT public.submit_ante_decision(
    v_game,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_replay;
  IF v_replay->>'outcome'<>'stale_identity'
     OR (SELECT count(*) FROM public.rounds
          WHERE game_id=v_game AND dealer_game_id=v_dealer_game)<>1 THEN
    RAISE EXCEPTION 'canonical_timer_proof:duplicate_ante_changed_state:%',v_replay;
  END IF;

  -- Tie proof: exact terminal dice state rolls into one successor even while
  -- humans are present; a replay returns already_advanced.
  v_tie_state:=jsonb_build_object(
    'currentTurnPlayerId',NULL,'gamePhase','complete','turnDeadline',NULL,
    'turnOrder',jsonb_build_array(v_dealer,v_other),
    'playerStates',jsonb_build_object(
      v_dealer::text,jsonb_build_object(
        'dice',jsonb_build_array(
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false)
        ),'rollsRemaining',0,'isComplete',true
      ),
      v_other::text,jsonb_build_object(
        'dice',jsonb_build_array(
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false)
        ),'rollsRemaining',0,'isComplete',true
      )
    )
  );
  UPDATE public.rounds SET horses_state=v_tie_state WHERE id=v_round;
  SELECT private.horses_scc_rollover_abandoned_round(
    v_round,clock_timestamp()
  ) INTO v_result;
  IF v_result->>'status'<>'advanced'
     OR (v_result->>'hand_number')::integer<>2 THEN
    RAISE EXCEPTION 'canonical_timer_proof:tie_continuation_failed:%',v_result;
  END IF;
  SELECT id INTO v_successor FROM public.rounds
   WHERE game_id=v_game AND dealer_game_id=v_dealer_game AND hand_number=2;
  SELECT private.horses_scc_rollover_abandoned_round(
    v_round,clock_timestamp()
  ) INTO v_replay;
  IF v_replay->>'status'<>'not_current'
     OR (SELECT count(*) FROM public.rounds
          WHERE game_id=v_game AND dealer_game_id=v_dealer_game)<>2 THEN
    RAISE EXCEPTION 'canonical_timer_proof:tie_replay_changed_state:%',v_replay;
  END IF;

  -- Winner/terminal proof: successor settles once, publishes game_over, and
  -- canonical postgame advances once with an exact replay receipt.
  v_winner_state:=jsonb_build_object(
    'currentTurnPlayerId',NULL,'gamePhase','complete','turnDeadline',NULL,
    'turnOrder',jsonb_build_array(v_dealer,v_other),
    'playerStates',jsonb_build_object(
      v_dealer::text,jsonb_build_object(
        'dice',jsonb_build_array(
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false)
        ),'rollsRemaining',0,'isComplete',true
      ),
      v_other::text,jsonb_build_object(
        'dice',jsonb_build_array(
          jsonb_build_object('value',1,'isHeld',false),
          jsonb_build_object('value',1,'isHeld',false),
          jsonb_build_object('value',1,'isHeld',false),
          jsonb_build_object('value',1,'isHeld',false),
          jsonb_build_object('value',1,'isHeld',false)
        ),'rollsRemaining',0,'isComplete',true
      )
    )
  );
  UPDATE public.rounds SET horses_state=v_winner_state WHERE id=v_successor;
  SELECT public.horses_settle_game(
    v_game,v_successor,v_dealer_game,2
  ) INTO v_result;
  IF v_result->>'status'<>'settled'
     OR (SELECT status FROM public.games WHERE id=v_game)<>'game_over' THEN
    RAISE EXCEPTION 'canonical_timer_proof:winner_terminal_failed:%',v_result;
  END IF;
  SELECT public.horses_settle_game(
    v_game,v_successor,v_dealer_game,2
  ) INTO v_replay;
  IF v_replay->>'status'<>'already_settled' THEN
    RAISE EXCEPTION 'canonical_timer_proof:winner_duplicate_failed:%',v_replay;
  END IF;

  SELECT private.advance_standard_postgame(v_game,v_dealer_game,2)
    INTO v_result;
  IF v_result->>'outcome'<>'advanced'
     OR v_result->>'status'<>'game_selection' THEN
    RAISE EXCEPTION 'canonical_timer_proof:terminal_postgame_failed:%',v_result;
  END IF;
  SELECT private.advance_standard_postgame(v_game,v_dealer_game,2)
    INTO v_replay;
  IF v_replay->>'outcome'<>'already_advanced'
     OR coalesce((v_replay->>'deduped')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'canonical_timer_proof:postgame_replay_failed:%',v_replay;
  END IF;

  -- Late replay of the old ante identity cannot cross the dealer-game/lifecycle
  -- boundary or manufacture a third round.
  SELECT count(*) INTO v_before_count FROM public.rounds WHERE game_id=v_game;
  SELECT private.advance_ante_phase_exact(
    v_game,v_dealer_game,(SELECT ante_decision_deadline FROM public.games
      WHERE id=v_game),clock_timestamp()
  ) INTO v_replay;
  SELECT count(*) INTO v_after_count FROM public.rounds WHERE game_id=v_game;
  IF v_replay->>'outcome'<>'stale_identity' OR v_after_count<>v_before_count THEN
    RAISE EXCEPTION 'canonical_timer_proof:late_replay_crossed_boundary:%',v_replay;
  END IF;

  -- Pause/resume proof on a separate exact setup clock.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);
  INSERT INTO public.games(
    id,name,status,current_host,dealer_position,config_complete,config_deadline
  ) VALUES (
    v_pause_game,'Codex rollback proof - pause','game_selection',
    v_users[1],1,false,clock_timestamp()+interval '10 minutes'
  );
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES
    (v_pause_game,v_users[1],1,100,'active',false),
    (v_pause_game,v_users[2],2,100,'active',false);
  SELECT config_deadline INTO v_before_deadline FROM public.games
   WHERE id=v_pause_game;
  SELECT public.set_game_paused(v_pause_game,true,
    (SELECT current_game_uuid FROM public.games WHERE id=v_pause_game),
    (SELECT pause_version FROM public.games WHERE id=v_pause_game)) INTO v_result;
  IF v_result->>'outcome'<>'paused' THEN
    RAISE EXCEPTION 'canonical_timer_proof:pause_failed:%',v_result;
  END IF;
  UPDATE public.games SET timer_paused_at=timer_paused_at-interval '5 seconds'
   WHERE id=v_pause_game;
  SELECT public.set_game_paused(v_pause_game,false,
    (SELECT current_game_uuid FROM public.games WHERE id=v_pause_game),
    (SELECT pause_version FROM public.games WHERE id=v_pause_game)) INTO v_result;
  SELECT config_deadline INTO v_after_deadline FROM public.games
   WHERE id=v_pause_game;
  IF v_result->>'outcome'<>'resumed'
     OR v_after_deadline<v_before_deadline+interval '4.9 seconds' THEN
    RAISE EXCEPTION 'canonical_timer_proof:resume_did_not_preserve_time:%',v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_outsider
  )::text,true);
  SELECT public.set_game_paused(v_pause_game,true,
    (SELECT current_game_uuid FROM public.games WHERE id=v_pause_game),
    (SELECT pause_version FROM public.games WHERE id=v_pause_game)) INTO v_result;
  IF v_result->>'outcome'<>'not_authorized'
     OR (SELECT is_paused FROM public.games WHERE id=v_pause_game) THEN
    RAISE EXCEPTION 'canonical_timer_proof:unauthorized_pause_mutated:%',v_result;
  END IF;

  -- Policy proof: no Gin/Cribbage human decision timer kind exists.
  IF EXISTS (
    SELECT 1 FROM private.game_timer_registry timer
    JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE game_row.game_type IN ('gin-rummy','cribbage')
       AND timer.state IN ('scheduled','processing')
       AND timer.timer_kind IN ('holm_decision','three_five_seven_decision',
                                'horses_scc_turn','yahtzee_turn')
  ) THEN
    RAISE EXCEPTION 'canonical_timer_proof:untimed_game_received_human_clock';
  END IF;
END;
$proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'candidate: canonical_game_timer_rollback_proof.sql');

-- Runs only inside the outer rollback; every fixture uses labeled TEST ONLY rules.
CREATE TEMP TABLE farkle_postgame_history_fixture(game_id uuid,round_id uuid,dealer_game_id uuid);
CREATE FUNCTION pg_temp.farkle_postgame_fixture() RETURNS jsonb LANGUAGE plpgsql AS $p$
DECLARE admin_id uuid; peer_id uuid; bot_user uuid; gid uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); bot uuid:=gen_random_uuid();
 c jsonb; input jsonb; g public.games; dg uuid; rd uuid; ans jsonb; deadline timestamptz:=clock_timestamp()+interval '15 minutes';
BEGIN
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 SELECT id INTO peer_id FROM public.profiles WHERE id<>admin_id AND NOT public.has_role(id,'admin'::public.app_role) ORDER BY id LIMIT 1;
 SELECT id INTO bot_user FROM public.profiles WHERE id NOT IN (admin_id,peer_id) ORDER BY id LIMIT 1;
 SELECT config INTO c FROM farkle_test_config;
 input:=jsonb_build_object('ante_amount',7,'targetScore',1000,'endgame','immediate','testConfiguration',
  jsonb_build_object('testOnly',true,'label',c->'testLabel','rules',c->'rules','turnSeconds',30,'botDelayMs',1000,'botBankThreshold',100,'botPolicy','balanced'));
 PERFORM set_config('app.farkle_authority','',true);
 PERFORM pg_temp.farkle_identity(admin_id);
 UPDATE private.farkle_release SET creation_enabled=true WHERE singleton;
 INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline,real_money,pot,current_round,total_hands)
 VALUES(gid,'TEST ONLY: Wave2 postgame rollback','game_selection',admin_id,4,false,deadline,false,0,0,0);
 INSERT INTO public.players(id,game_id,user_id,position,chips,status,is_bot) VALUES
 (a,gid,admin_id,4,100,'active',false),(b,gid,peer_id,3,100,'active',false),(bot,gid,bot_user,5,100,'active',true);
 ans:=public.configure_dealer_game(gid,a,4,'farkle',input,deadline); dg:=(ans->'dealer_game'->>'id')::uuid;
 PERFORM private.farkle_claim_v1(gid,dg,NULL,'configure');
 UPDATE public.players SET ante_decision='ante_up' WHERE game_id=gid;
 SELECT * INTO g FROM public.games WHERE id=gid;
 PERFORM private.advance_ante_phase_exact(gid,dg,g.ante_decision_deadline,clock_timestamp());
 SELECT id INTO rd FROM public.rounds WHERE dealer_game_id=dg;
 PERFORM set_config('app.farkle_authority','',true);
 UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
 RETURN jsonb_build_object('game',gid,'dealer',dg,'round',rd,'a',a,'b',b,'bot',bot,'admin',admin_id,'peer',peer_id);
END $p$;
CREATE FUNCTION pg_temp.farkle_postgame_bank(f jsonb,pending_end boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $p$
DECLARE s jsonb;
BEGIN
 PERFORM private.farkle_claim_v1((f->>'game')::uuid,(f->>'dealer')::uuid,NULL,'configure');
 SELECT farkle_state INTO s FROM public.rounds WHERE id=(f->>'round')::uuid;
 UPDATE public.rounds SET farkle_state=s||jsonb_build_object('stage','bank_or_roll','thisTurn',1000) WHERE id=(f->>'round')::uuid;
 IF pending_end THEN UPDATE public.games SET pending_session_end=true WHERE id=(f->>'game')::uuid; END IF;
 PERFORM set_config('app.farkle_authority','',true);
 PERFORM pg_temp.farkle_identity((f->>'peer')::uuid);
 PERFORM public.farkle_apply_action((f->>'round')::uuid,(f->>'b')::uuid,'bank',0,gen_random_uuid());
END $p$;
CREATE FUNCTION pg_temp.farkle_postgame_cleanup() RETURNS void LANGUAGE plpgsql AS $p$
DECLARE f record;
BEGIN
 FOR f IN SELECT * FROM farkle_postgame_history_fixture LOOP
  PERFORM private.farkle_claim_v1(f.game_id,f.dealer_game_id,NULL,'cleanup');
  DELETE FROM public.games WHERE id=f.game_id;
  PERFORM pg_temp.farkle_assert(NOT EXISTS(SELECT 1 FROM private.farkle_postgame_receipts_v2 WHERE game_id=f.game_id)
   AND NOT EXISTS(SELECT 1 FROM private.farkle_events WHERE round_id=f.round_id)
   AND NOT EXISTS(SELECT 1 FROM private.game_timer_registry WHERE game_id=f.game_id),'postgame fixture cascade cleanup');
 END LOOP;
 PERFORM set_config('app.farkle_authority','',true);
END $p$;
DO $p$
DECLARE f jsonb; g uuid; d uuid; r uuid; ans jsonb; again jsonb; before_game jsonb; terminal_state jsonb; balances jsonb; version bigint; denied boolean; mode text;
BEGIN
 UPDATE public.system_settings SET value=jsonb_build_object('enabled',false) WHERE key='make_it_take_it';
 f:=pg_temp.farkle_postgame_fixture(); g:=(f->>'game')::uuid; d:=(f->>'dealer')::uuid; r:=(f->>'round')::uuid;
 PERFORM pg_temp.farkle_assert(public.farkle_advance_postgame(g,r,d,1)->>'outcome'='stale_identity','postgame rejects live gameplay');
 denied:=false; BEGIN PERFORM public.farkle_advance_postgame(g,r,gen_random_uuid(),1); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle_postgame:round_identity_mismatch'; END;
 PERFORM pg_temp.farkle_assert(denied,'postgame exact dealer identity');
 denied:=false; BEGIN PERFORM public.farkle_advance_postgame(g,r,d,2); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle_postgame:round_identity_mismatch'; END;
 PERFORM pg_temp.farkle_assert(denied,'postgame exact hand identity');
 PERFORM pg_temp.farkle_identity(gen_random_uuid());
 denied:=false; BEGIN PERFORM public.farkle_advance_postgame(g,r,d,1); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'postgame outsider rejected');
 PERFORM pg_temp.farkle_assert(NOT has_function_privilege('anon','public.farkle_advance_postgame(uuid,uuid,uuid,integer)','EXECUTE')
  AND NOT has_table_privilege('authenticated','private.farkle_postgame_receipts_v2','INSERT'),'postgame RPC and receipt grants');
 PERFORM pg_temp.farkle_postgame_bank(f);
 SELECT farkle_state INTO terminal_state FROM public.rounds WHERE id=r;
 PERFORM pg_temp.farkle_assert(EXISTS(SELECT 1 FROM private.game_timer_registry WHERE game_id=g AND round_id=r AND dealer_game_id=d
  AND hand_number=1 AND timer_kind='farkle_postgame' AND state='scheduled' AND due_at=(SELECT game_over_at+interval '15 seconds' FROM public.games WHERE id=g)),'postgame exact durable recovery registration');
 PERFORM private.farkle_claim_v1(g,d,r,'cleanup');
 UPDATE public.rounds SET farkle_state=terminal_state||jsonb_build_object('gamePhase','playing','winnerPlayerId',NULL,'tiebreakTurn',1) WHERE id=r;
 PERFORM set_config('app.farkle_authority','',true);
 denied:=false; BEGIN PERFORM public.farkle_advance_postgame(g,r,d,1); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle_postgame:not_terminal'; END;
 PERFORM pg_temp.farkle_assert(denied,'postgame cannot advance an unresolved tie');
 PERFORM private.farkle_claim_v1(g,d,r,'cleanup');
 UPDATE public.rounds SET farkle_state=terminal_state WHERE id=r;
 PERFORM set_config('app.farkle_authority','',true);
 PERFORM pg_temp.farkle_identity((f->>'admin')::uuid);
 SELECT pause_version INTO version FROM public.games WHERE id=g;
 PERFORM public.set_game_paused(g,true,d,version);
 PERFORM pg_temp.farkle_assert(public.farkle_advance_postgame(g,r,d,1)->>'outcome'='paused','postgame respects real pause owner');
 SELECT pause_version INTO version FROM public.games WHERE id=g;
 PERFORM public.set_game_paused(g,false,d,version);
 SELECT jsonb_object_agg(id,chips) INTO balances FROM public.players WHERE game_id=g;
 ans:=public.farkle_advance_postgame(g,r,d,1);
 PERFORM pg_temp.farkle_assert(ans->>'outcome'='advanced' AND ans->>'status'='game_selection' AND ans->>'dealer_position'='3','postgame continues clockwise to lower occupied dealer');
 PERFORM pg_temp.farkle_assert(coalesce(current_setting('app.farkle_authority',true),'')='','postgame restores exact authority context');
 PERFORM pg_temp.farkle_assert((SELECT jsonb_object_agg(id,chips) FROM public.players WHERE game_id=g)=balances
  AND (SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d AND settlement_key='farkle_terminal'),'postgame never resettles chips');
 PERFORM pg_temp.farkle_assert((SELECT farkle_state=terminal_state FROM public.rounds WHERE id=r)
  AND (SELECT config=terminal_state->'config' FROM public.dealer_games WHERE id=d),'postgame preserves frozen config score and completed turns');
 SELECT to_jsonb(x) INTO before_game FROM public.games x WHERE id=g;
 again:=public.farkle_advance_postgame(g,r,d,1);
 PERFORM pg_temp.farkle_assert(again->>'outcome'='already_advanced' AND (again-'outcome'-'deduped')=(ans-'outcome'-'deduped')
  AND (SELECT to_jsonb(x)=before_game FROM public.games x WHERE id=g),'postgame duplicate receipt is read only');
 PERFORM pg_temp.farkle_identity((f->>'peer')::uuid);
 PERFORM public.configure_dealer_game(g,(f->>'b')::uuid,3,'horses','{"ante_amount":7}',(SELECT config_deadline FROM public.games WHERE id=g));
 SELECT to_jsonb(x) INTO before_game FROM public.games x WHERE id=g;
 again:=public.farkle_advance_postgame(g,r,d,1);
 PERFORM pg_temp.farkle_assert(again->>'outcome'='already_advanced' AND (SELECT to_jsonb(x)=before_game FROM public.games x WHERE id=g),'postgame late replay cannot change subsequent dealer game');
 PERFORM pg_temp.farkle_assert(public.farkle_read_replay(r)->'config'=terminal_state->'config','postgame replay keeps original immutable rules');
 INSERT INTO farkle_postgame_history_fixture VALUES(g,r,d);

 FOREACH mode IN ARRAY ARRAY['recovery','waiting','no_humans','pending_end','already_ended'] LOOP
  f:=pg_temp.farkle_postgame_fixture(); g:=(f->>'game')::uuid; d:=(f->>'dealer')::uuid; r:=(f->>'round')::uuid;
  PERFORM pg_temp.farkle_postgame_bank(f,mode='already_ended');
  PERFORM private.farkle_claim_v1(g,d,r,'cleanup');
  IF mode='waiting' THEN UPDATE public.players SET sit_out_next_hand=true WHERE game_id=g AND NOT is_bot; END IF;
  IF mode='no_humans' THEN UPDATE public.players SET stand_up_next_hand=true WHERE game_id=g AND NOT is_bot; END IF;
  IF mode='pending_end' THEN UPDATE public.games SET pending_session_end=true WHERE id=g; END IF;
  PERFORM set_config('app.farkle_authority','',true);
  IF mode='recovery' THEN
   -- Limit one with this synthetic timer first. Refuse an unsafe legacy side scan.
   PERFORM pg_temp.farkle_assert(NOT EXISTS(SELECT 1 FROM public.rounds rr JOIN public.games gg ON gg.id=rr.game_id
    WHERE gg.game_type IN ('horses','ship-captain-crew') AND gg.status='in_progress' AND gg.current_game_uuid=rr.dealer_game_id
    AND rr.horses_state->>'gamePhase'='playing' AND nullif(rr.horses_state->>'turnDeadline','') IS NULL),'recovery proof has no unrelated legacy actor writes');
   UPDATE private.game_timer_registry SET due_at='-infinity' WHERE game_id=g AND timer_kind='farkle_postgame';
   PERFORM private.advance_due_canonical_game_timers(1);
   PERFORM pg_temp.farkle_assert(EXISTS(SELECT 1 FROM private.game_timer_registry WHERE game_id=g AND timer_kind='farkle_postgame'
    AND state='completed' AND metadata->'result'->>'outcome'='advanced') AND (SELECT status='game_selection' FROM public.games WHERE id=g),'canonical timer dispatches isolated Farkle continuation');
   PERFORM pg_temp.farkle_assert(auth.uid()=(f->>'peer')::uuid AND coalesce(current_setting('app.farkle_authority',true),'')='','recovery restores JWT and Farkle authority');
  ELSE
   SELECT to_jsonb(x) INTO before_game FROM public.games x WHERE id=g;
   ans:=public.farkle_advance_postgame(g,r,d,1);
   PERFORM pg_temp.farkle_assert(ans->>'status'=CASE WHEN mode='waiting' THEN 'waiting' ELSE 'session_ended' END,'postgame participation disposition '||mode);
   IF mode='already_ended' THEN PERFORM pg_temp.farkle_assert((SELECT to_jsonb(x)=before_game FROM public.games x WHERE id=g),'already ended terminal frame preserved'); END IF;
  END IF;
  PERFORM private.farkle_claim_v1(g,d,NULL,'cleanup'); DELETE FROM public.games WHERE id=g;
  PERFORM set_config('app.farkle_authority','',true);
  PERFORM pg_temp.farkle_assert(NOT EXISTS(SELECT 1 FROM private.farkle_postgame_receipts_v2 WHERE game_id=g),'receipt cascade cleanup '||mode);
 END LOOP;
END $p$;

DO $guard$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.advance_due_canonical_game_timers(integer)'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('e7c784e3fa2e412d3333ffd2355096f4','3f60fdfc00de2466dd2f31060892db0d') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig=ARRAY['search_path=""']::text[] AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false) THEN RAISE EXCEPTION 'farkle_wave2:shared_metadata_drift'; END IF; END $guard$;
SELECT id FROM private.game_timer_registry WHERE timer_kind='farkle_postgame' AND state IN ('scheduled','processing') ORDER BY due_at,id FOR UPDATE;
SELECT pg_advisory_xact_lock(19092026,1);
UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
UPDATE private.farkle_postgame_control_v2 SET enabled=false WHERE singleton;
DO $active$ BEGIN IF EXISTS(SELECT 1 FROM public.games WHERE game_type='farkle' AND status IN ('ante_decision','in_progress','game_over')) THEN RAISE EXCEPTION 'farkle_wave2:active_games_require_compatible_recovery'; END IF; END $active$;
UPDATE private.game_timer_registry SET state='cancelled',completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE timer_kind='farkle_postgame' AND state IN ('scheduled','processing');
CREATE OR REPLACE FUNCTION private.advance_due_canonical_game_timers(p_limit integer DEFAULT 64)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_timer private.game_timer_registry%ROWTYPE;
  v_legacy record;
  v_result jsonb;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_decision text;
  v_fold_probability numeric;
  v_processed integer:=0;
  v_failed integer:=0;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  FOR v_timer IN
    SELECT timer.*
      FROM private.game_timer_registry timer
      JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE timer.owner_task='canonical_timers'
       AND timer.state='scheduled'
       AND timer.due_at<=clock_timestamp()
       AND NOT coalesce(game_row.is_paused,false)
     ORDER BY timer.due_at,timer.id
     LIMIT greatest(1,least(coalesce(p_limit,64),256))
     FOR UPDATE OF timer SKIP LOCKED
  LOOP
    UPDATE private.game_timer_registry
       SET state='processing',attempt_count=attempt_count+1,
           last_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_timer.id;
    BEGIN
      v_result:=NULL;
      CASE v_timer.timer_kind
        WHEN 'dealer_selection_prepare' THEN
          v_result:=private.prepare_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'dealer_selection_complete' THEN
          v_result:=private.complete_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'config_timeout' THEN
          v_result:=private.handle_config_deadline_timeout_exact(
            v_timer.game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            (v_timer.metadata->>'expected_dealer_position')::integer
          );
        WHEN 'ante_phase' THEN
          v_result:=private.advance_ante_phase_exact(
            v_timer.game_id,v_timer.dealer_game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            clock_timestamp()
          );
        WHEN 'holm_decision' THEN
          SELECT * INTO v_player FROM public.players
           WHERE id=v_timer.actor_player_id;
          IF NOT FOUND THEN
            v_result:=jsonb_build_object('outcome','stale_actor');
          ELSE
            IF coalesce(v_player.is_bot,false) THEN
              SELECT coalesce(defaults.bot_fold_probability,30)
                INTO v_fold_probability FROM public.game_defaults defaults
               WHERE defaults.game_type='holm' LIMIT 1;
              v_decision:=CASE WHEN private.secure_random_unit()*100<coalesce(v_fold_probability,30)
                               THEN 'fold' ELSE 'stay' END;
            ELSE
              v_decision:='fold';
            END IF;
            SELECT public.holm_apply_deadline_decision(
              v_timer.game_id,v_timer.round_id,v_player.id,v_decision,
              NOT coalesce(v_player.is_bot,false)
            ) INTO v_result;
          END IF;
        WHEN 'farkle_turn' THEN
          v_result:=private.farkle_advance_due_v1(v_timer.round_id,clock_timestamp());
        WHEN 'horses_scc_turn' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
        WHEN 'horses_scc_terminal' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
          IF v_result->>'status'='tie_waiting_for_client' THEN
            v_result:=private.horses_scc_rollover_abandoned_round(
              v_timer.round_id,clock_timestamp()
            );
          END IF;
        WHEN 'standard_postgame' THEN
          v_result:=private.advance_standard_postgame(
            v_timer.game_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        ELSE
          RAISE EXCEPTION 'advance_due_canonical_game_timers:unknown_kind:%',
            v_timer.timer_kind;
      END CASE;

      IF v_result->>'outcome' IN ('pending','paused','not_prepared','no_eligible_players','deadline_not_expired') THEN
        SELECT * INTO v_game FROM public.games WHERE id=v_timer.game_id;
        UPDATE private.game_timer_registry
           SET state='scheduled',
               due_at=CASE WHEN v_result->>'outcome' IN ('pending','deadline_not_expired')
                 AND v_result->>'deadline' IS NOT NULL
                 THEN (v_result->>'deadline')::timestamptz
                 ELSE clock_timestamp()+interval '1 second' END,
               metadata=CASE WHEN v_timer.timer_kind='ante_phase'
                 AND v_game.ante_decision_deadline IS NOT NULL
                 THEN metadata || jsonb_build_object(
                   'expected_deadline',v_game.ante_decision_deadline
                 ) ELSE metadata END,
               updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      ELSE
        UPDATE private.game_timer_registry
           SET state='completed',completed_at=clock_timestamp(),
               metadata=metadata || jsonb_build_object(
                 'result',coalesce(v_result,'{}'::jsonb)
               ),updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      END IF;
      v_processed:=v_processed+1;
    EXCEPTION WHEN OTHERS THEN
      v_error:=SQLSTATE || ':' || SQLERRM;
      UPDATE private.game_timer_registry
         SET state='scheduled',due_at=clock_timestamp()+interval '5 seconds',
             last_error=v_error,updated_at=clock_timestamp()
       WHERE id=v_timer.id;
      v_failed:=v_failed+1;
    END;
  END LOOP;

  -- Client-created legacy dice rounds used NULL as a bot-delay sentinel.
  -- Convert only the exact active post-cutover actor to a database timestamp;
  -- no historical row is scanned or admitted.
  FOR v_legacy IN
    SELECT round_row.id,round_row.game_id,defaults.bot_decision_delay_seconds
    FROM public.rounds round_row CROSS JOIN public.games game_row
    JOIN public.game_defaults defaults
      ON defaults.game_type=game_row.game_type
    JOIN public.players actor
      ON actor.game_id=game_row.id AND actor.is_bot=true
   WHERE round_row.game_id=game_row.id
     AND game_row.game_type IN ('horses','ship-captain-crew')
     AND game_row.status='in_progress'
     AND NOT coalesce(game_row.is_paused,false)
     AND game_row.current_game_uuid IS NOT DISTINCT FROM round_row.dealer_game_id
     AND round_row.horses_state->>'gamePhase'='playing'
     AND nullif(round_row.horses_state->>'turnDeadline','') IS NULL
     AND actor.id::text=round_row.horses_state->>'currentTurnPlayerId'
     AND EXISTS (
       SELECT 1 FROM private.game_timer_cutover cutover
        WHERE cutover.singleton=true
          AND game_row.timer_generation>0
     )
     AND NOT private.recovery_session_deferred('canonical_timers',game_row.id)
     ORDER BY round_row.id LIMIT 64
  LOOP
    BEGIN
      UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{turnDeadline}',to_jsonb(
        clock_timestamp()+make_interval(secs=>greatest(0.1,coalesce(v_legacy.bot_decision_delay_seconds,2)))),true)
      WHERE id=v_legacy.id;
      PERFORM private.clear_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN jsonb_build_object(
    'outcome',CASE WHEN v_failed=0 THEN 'completed' ELSE 'partial_failure' END,
    'processed',v_processed,'failed',v_failed
  );
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$
;
ALTER FUNCTION private.advance_due_canonical_game_timers(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.advance_due_canonical_game_timers(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.advance_due_canonical_game_timers(integer) TO postgres;
GRANT EXECUTE ON FUNCTION private.advance_due_canonical_game_timers(integer) TO service_role;
DO $verify$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.advance_due_canonical_game_timers(integer)'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('e7c784e3fa2e412d3333ffd2355096f4') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig=ARRAY['search_path=""']::text[] AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false) THEN RAISE EXCEPTION 'farkle_wave2:restoration_metadata_mismatch'; END IF; END $verify$;

SELECT pg_temp.farkle_assert(EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.advance_due_canonical_game_timers(integer)'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('e7c784e3fa2e412d3333ffd2355096f4') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig=ARRAY['search_path=""']::text[] AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false),'recovery 1: definition owner security attributes grants');

SAVEPOINT existing_games;

DO $proof$
DECLARE users uuid[]; g uuid; dg uuid; rd uuid; p uuid; peer uuid; kind text; ctx text; r jsonb; v bigint;
 denied boolean; before_round jsonb; before_game jsonb; deadline timestamptz; after_deadline timestamptz; duration numeric;
BEGIN
 SELECT array_agg(id) INTO users FROM (SELECT pr.id FROM public.profiles pr JOIN auth.users a ON a.id=pr.id WHERE pr.is_active
 AND NOT public.has_role(pr.id,'admin') ORDER BY pr.id LIMIT 2) q;
 IF cardinality(users)<2 THEN RAISE EXCEPTION 'proof:auth_fixtures'; END IF;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 FOREACH kind IN ARRAY ARRAY['3-5-7','holm-game','horses','ship-captain-crew','cribbage','gin-rummy','yahtzee'] LOOP
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'on',true); END LOOP;
  deadline:=clock_timestamp()+interval '1 minute';
  INSERT INTO public.games(name,status,real_money,game_type,total_hands,current_round,current_host)
   VALUES('Rollback pause '||kind,'in_progress',false,kind,1,1,users[1]) RETURNING id INTO g;
  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,users[1],kind) RETURNING id INTO dg;
  UPDATE public.games SET current_game_uuid=dg WHERE id=g;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[1],1,0,'active') RETURNING id INTO p;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[2],4,0,'active') RETURNING id INTO peer;
  INSERT INTO public.rounds(game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,current_turn_position,decision_deadline,presentation_fallback_at,horses_state,yahtzee_state)
   VALUES(g,dg,1,1,0,'betting',1,CASE WHEN kind IN ('cribbage','gin-rummy') THEN NULL ELSE deadline END,deadline,
   CASE WHEN kind IN ('horses','ship-captain-crew') THEN jsonb_build_object('gamePhase','playing','currentTurnPlayerId',p,'turnDeadline',deadline,'actionSequence',0) END,
   CASE WHEN kind='yahtzee' THEN jsonb_build_object('gamePhase','playing','currentTurnPlayerId',p,'turnDeadline',deadline,'actionSequence',0) END) RETURNING id INTO rd;
  IF kind='gin-rummy' THEN
   INSERT INTO private.gin_rummy_round_states(round_id,state) VALUES(rd,jsonb_build_object('phase','playing','playerStates','{}'::jsonb,'scoringDueAt',deadline,'completeDueAt',deadline,'botActionDueAt',deadline,'actionCount',0));
  ELSIF kind='cribbage' THEN
   INSERT INTO private.cribbage_round_states(round_id,state) VALUES(rd,jsonb_build_object('phase','counting','playerStates','{}'::jsonb,'countingResolution',jsonb_build_object('presentationReleaseAt',deadline-interval '5 seconds','presentationFallbackAt',deadline)));
  END IF;
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'',true); END LOOP;
  PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[2],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'not_authorized' THEN RAISE EXCEPTION 'proof:peer_pause:%',r; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'paused' OR (r->>'pause_version')::bigint<>1 THEN RAISE EXCEPTION 'proof:pause:%:%',kind,r; END IF;
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:old_pause_replay'; END IF;
  r:=public.set_game_paused(g,true,dg,1);
  IF r->>'outcome'<>'already_set' THEN RAISE EXCEPTION 'proof:identical_pause'; END IF;
  SELECT to_jsonb(x) INTO before_round FROM public.rounds x WHERE id=rd;
  -- Direct action requests must fail before consuming any legal turn.
  denied:=false;
  BEGIN
   CASE kind
    WHEN '3-5-7' THEN r:=public.three_five_seven_submit_decision(g,rd,dg,1,1,p,'stay');
    WHEN 'holm-game' THEN r:=public.holm_submit_decision(g,rd,p,'stay');
    WHEN 'horses' THEN r:=public.horses_scc_apply_action(rd,p,'roll',0,NULL);
    WHEN 'ship-captain-crew' THEN r:=public.horses_scc_apply_action(rd,p,'roll',0,NULL);
    WHEN 'yahtzee' THEN r:=public.yahtzee_apply_action(rd,p,'roll',NULL,NULL,NULL,0);
    WHEN 'cribbage' THEN r:=public.cribbage_apply_discard(rd,p,ARRAY[0]);
    WHEN 'gin-rummy' THEN r:=public.gin_rummy_apply_action(rd,p,'draw_stock',NULL,NULL,0);
   END CASE;
   denied:=r->>'outcome' IN ('paused','game_paused') OR r->>'reason' IN ('paused','game-paused','round_not_current') OR coalesce((r->>'game_paused')::boolean,false);
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT ILIKE '%paus%' THEN RAISE; END IF;
   denied:=true;
  END;
  IF NOT coalesce(denied,false) OR (SELECT to_jsonb(x) FROM public.rounds x WHERE id=rd) IS DISTINCT FROM before_round THEN RAISE EXCEPTION 'proof:paused_action_mutated:%:%',kind,r; END IF;
  r:=public.set_game_paused(g,false,dg,0);
  IF r->>'outcome'<>'stale_identity' OR NOT (SELECT is_paused FROM public.games WHERE id=g) THEN RAISE EXCEPTION 'proof:stale_resume'; END IF;
  EXECUTE 'RESET ROLE';
  -- The owner-role fallback is also barred: service identity cannot skip pause.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  denied:=false; BEGIN UPDATE public.rounds SET pot=pot+1 WHERE id=rd; EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:service_round_bypass'; END IF;
  denied:=false; BEGIN UPDATE public.games SET total_hands=total_hands+1 WHERE id=g; EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:service_game_bypass'; END IF;
  denied:=false; BEGIN UPDATE public.players SET chips=chips+1 WHERE id=p; EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:service_money_bypass'; END IF;
  -- Advance only the synthetic pause clock; no real waiting or shared setting.
  UPDATE public.games SET timer_paused_at=timer_paused_at-interval '5 seconds' WHERE id=g;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.set_game_paused(g,false,dg,1);
  IF r->>'outcome'<>'resumed' OR (r->>'pause_version')::bigint<>2 THEN RAISE EXCEPTION 'proof:resume:%:%',kind,r; END IF;
  duration:=(r->>'paused_duration_seconds')::numeric;
  SELECT presentation_fallback_at INTO after_deadline FROM public.rounds WHERE id=rd;
  IF abs(extract(epoch FROM(after_deadline-deadline))-duration)>0.001 THEN RAISE EXCEPTION 'proof:lease_shift:%',kind; END IF;
  IF kind IN ('cribbage','gin-rummy') AND (SELECT decision_deadline IS NOT NULL FROM public.rounds WHERE id=rd) THEN RAISE EXCEPTION 'proof:invented_human_timer'; END IF;
  r:=public.set_game_paused(g,true,dg,0);
  IF r->>'outcome'<>'stale_identity' OR (SELECT is_paused FROM public.games WHERE id=g) THEN RAISE EXCEPTION 'proof:late_pause'; END IF;
  r:=public.set_game_paused(g,true,gen_random_uuid(),2);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:wrong_dealer_game'; END IF;
  EXECUTE 'RESET ROLE';
  IF kind='gin-rummy' AND abs(extract(epoch FROM ((SELECT (state->>'botActionDueAt')::timestamptz FROM private.gin_rummy_round_states WHERE round_id=rd)-deadline))-duration)>0.001 THEN RAISE EXCEPTION 'proof:gin_due_shift'; END IF;
  IF kind='cribbage' AND abs(extract(epoch FROM ((SELECT (state->'countingResolution'->>'presentationFallbackAt')::timestamptz FROM private.cribbage_round_states WHERE round_id=rd)-deadline))-duration)>0.001 THEN RAISE EXCEPTION 'proof:cribbage_due_shift'; END IF;
  IF (SELECT sum(chips) FROM public.players WHERE game_id=g)<>0 OR EXISTS(SELECT 1 FROM public.game_results WHERE game_id=g) THEN RAISE EXCEPTION 'proof:pause_financial_change'; END IF;
  FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
   IF coalesce(current_setting(ctx,true),'')<>'' THEN RAISE EXCEPTION 'proof:authority_leak:%',ctx; END IF; END LOOP;
 END LOOP;

 -- Ending neutral paused setup remains a control request, not gameplay.
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.create_session(gen_random_uuid(),'Rollback paused end',true,1);
 g:=(r->>'game_id')::uuid;
 EXECUTE 'RESET ROLE';
 UPDATE public.games SET status='game_selection',config_deadline=clock_timestamp()+interval '1 minute' WHERE id=g;
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.set_game_paused(g,true,NULL,0);
 r:=public.request_session_end(g,NULL,(SELECT timer_generation FROM public.games WHERE id=g));
 IF r->>'terminal_disposition'<>'session_ended' THEN RAISE EXCEPTION 'proof:paused_control_end'; END IF;
 r:=public.set_game_paused(g,false,NULL,1);
 IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:ended_resume'; END IF;
 EXECUTE 'RESET ROLE';
END $proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'recovery: seven_game_pause_rollback_proof.sql');

SAVEPOINT existing_games;

-- Caller-owned rollback proof for the shared dealer configuration handoff.
-- Exercises every supported game plus authorization, validation, duplicate,
-- exact-identity replay, and late replay behavior.

DO $proof$
DECLARE
  v_users uuid[];
  v_outsider uuid:=gen_random_uuid();
  v_types text[]:=ARRAY['3-5-7','holm-game','cribbage','gin-rummy','horses','ship-captain-crew','yahtzee'];
  v_type text;
  v_game uuid;
  v_dealer_player uuid;
  v_other_player uuid;
  v_deadline timestamptz;
  v_config jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_dealer_game uuid;
  v_before jsonb;
  v_count integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at,id) INTO v_users FROM (
    SELECT p.id,p.created_at FROM public.profiles p JOIN auth.users u ON u.id=p.id ORDER BY p.created_at,p.id LIMIT 2
  ) profiles;
  IF coalesce(cardinality(v_users),0)<2 THEN
    RAISE EXCEPTION 'dealer_setup_proof:requires_two_profiles';
  END IF;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);

  FOREACH v_type IN ARRAY v_types LOOP
    v_game:=gen_random_uuid();
    v_deadline:=clock_timestamp()+interval '20 minutes';
    INSERT INTO public.games(
      id,name,status,game_type,current_host,dealer_position,config_complete,
      config_deadline,ante_decision_timer_seconds,pot,current_round,total_hands
    ) VALUES(
      v_game,'Codex rollback proof - setup '||v_type,'game_selection',NULL,
      v_users[1],1,false,v_deadline,30,CASE WHEN v_type='cribbage' THEN 0 ELSE 9 END,0,0
    );
    INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision,current_decision,decision_locked,auto_fold)
    VALUES
      (v_game,v_users[1],1,100,'active',true,false,NULL,'fold',true,true),
      (v_game,v_users[2],2,100,'folded',false,false,'ante_up','stay',true,true);
    SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
    SELECT id INTO v_other_player FROM public.players WHERE game_id=v_game AND position=2;

    v_config:=CASE v_type
      WHEN '3-5-7' THEN '{"ante_amount":3,"rollover_amount":1,"leg_value":2,"pussy_tax_enabled":true,"pussy_tax_value":1,"legs_to_win":3,"pot_max_enabled":true,"pot_max_value":12,"reveal_at_showdown":true}'::jsonb
      WHEN 'holm-game' THEN '{"ante_amount":2,"leg_value":2,"pussy_tax_enabled":true,"pussy_tax_value":1,"legs_to_win":3,"pot_max_enabled":true,"pot_max_value":12,"chucky_cards":4,"rabbit_hunt":true}'::jsonb
      WHEN 'cribbage' THEN '{"ante_amount":2,"points_to_win":121,"skunk_enabled":true,"skunk_threshold":91,"double_skunk_enabled":true,"double_skunk_threshold":61,"game_mode":"full"}'::jsonb
      WHEN 'gin-rummy' THEN '{"ante_amount":2,"points_to_win":100,"per_point_value":1,"gin_bonus":25,"undercut_bonus":25}'::jsonb
      ELSE '{"ante_amount":2}'::jsonb
    END;

    SET LOCAL ROLE authenticated;
    BEGIN
      UPDATE public.games SET ante_amount=989 WHERE id=v_game;
      RAISE EXCEPTION 'direct_ante_configuration_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      UPDATE public.games SET points_to_win=989 WHERE id=v_game;
      RAISE EXCEPTION 'direct_scoring_configuration_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      UPDATE public.games SET game_setup_timer_seconds=989 WHERE id=v_game;
      RAISE EXCEPTION 'direct_timer_configuration_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      UPDATE public.games SET dealer_selection_state='{"isComplete":true,"winnerPosition":1}'::jsonb WHERE id=v_game;
      RAISE EXCEPTION 'direct_draw_forgery_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config)
      VALUES(v_game,v_users[1],v_type,v_config);
      RAISE EXCEPTION 'direct_dealer_game_insert_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    SELECT public.configure_dealer_game(v_game,v_dealer_player,1,v_type,v_config,v_deadline) INTO v_result;
    RESET ROLE;
    v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
    IF v_result->>'outcome'<>'configured' OR coalesce((v_result->>'deduped')::boolean,true)
       OR (v_result#>>'{game,status}')<>'ante_decision'
       OR (v_result#>>'{game,current_game_uuid}')::uuid<>v_dealer_game
       OR v_result#>>'{game,ante_decision_deadline}' IS NULL
       OR v_result#>>'{game,config_deadline}' IS NOT NULL
       OR (v_result#>>'{dealer_game,game_type}')<>v_type
       OR (SELECT ante_decision FROM public.players WHERE id=v_dealer_player)<>'ante_up'
       OR (SELECT sitting_out FROM public.players WHERE id=v_dealer_player)
       OR (SELECT ante_decision FROM public.players WHERE id=v_other_player) IS NOT NULL
       OR (SELECT status FROM public.players WHERE id=v_other_player)<>'active'
       OR EXISTS(SELECT 1 FROM public.players WHERE game_id=v_game AND (current_decision IS NOT NULL OR decision_locked OR auto_fold))
       OR (SELECT count(*) FROM public.dealer_games WHERE session_id=v_game)<>1
       OR (SELECT count(*) FROM private.dealer_game_setup_commits WHERE game_id=v_game)<>1 THEN
      RAISE EXCEPTION 'dealer_setup_proof:atomic_handoff_invalid:%:%',v_type,v_result;
    END IF;
    IF (v_type='3-5-7' AND (
          (v_result#>>'{game,rollover_amount}')::integer<>1
          OR (v_result#>>'{game,leg_value}')::integer<>2
          OR (v_result#>>'{game,reveal_at_showdown}')::boolean IS NOT TRUE
       ))
       OR (v_type='holm-game' AND (
          (v_result#>>'{game,current_round}')::integer<>1
          OR (v_result#>>'{game,chucky_cards}')::integer<>4
          OR (v_result#>>'{game,rabbit_hunt}')::boolean IS NOT TRUE
       ))
       OR (v_type='cribbage' AND (
          (v_result#>>'{game,pot}')::integer<>0
          OR (v_result#>>'{game,points_to_win}')::integer<>121
          OR (v_result#>>'{game,skunk_threshold}')::integer<>91
       ))
       OR (v_type='gin-rummy' AND (
          (v_result#>>'{game,points_to_win}')::integer<>100
          OR (v_result#>>'{dealer_game,config,gin_bonus}')::integer<>25
       ))
       OR (v_type IN ('horses','ship-captain-crew','yahtzee') AND (
          (v_result#>>'{game,leg_value}')::integer<>0
          OR (v_result#>>'{game,pot_max_enabled}')::boolean IS NOT FALSE
       )) THEN
      RAISE EXCEPTION 'dealer_setup_proof:game_specific_state_invalid:%:%',v_type,v_result;
    END IF;
    SELECT public.configure_dealer_game(v_game,v_dealer_player,1,v_type,v_config,v_deadline) INTO v_replay;
    IF v_replay->>'outcome'<>'already_configured' OR coalesce((v_replay->>'deduped')::boolean,false) IS NOT TRUE
       OR (v_replay#>>'{dealer_game,id}')::uuid<>v_dealer_game
       OR (SELECT count(*) FROM public.dealer_games WHERE session_id=v_game)<>1 THEN
      RAISE EXCEPTION 'dealer_setup_proof:duplicate_changed_state:%:%',v_type,v_replay;
    END IF;
    IF v_type='yahtzee' THEN
      BEGIN
        PERFORM public.configure_dealer_game(v_game,v_dealer_player,1,v_type,'{"ante_amount":3}'::jsonb,v_deadline);
        RAISE EXCEPTION 'dealer_setup_proof:mismatched_replay_succeeded';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM='dealer_setup_proof:mismatched_replay_succeeded'
           OR SQLERRM NOT LIKE '%replay_payload_mismatch%' THEN RAISE; END IF;
      END;
    END IF;
  END LOOP;

  -- Unauthorized callers cannot create a setup commit.
  v_game:=gen_random_uuid(); v_deadline:=clock_timestamp()+interval '20 minutes';
  INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline)
  VALUES(v_game,'Codex rollback proof - unauthorized','game_selection',v_users[1],1,false,v_deadline);
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES(v_game,v_users[1],1,100,'active',false),(v_game,v_users[2],2,100,'active',false);
  SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_outsider)::text,true);
  BEGIN
    PERFORM public.configure_dealer_game(v_game,v_dealer_player,1,'yahtzee','{"ante_amount":2}'::jsonb,v_deadline);
    RAISE EXCEPTION 'dealer_setup_proof:outsider_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='dealer_setup_proof:outsider_succeeded' OR SQLERRM NOT LIKE '%not_in_session%' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=v_game) THEN
    RAISE EXCEPTION 'dealer_setup_proof:unauthorized_call_partially_mutated';
  END IF;

  -- Invalid configuration is atomic and creates no dealer-game row or claim.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  BEGIN
    PERFORM public.configure_dealer_game(v_game,v_dealer_player,1,'3-5-7','{"ante_amount":3,"rollover_amount":0}'::jsonb,v_deadline);
    RAISE EXCEPTION 'dealer_setup_proof:invalid_config_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='dealer_setup_proof:invalid_config_succeeded' OR SQLERRM NOT LIKE '%invalid_card_game_config%' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=v_game)
     OR EXISTS(SELECT 1 FROM private.dealer_game_setup_commits WHERE game_id=v_game) THEN
    RAISE EXCEPTION 'dealer_setup_proof:invalid_config_partially_mutated';
  END IF;

  -- A human session member may configure an eligible bot dealer. The bot's
  -- user identity, not the caller identity, owns the dealer-game row.
  v_game:=gen_random_uuid(); v_deadline:=clock_timestamp()+interval '20 minutes';
  INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline)
  VALUES(v_game,'Codex rollback proof - bot dealer','game_selection',v_users[1],1,false,v_deadline);
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES(v_game,v_users[2],1,100,'active',true),(v_game,v_users[1],2,100,'active',false);
  SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
  SELECT public.configure_dealer_game(v_game,v_dealer_player,1,'yahtzee','{"ante_amount":2}'::jsonb,v_deadline) INTO v_result;
  IF (v_result#>>'{dealer_game,dealer_user_id}')::uuid<>v_users[2]
     OR (SELECT ante_decision FROM public.players WHERE id=v_dealer_player)<>'ante_up' THEN
    RAISE EXCEPTION 'dealer_setup_proof:bot_dealer_invalid:%',v_result;
  END IF;

  -- Late replay returns its stored result and cannot overwrite a newer setup.
  v_game:=gen_random_uuid(); v_deadline:=clock_timestamp()+interval '20 minutes';
  INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline)
  VALUES(v_game,'Codex rollback proof - late replay','game_selection',v_users[1],1,false,v_deadline);
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES(v_game,v_users[1],1,100,'active',false),(v_game,v_users[2],2,100,'active',false);
  SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
  SELECT public.configure_dealer_game(v_game,v_dealer_player,1,'horses','{"ante_amount":2}'::jsonb,v_deadline) INTO v_result;
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.games SET status='game_selection',dealer_position=2,
    config_complete=false,config_deadline=v_deadline+interval '1 hour',current_game_uuid=NULL
   WHERE id=v_game;
  SELECT to_jsonb(game) INTO v_before FROM public.games game WHERE id=v_game;
  SELECT public.configure_dealer_game(v_game,v_dealer_player,1,'horses','{"ante_amount":2}'::jsonb,v_deadline) INTO v_replay;
  IF v_replay->>'outcome'<>'already_configured'
     OR (SELECT to_jsonb(game) FROM public.games game WHERE id=v_game) IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'dealer_setup_proof:late_replay_mutated_newer_setup:%',v_replay;
  END IF;

  SELECT count(*) INTO v_count FROM private.dealer_game_setup_commits;
  IF v_count<9 THEN RAISE EXCEPTION 'dealer_setup_proof:missing_claims:%',v_count; END IF;
END;
$proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'recovery: rule_configuration_authority_rollback_proof.sql');

SAVEPOINT existing_games;
SELECT set_config('app.three_five_seven_test_no_sweep','on',true);
-- Caller-owned rollback proof for the authenticated ante-decision request
-- boundary. The caller must apply the candidate migration in the same
-- transaction for the pre-deployment proof, then wrap this file in
-- BEGIN/ROLLBACK for the post-deployment proof.

DO $proof$
DECLARE
  v_users uuid[];
  v_outsider uuid:=gen_random_uuid();
  v_357_sit uuid:=gen_random_uuid();
  v_357_start uuid:=gen_random_uuid();
  v_yahtzee_sit uuid:=gen_random_uuid();
  v_deadline_357_sit timestamptz:=clock_timestamp()+interval '20 minutes';
  v_deadline_357_start timestamptz:=clock_timestamp()+interval '21 minutes';
  v_deadline_yahtzee_sit timestamptz:=clock_timestamp()+interval '22 minutes';
  v_dealer uuid;
  v_other uuid;
  v_dealer_game uuid;
  v_result jsonb;
  v_before_rounds integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at,id) INTO v_users FROM (
    SELECT id,created_at FROM public.profiles ORDER BY created_at,id LIMIT 2
  ) profiles;
  IF coalesce(cardinality(v_users),0)<2 THEN
    RAISE EXCEPTION 'ante_authority_proof:requires_two_profiles';
  END IF;

  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);

  INSERT INTO public.games(
    id,name,status,game_type,current_host,dealer_position,config_complete,
    config_deadline,ante_decision_timer_seconds,game_setup_timer_seconds,
    pot,current_round,total_hands,real_money
  ) VALUES
    (v_357_sit,'Codex rollback proof - 357 Sit Out','game_selection',NULL,
      v_users[1],1,false,v_deadline_357_sit,30,30,0,0,0,false),
    (v_357_start,'Codex rollback proof - 357 start','game_selection',NULL,
      v_users[1],1,false,v_deadline_357_start,30,30,0,0,0,false),
    (v_yahtzee_sit,'Codex rollback proof - Yahtzee Sit Out','game_selection',NULL,
      v_users[1],1,false,v_deadline_yahtzee_sit,30,30,0,0,0,false);

  INSERT INTO public.players(
    game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision
  ) VALUES
    (v_357_sit,v_users[1],1,100,'active',false,false,NULL),
    (v_357_sit,v_users[2],2,100,'active',false,false,NULL),
    (v_357_start,v_users[1],1,100,'active',false,false,NULL),
    (v_357_start,v_users[2],2,100,'active',false,false,NULL),
    (v_yahtzee_sit,v_users[1],1,100,'active',false,false,NULL),
    (v_yahtzee_sit,v_users[2],2,100,'active',false,false,NULL);

  -- 3-5-7 final Sit Out: setup and ante submission are separate HTTP
  -- transactions. Explicitly clear every setup authority flag before the
  -- second call so this proof cannot inherit setup's trusted context.
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_357_sit AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_357_sit AND position=2;
  SELECT public.configure_dealer_game(
    v_357_sit,v_dealer,1,'3-5-7',jsonb_build_object(
      'ante_amount',3,'rollover_amount',1,'leg_value',2,
      'pussy_tax_enabled',true,'pussy_tax_value',1,'legs_to_win',3,
      'pot_max_enabled',true,'pot_max_value',15,
      'reveal_at_showdown',true
    ),v_deadline_357_sit
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'ante_authority_proof:357_sit_setup_failed:%',v_result;
  END IF;
  PERFORM set_config('app.cribbage_authoritative_write','off',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.yahtzee_authoritative_write','off',true);

  -- Authorization remains in the public wrapper and cannot partially mutate.
  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_outsider
  )::text,true);
  SELECT public.submit_ante_decision(
    v_357_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'not_authorized'
     OR (SELECT ante_decision FROM public.players WHERE id=v_other) IS NOT NULL
     OR coalesce((SELECT sitting_out FROM public.players WHERE id=v_other),false) THEN
    RAISE EXCEPTION 'ante_authority_proof:unauthorized_357_sit_mutated:%',v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT public.submit_ante_decision(
    v_357_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'not_enough_players'
     OR v_result#>>'{phase,reason}'<>'waiting-not-enough-players'
     OR (SELECT status FROM public.games WHERE id=v_357_sit)<>'waiting'
     OR (SELECT current_game_uuid FROM public.games WHERE id=v_357_sit) IS NOT NULL
     OR (SELECT ante_decision FROM public.players WHERE id=v_other)<>'sit_out'
     OR NOT coalesce((SELECT sitting_out FROM public.players WHERE id=v_other),false) THEN
    RAISE EXCEPTION 'ante_authority_proof:357_sit_not_committed:%',v_result;
  END IF;
  SELECT public.submit_ante_decision(
    v_357_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'stale_identity'
     OR (SELECT count(*) FROM public.rounds WHERE game_id=v_357_sit)<>0 THEN
    RAISE EXCEPTION 'ante_authority_proof:357_sit_replay_changed_state:%',v_result;
  END IF;

  -- The same protected branch must work for Yahtzee without weakening its
  -- game-authority trigger.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_yahtzee_sit AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_yahtzee_sit AND position=2;
  SELECT public.configure_dealer_game(
    v_yahtzee_sit,v_dealer,1,'yahtzee',jsonb_build_object('ante_amount',3),
    v_deadline_yahtzee_sit
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'ante_authority_proof:yahtzee_sit_setup_failed:%',v_result;
  END IF;
  PERFORM set_config('app.cribbage_authoritative_write','off',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.yahtzee_authoritative_write','off',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT public.submit_ante_decision(
    v_yahtzee_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'not_enough_players'
     OR (SELECT status FROM public.games WHERE id=v_yahtzee_sit)<>'waiting'
     OR (SELECT ante_decision FROM public.players WHERE id=v_other)<>'sit_out'
     OR NOT coalesce((SELECT sitting_out FROM public.players WHERE id=v_other),false) THEN
    RAISE EXCEPTION 'ante_authority_proof:yahtzee_sit_not_committed:%',v_result;
  END IF;

  -- Normal 3-5-7 continuation remains exactly once and replay safe.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_357_start AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_357_start AND position=2;
  SELECT public.configure_dealer_game(
    v_357_start,v_dealer,1,'3-5-7',jsonb_build_object(
      'ante_amount',3,'rollover_amount',1,'leg_value',2,
      'pussy_tax_enabled',true,'pussy_tax_value',1,'legs_to_win',3,
      'pot_max_enabled',true,'pot_max_value',15,
      'reveal_at_showdown',true
    ),v_deadline_357_start
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'ante_authority_proof:357_start_setup_failed:%',v_result;
  END IF;
  PERFORM set_config('app.cribbage_authoritative_write','off',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.yahtzee_authoritative_write','off',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT count(*) INTO v_before_rounds FROM public.rounds
   WHERE game_id=v_357_start;
  SELECT public.submit_ante_decision(
    v_357_start,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'advanced'
     OR (SELECT status FROM public.games WHERE id=v_357_start)<>'in_progress'
     OR (SELECT count(*) FROM public.rounds WHERE game_id=v_357_start)
        <>v_before_rounds+1 THEN
    RAISE EXCEPTION 'ante_authority_proof:357_start_failed:%',v_result;
  END IF;
  SELECT public.submit_ante_decision(
    v_357_start,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'stale_identity'
     OR (SELECT count(*) FROM public.rounds WHERE game_id=v_357_start)
        <>v_before_rounds+1 THEN
    RAISE EXCEPTION 'ante_authority_proof:357_start_replay_changed_state:%',v_result;
  END IF;
END;
$proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'recovery: ante_decision_authority_boundary_rollback_proof.sql');

SAVEPOINT existing_games;

DO $proof$
DECLARE users uuid[]; req uuid:=gen_random_uuid(); g uuid; p uuid; peer uuid; dg uuid; rd uuid; r jsonb; v bigint;
 denied boolean; gen bigint; kind text; ctx text; before_count bigint;
BEGIN
 SELECT array_agg(id) INTO users FROM (SELECT pr.id FROM public.profiles pr JOIN auth.users a ON a.id=pr.id
 WHERE pr.is_active AND NOT public.has_role(pr.id,'admin') ORDER BY pr.id LIMIT 3) q;
 IF cardinality(users)<3 THEN RAISE EXCEPTION 'proof:three_auth_fixtures'; END IF;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.create_session(req,'Rollback atomic creation',false,1);
 g:=(r->>'game_id')::uuid; p:=(r->>'player_id')::uuid;
 IF r->>'outcome'<>'created' OR (SELECT current_host FROM public.games WHERE id=g) IS DISTINCT FROM users[1]
 OR (SELECT count(*) FROM public.players WHERE game_id=g)<>1 OR (SELECT chips FROM public.players WHERE id=p)<>0
 OR (SELECT pot FROM public.games WHERE id=g)<>0 THEN RAISE EXCEPTION 'proof:atomic_genesis:%',r; END IF;
 r:=public.create_session(req,'Rollback atomic creation',false,1);
 IF r->>'outcome'<>'already_created' OR (r->>'game_id')::uuid<>g THEN RAISE EXCEPTION 'proof:create_duplicate'; END IF;
 denied:=false; BEGIN PERFORM public.create_session(req,'Different payload',true,1); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:create_payload_replay'; END IF;
 SELECT count(*) INTO before_count FROM public.games;
 denied:=false; BEGIN PERFORM public.create_session(gen_random_uuid(),'Invalid seat',false,8); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied OR (SELECT count(*) FROM public.games)<>before_count THEN RAISE EXCEPTION 'proof:creation_failure_orphan'; END IF;
 denied:=false; BEGIN INSERT INTO public.games(name,status,real_money) VALUES('Raw creation denied','waiting',false); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_genesis'; END IF;
 denied:=false; BEGIN UPDATE public.players SET auto_fold=true WHERE id=p; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_gameplay'; END IF;
 denied:=false; BEGIN DELETE FROM public.players WHERE id=p; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_delete'; END IF;
 denied:=false; BEGIN INSERT INTO public.players(game_id,user_id,chips,position) VALUES(g,users[1],0,3); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:raw_player_genesis'; END IF;
 UPDATE public.players SET deck_color_mode='four_color' WHERE id=p;
 IF (SELECT deck_color_mode FROM public.players WHERE id=p)<>'four_color' THEN RAISE EXCEPTION 'proof:own_color'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[2],'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false; BEGIN PERFORM public.create_session(req,'Rollback atomic creation',false,1); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:create_actor_replay'; END IF;
 UPDATE public.players SET deck_color_mode='two_color' WHERE id=p;
 IF FOUND THEN RAISE EXCEPTION 'proof:peer_color'; END IF;
 r:=public.session_take_seat(g,4,NULL,NULL); peer:=(r->>'player_id')::uuid;
 IF r->>'outcome'<>'seated' THEN RAISE EXCEPTION 'proof:admission'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 SELECT timer_generation INTO gen FROM public.games WHERE id=g;
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.request_session_end(g,NULL,gen);
 IF r->>'terminal_disposition'<>'deleted' THEN RAISE EXCEPTION 'proof:fake_cleanup'; END IF;
 r:=public.create_session(req,'Rollback atomic creation',false,1);
 IF r->>'outcome'<>'already_deleted' OR r->>'game_id' IS NOT NULL THEN RAISE EXCEPTION 'proof:late_creation_resurrected'; END IF;
 EXECUTE 'RESET ROLE';

 FOREACH kind IN ARRAY ARRAY['3-5-7','holm-game','horses','ship-captain-crew','cribbage','gin-rummy','yahtzee'] LOOP
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'on',true); END LOOP;
  INSERT INTO public.games(name,status,real_money,game_type,total_hands,current_round,current_host)
   VALUES('Rollback automatic play '||kind,'in_progress',false,kind,1,1,users[1]) RETURNING id INTO g;
  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,users[1],kind) RETURNING id INTO dg;
  UPDATE public.games SET current_game_uuid=dg WHERE id=g;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[1],1,0,'active') RETURNING id INTO p;
  INSERT INTO public.players(game_id,user_id,position,chips,status) VALUES(g,users[2],4,0,'active') RETURNING id INTO peer;
  INSERT INTO public.rounds(game_id,dealer_game_id,round_number,hand_number,status,cards_dealt,horses_state)
   VALUES(g,dg,1,1,'betting',0,jsonb_build_object('gamePhase','playing','currentTurnPlayerId',p)) RETURNING id INTO rd;
  FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP PERFORM set_config(ctx,'',true); END LOOP;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT intent_version INTO v FROM public.players WHERE id=p;
  denied:=false; BEGIN PERFORM public.set_automatic_play(g,rd,dg,peer,0,true); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'proof:peer_automatic_play:%',kind; END IF;
  r:=public.set_automatic_play(g,rd,gen_random_uuid(),p,v,true);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:wrong_dealer_game'; END IF;
  r:=public.set_automatic_play(g,rd,dg,p,v,true);
  IF r->>'outcome'<>'accepted' OR NOT (r->'player'->>'auto_fold')::boolean THEN RAISE EXCEPTION 'proof:enable:%:%',kind,r; END IF;
  r:=public.set_automatic_play(g,rd,dg,p,v,false);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:stale_intent'; END IF;
  SELECT intent_version INTO v FROM public.players WHERE id=p;
  r:=public.set_automatic_play(g,rd,dg,p,v,false);
  IF r->>'outcome'<>'accepted' THEN RAISE EXCEPTION 'proof:disable:%',kind; END IF;
  IF kind IN ('horses','ship-captain-crew') THEN
   IF NOT (r->>'deferred')::boolean OR NOT (r->'player'->>'auto_fold')::boolean OR (r->'player'->>'auto_play_stop_round_id')::uuid<>rd THEN RAISE EXCEPTION 'proof:deferred_request'; END IF;
   -- Duplicate old disable cannot override a newer deliberate enable.
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:queue_version'; END IF;
   EXECUTE 'RESET ROLE';
   -- No connected browser action: server turn advance alone consumes the intent.
   UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{currentTurnPlayerId}',to_jsonb(peer::text)) WHERE id=rd;
   IF (SELECT auto_fold OR auto_play_stop_round_id IS NOT NULL FROM public.players WHERE id=p) THEN RAISE EXCEPTION 'proof:disconnect_stop_lost'; END IF;
   EXECUTE 'SET LOCAL ROLE authenticated';
  ELSIF (r->'player'->>'auto_fold')::boolean OR (r->>'deferred')::boolean THEN RAISE EXCEPTION 'proof:immediate_stop:%',kind;
  END IF;
  EXECUTE 'RESET ROLE';
  IF kind IN ('horses','ship-captain-crew') THEN
   UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{currentTurnPlayerId}',to_jsonb(p::text)) WHERE id=rd;
   UPDATE public.games SET is_paused=true WHERE id=g;
   EXECUTE 'SET LOCAL ROLE authenticated';
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,true);
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF NOT (r->>'deferred')::boolean THEN RAISE EXCEPTION 'proof:paused_stop'; END IF;
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,true);
   IF r->'player'->>'auto_play_stop_round_id' IS NOT NULL THEN RAISE EXCEPTION 'proof:enable_did_not_cancel_stop'; END IF;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:old_stop_overrode_enable'; END IF;
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   EXECUTE 'RESET ROLE';
   -- A delayed old-round completion must never disable automation in a new dealer game.
   INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,users[1],kind) RETURNING id INTO dg;
   UPDATE public.games SET is_paused=false WHERE id=g;
   UPDATE public.games SET current_game_uuid=dg WHERE id=g;
   UPDATE public.rounds SET status='completed' WHERE id=rd;
   IF NOT (SELECT auto_fold FROM public.players WHERE id=p) OR
    (SELECT auto_play_stop_round_id IS NOT NULL FROM public.players WHERE id=p) THEN RAISE EXCEPTION 'proof:cross_identity_stop'; END IF;
   EXECUTE 'SET LOCAL ROLE authenticated';
   SELECT intent_version INTO v FROM public.players WHERE id=p;
   r:=public.set_automatic_play(g,rd,dg,p,v,false);
   IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:completed_round_toggle'; END IF;
   EXECUTE 'RESET ROLE';
  END IF;
  IF (SELECT sum(chips) FROM public.players WHERE game_id=g)<>0 OR (SELECT pot FROM public.games WHERE id=g)<>0 THEN RAISE EXCEPTION 'proof:money_changed'; END IF;
  IF coalesce(current_setting('app.three_five_seven_authoritative_write',true),'')<>'' THEN RAISE EXCEPTION 'proof:authority_leak'; END IF;
 END LOOP;
 -- Preference arguments cannot bypass the mutually exclusive server intent.
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false; BEGIN PERFORM public.submit_ante_decision(g,dg,p,'ante_up',true,true); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:conflicting_ante_preferences'; END IF;
 EXECUTE 'RESET ROLE';
 IF has_table_privilege('authenticated','public.players','UPDATE') OR has_table_privilege('authenticated','public.games','INSERT')
 OR has_column_privilege('authenticated','public.players','chips','UPDATE')
 OR has_column_privilege('authenticated','public.players','auto_play_stop_round_id','UPDATE')
 THEN RAISE EXCEPTION 'proof:privilege_closure'; END IF;
END $proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'recovery: final_player_authority_rollback_proof.sql');

SAVEPOINT existing_games;

-- Caller-owned rollback proof for canonical timer ownership.
-- Covers authorization, future-only admission, ante continuation, a dice tie
-- and successor, a terminal winner, duplicate/replay/late-replay behavior,
-- and pause/resume deadline preservation.  The caller must wrap this file in
-- BEGIN/ROLLBACK.

DO $proof$
DECLARE
  v_users uuid[];
  v_outsider uuid:=gen_random_uuid();
  v_game uuid:=gen_random_uuid();
  v_pause_game uuid:=gen_random_uuid();
  v_dealer uuid;
  v_other uuid;
  v_deadline timestamptz:=clock_timestamp()+interval '20 minutes';
  v_dealer_game uuid;
  v_round uuid;
  v_successor uuid;
  v_result jsonb;
  v_replay jsonb;
  v_tie_state jsonb;
  v_winner_state jsonb;
  v_before_count integer;
  v_after_count integer;
  v_before_deadline timestamptz;
  v_after_deadline timestamptz;
  v_cutover timestamptz;
BEGIN
  SELECT array_agg(id ORDER BY created_at,id) INTO v_users FROM (
    SELECT id,created_at FROM public.profiles ORDER BY created_at,id LIMIT 2
  ) profiles;
  IF coalesce(cardinality(v_users),0)<2 THEN
    RAISE EXCEPTION 'canonical_timer_proof:requires_two_profiles';
  END IF;

  SELECT cutover_at INTO v_cutover FROM private.game_timer_cutover
   WHERE singleton=true;
  IF EXISTS (
    SELECT 1 FROM private.game_timer_registry timer
     WHERE timer.created_at>=v_cutover
       AND timer.due_at<v_cutover
  ) THEN
    RAISE EXCEPTION 'canonical_timer_proof:expired_history_was_admitted';
  END IF;

  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);

  INSERT INTO public.games(
    id,name,status,game_type,current_host,dealer_position,config_complete,
    config_deadline,ante_decision_timer_seconds,game_setup_timer_seconds,
    pot,current_round,total_hands,real_money
  ) VALUES (
    v_game,'Codex rollback proof - canonical timers','game_selection',NULL,
    v_users[1],1,false,v_deadline,30,30,0,0,0,false
  );
  INSERT INTO public.players(
    game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision
  ) VALUES
    (v_game,v_users[1],1,100,'active',false,false,NULL),
    (v_game,v_users[2],2,100,'active',false,false,NULL);
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_game AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_game AND position=2;

  SELECT public.configure_dealer_game(
    v_game,v_dealer,1,'horses','{"ante_amount":2}'::jsonb,v_deadline
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'canonical_timer_proof:setup_failed:%',v_result;
  END IF;

  -- Authorization: an outsider cannot submit another player's ante and the
  -- failed call cannot partially mutate the player.
  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_outsider
  )::text,true);
  SELECT public.submit_ante_decision(
    v_game,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'not_authorized'
     OR (SELECT ante_decision FROM public.players WHERE id=v_other) IS NOT NULL THEN
    RAISE EXCEPTION 'canonical_timer_proof:unauthorized_ante_mutated:%',v_result;
  END IF;

  -- The second valid ante atomically continues into the database-owned dice
  -- first round.  No browser start callback is involved.
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT public.submit_ante_decision(
    v_game,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'advanced'
     OR (SELECT status FROM public.games WHERE id=v_game)<>'in_progress'
     OR (SELECT count(*) FROM public.rounds
          WHERE game_id=v_game AND dealer_game_id=v_dealer_game)<>1 THEN
    RAISE EXCEPTION 'canonical_timer_proof:ante_continuation_failed:%',v_result;
  END IF;
  SELECT id INTO v_round FROM public.rounds
   WHERE game_id=v_game AND dealer_game_id=v_dealer_game
     AND hand_number=1 AND round_number=1;

  -- Duplicate decision/replay cannot create another first round.
  SELECT public.submit_ante_decision(
    v_game,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_replay;
  IF v_replay->>'outcome'<>'stale_identity'
     OR (SELECT count(*) FROM public.rounds
          WHERE game_id=v_game AND dealer_game_id=v_dealer_game)<>1 THEN
    RAISE EXCEPTION 'canonical_timer_proof:duplicate_ante_changed_state:%',v_replay;
  END IF;

  -- Tie proof: exact terminal dice state rolls into one successor even while
  -- humans are present; a replay returns already_advanced.
  v_tie_state:=jsonb_build_object(
    'currentTurnPlayerId',NULL,'gamePhase','complete','turnDeadline',NULL,
    'turnOrder',jsonb_build_array(v_dealer,v_other),
    'playerStates',jsonb_build_object(
      v_dealer::text,jsonb_build_object(
        'dice',jsonb_build_array(
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false)
        ),'rollsRemaining',0,'isComplete',true
      ),
      v_other::text,jsonb_build_object(
        'dice',jsonb_build_array(
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false)
        ),'rollsRemaining',0,'isComplete',true
      )
    )
  );
  UPDATE public.rounds SET horses_state=v_tie_state WHERE id=v_round;
  SELECT private.horses_scc_rollover_abandoned_round(
    v_round,clock_timestamp()
  ) INTO v_result;
  IF v_result->>'status'<>'advanced'
     OR (v_result->>'hand_number')::integer<>2 THEN
    RAISE EXCEPTION 'canonical_timer_proof:tie_continuation_failed:%',v_result;
  END IF;
  SELECT id INTO v_successor FROM public.rounds
   WHERE game_id=v_game AND dealer_game_id=v_dealer_game AND hand_number=2;
  SELECT private.horses_scc_rollover_abandoned_round(
    v_round,clock_timestamp()
  ) INTO v_replay;
  IF v_replay->>'status'<>'not_current'
     OR (SELECT count(*) FROM public.rounds
          WHERE game_id=v_game AND dealer_game_id=v_dealer_game)<>2 THEN
    RAISE EXCEPTION 'canonical_timer_proof:tie_replay_changed_state:%',v_replay;
  END IF;

  -- Winner/terminal proof: successor settles once, publishes game_over, and
  -- canonical postgame advances once with an exact replay receipt.
  v_winner_state:=jsonb_build_object(
    'currentTurnPlayerId',NULL,'gamePhase','complete','turnDeadline',NULL,
    'turnOrder',jsonb_build_array(v_dealer,v_other),
    'playerStates',jsonb_build_object(
      v_dealer::text,jsonb_build_object(
        'dice',jsonb_build_array(
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false)
        ),'rollsRemaining',0,'isComplete',true
      ),
      v_other::text,jsonb_build_object(
        'dice',jsonb_build_array(
          jsonb_build_object('value',1,'isHeld',false),
          jsonb_build_object('value',1,'isHeld',false),
          jsonb_build_object('value',1,'isHeld',false),
          jsonb_build_object('value',1,'isHeld',false),
          jsonb_build_object('value',1,'isHeld',false)
        ),'rollsRemaining',0,'isComplete',true
      )
    )
  );
  UPDATE public.rounds SET horses_state=v_winner_state WHERE id=v_successor;
  SELECT public.horses_settle_game(
    v_game,v_successor,v_dealer_game,2
  ) INTO v_result;
  IF v_result->>'status'<>'settled'
     OR (SELECT status FROM public.games WHERE id=v_game)<>'game_over' THEN
    RAISE EXCEPTION 'canonical_timer_proof:winner_terminal_failed:%',v_result;
  END IF;
  SELECT public.horses_settle_game(
    v_game,v_successor,v_dealer_game,2
  ) INTO v_replay;
  IF v_replay->>'status'<>'already_settled' THEN
    RAISE EXCEPTION 'canonical_timer_proof:winner_duplicate_failed:%',v_replay;
  END IF;

  SELECT private.advance_standard_postgame(v_game,v_dealer_game,2)
    INTO v_result;
  IF v_result->>'outcome'<>'advanced'
     OR v_result->>'status'<>'game_selection' THEN
    RAISE EXCEPTION 'canonical_timer_proof:terminal_postgame_failed:%',v_result;
  END IF;
  SELECT private.advance_standard_postgame(v_game,v_dealer_game,2)
    INTO v_replay;
  IF v_replay->>'outcome'<>'already_advanced'
     OR coalesce((v_replay->>'deduped')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'canonical_timer_proof:postgame_replay_failed:%',v_replay;
  END IF;

  -- Late replay of the old ante identity cannot cross the dealer-game/lifecycle
  -- boundary or manufacture a third round.
  SELECT count(*) INTO v_before_count FROM public.rounds WHERE game_id=v_game;
  SELECT private.advance_ante_phase_exact(
    v_game,v_dealer_game,(SELECT ante_decision_deadline FROM public.games
      WHERE id=v_game),clock_timestamp()
  ) INTO v_replay;
  SELECT count(*) INTO v_after_count FROM public.rounds WHERE game_id=v_game;
  IF v_replay->>'outcome'<>'stale_identity' OR v_after_count<>v_before_count THEN
    RAISE EXCEPTION 'canonical_timer_proof:late_replay_crossed_boundary:%',v_replay;
  END IF;

  -- Pause/resume proof on a separate exact setup clock.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);
  INSERT INTO public.games(
    id,name,status,current_host,dealer_position,config_complete,config_deadline
  ) VALUES (
    v_pause_game,'Codex rollback proof - pause','game_selection',
    v_users[1],1,false,clock_timestamp()+interval '10 minutes'
  );
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES
    (v_pause_game,v_users[1],1,100,'active',false),
    (v_pause_game,v_users[2],2,100,'active',false);
  SELECT config_deadline INTO v_before_deadline FROM public.games
   WHERE id=v_pause_game;
  SELECT public.set_game_paused(v_pause_game,true,
    (SELECT current_game_uuid FROM public.games WHERE id=v_pause_game),
    (SELECT pause_version FROM public.games WHERE id=v_pause_game)) INTO v_result;
  IF v_result->>'outcome'<>'paused' THEN
    RAISE EXCEPTION 'canonical_timer_proof:pause_failed:%',v_result;
  END IF;
  UPDATE public.games SET timer_paused_at=timer_paused_at-interval '5 seconds'
   WHERE id=v_pause_game;
  SELECT public.set_game_paused(v_pause_game,false,
    (SELECT current_game_uuid FROM public.games WHERE id=v_pause_game),
    (SELECT pause_version FROM public.games WHERE id=v_pause_game)) INTO v_result;
  SELECT config_deadline INTO v_after_deadline FROM public.games
   WHERE id=v_pause_game;
  IF v_result->>'outcome'<>'resumed'
     OR v_after_deadline<v_before_deadline+interval '4.9 seconds' THEN
    RAISE EXCEPTION 'canonical_timer_proof:resume_did_not_preserve_time:%',v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_outsider
  )::text,true);
  SELECT public.set_game_paused(v_pause_game,true,
    (SELECT current_game_uuid FROM public.games WHERE id=v_pause_game),
    (SELECT pause_version FROM public.games WHERE id=v_pause_game)) INTO v_result;
  IF v_result->>'outcome'<>'not_authorized'
     OR (SELECT is_paused FROM public.games WHERE id=v_pause_game) THEN
    RAISE EXCEPTION 'canonical_timer_proof:unauthorized_pause_mutated:%',v_result;
  END IF;

  -- Policy proof: no Gin/Cribbage human decision timer kind exists.
  IF EXISTS (
    SELECT 1 FROM private.game_timer_registry timer
    JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE game_row.game_type IN ('gin-rummy','cribbage')
       AND timer.state IN ('scheduled','processing')
       AND timer.timer_kind IN ('holm_decision','three_five_seven_decision',
                                'horses_scc_turn','yahtzee_turn')
  ) THEN
    RAISE EXCEPTION 'canonical_timer_proof:untimed_game_received_human_clock';
  END IF;
END;
$proof$;

ROLLBACK TO existing_games;
RELEASE existing_games;
SELECT pg_temp.farkle_assert(true,'recovery: canonical_game_timer_rollback_proof.sql');

DO $guard$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.advance_due_canonical_game_timers(integer)'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('e7c784e3fa2e412d3333ffd2355096f4','3f60fdfc00de2466dd2f31060892db0d') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig=ARRAY['search_path=""']::text[] AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false) THEN RAISE EXCEPTION 'farkle_wave2:shared_metadata_drift'; END IF; END $guard$;
DO $gate$ BEGIN IF NOT EXISTS(SELECT 1 FROM private.farkle_release WHERE singleton AND NOT creation_enabled AND admin_only AND NOT production_defaults_approved) OR EXISTS(SELECT 1 FROM public.game_defaults WHERE game_type='farkle') THEN RAISE EXCEPTION 'farkle_wave2:release_gate_changed'; END IF; END $gate$;
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

CREATE OR REPLACE FUNCTION private.advance_due_canonical_game_timers(p_limit integer DEFAULT 64)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_timer private.game_timer_registry%ROWTYPE;
  v_legacy record;
  v_result jsonb;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_decision text;
  v_fold_probability numeric;
  v_processed integer:=0;
  v_failed integer:=0;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  FOR v_timer IN
    SELECT timer.*
      FROM private.game_timer_registry timer
      JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE timer.owner_task='canonical_timers'
       AND timer.state='scheduled'
       AND timer.due_at<=clock_timestamp()
       AND NOT coalesce(game_row.is_paused,false)
     ORDER BY timer.due_at,timer.id
     LIMIT greatest(1,least(coalesce(p_limit,64),256))
     FOR UPDATE OF timer SKIP LOCKED
  LOOP
    UPDATE private.game_timer_registry
       SET state='processing',attempt_count=attempt_count+1,
           last_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_timer.id;
    BEGIN
      v_result:=NULL;
      CASE v_timer.timer_kind
        WHEN 'dealer_selection_prepare' THEN
          v_result:=private.prepare_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'dealer_selection_complete' THEN
          v_result:=private.complete_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'config_timeout' THEN
          v_result:=private.handle_config_deadline_timeout_exact(
            v_timer.game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            (v_timer.metadata->>'expected_dealer_position')::integer
          );
        WHEN 'ante_phase' THEN
          v_result:=private.advance_ante_phase_exact(
            v_timer.game_id,v_timer.dealer_game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            clock_timestamp()
          );
        WHEN 'holm_decision' THEN
          SELECT * INTO v_player FROM public.players
           WHERE id=v_timer.actor_player_id;
          IF NOT FOUND THEN
            v_result:=jsonb_build_object('outcome','stale_actor');
          ELSE
            IF coalesce(v_player.is_bot,false) THEN
              SELECT coalesce(defaults.bot_fold_probability,30)
                INTO v_fold_probability FROM public.game_defaults defaults
               WHERE defaults.game_type='holm' LIMIT 1;
              v_decision:=CASE WHEN private.secure_random_unit()*100<coalesce(v_fold_probability,30)
                               THEN 'fold' ELSE 'stay' END;
            ELSE
              v_decision:='fold';
            END IF;
            SELECT public.holm_apply_deadline_decision(
              v_timer.game_id,v_timer.round_id,v_player.id,v_decision,
              NOT coalesce(v_player.is_bot,false)
            ) INTO v_result;
          END IF;
        WHEN 'farkle_postgame' THEN
          v_result:=public.farkle_advance_postgame(
            v_timer.game_id,v_timer.round_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        WHEN 'farkle_turn' THEN
          v_result:=private.farkle_advance_due_v1(v_timer.round_id,clock_timestamp());
        WHEN 'horses_scc_turn' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
        WHEN 'horses_scc_terminal' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
          IF v_result->>'status'='tie_waiting_for_client' THEN
            v_result:=private.horses_scc_rollover_abandoned_round(
              v_timer.round_id,clock_timestamp()
            );
          END IF;
        WHEN 'standard_postgame' THEN
          v_result:=private.advance_standard_postgame(
            v_timer.game_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        ELSE
          RAISE EXCEPTION 'advance_due_canonical_game_timers:unknown_kind:%',
            v_timer.timer_kind;
      END CASE;

      IF v_result->>'outcome' IN ('pending','paused','not_prepared','no_eligible_players','deadline_not_expired') THEN
        SELECT * INTO v_game FROM public.games WHERE id=v_timer.game_id;
        UPDATE private.game_timer_registry
           SET state='scheduled',
               due_at=CASE WHEN v_result->>'outcome' IN ('pending','deadline_not_expired')
                 AND v_result->>'deadline' IS NOT NULL
                 THEN (v_result->>'deadline')::timestamptz
                 ELSE clock_timestamp()+interval '1 second' END,
               metadata=CASE WHEN v_timer.timer_kind='ante_phase'
                 AND v_game.ante_decision_deadline IS NOT NULL
                 THEN metadata || jsonb_build_object(
                   'expected_deadline',v_game.ante_decision_deadline
                 ) ELSE metadata END,
               updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      ELSE
        UPDATE private.game_timer_registry
           SET state='completed',completed_at=clock_timestamp(),
               metadata=metadata || jsonb_build_object(
                 'result',coalesce(v_result,'{}'::jsonb)
               ),updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      END IF;
      v_processed:=v_processed+1;
    EXCEPTION WHEN OTHERS THEN
      v_error:=SQLSTATE || ':' || SQLERRM;
      UPDATE private.game_timer_registry
         SET state='scheduled',due_at=clock_timestamp()+interval '5 seconds',
             last_error=v_error,updated_at=clock_timestamp()
       WHERE id=v_timer.id;
      v_failed:=v_failed+1;
    END;
  END LOOP;

  -- Client-created legacy dice rounds used NULL as a bot-delay sentinel.
  -- Convert only the exact active post-cutover actor to a database timestamp;
  -- no historical row is scanned or admitted.
  FOR v_legacy IN
    SELECT round_row.id,round_row.game_id,defaults.bot_decision_delay_seconds
    FROM public.rounds round_row CROSS JOIN public.games game_row
    JOIN public.game_defaults defaults
      ON defaults.game_type=game_row.game_type
    JOIN public.players actor
      ON actor.game_id=game_row.id AND actor.is_bot=true
   WHERE round_row.game_id=game_row.id
     AND game_row.game_type IN ('horses','ship-captain-crew')
     AND game_row.status='in_progress'
     AND NOT coalesce(game_row.is_paused,false)
     AND game_row.current_game_uuid IS NOT DISTINCT FROM round_row.dealer_game_id
     AND round_row.horses_state->>'gamePhase'='playing'
     AND nullif(round_row.horses_state->>'turnDeadline','') IS NULL
     AND actor.id::text=round_row.horses_state->>'currentTurnPlayerId'
     AND EXISTS (
       SELECT 1 FROM private.game_timer_cutover cutover
        WHERE cutover.singleton=true
          AND game_row.timer_generation>0
     )
     AND NOT private.recovery_session_deferred('canonical_timers',game_row.id)
     ORDER BY round_row.id LIMIT 64
  LOOP
    BEGIN
      UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{turnDeadline}',to_jsonb(
        clock_timestamp()+make_interval(secs=>greatest(0.1,coalesce(v_legacy.bot_decision_delay_seconds,2)))),true)
      WHERE id=v_legacy.id;
      PERFORM private.clear_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN jsonb_build_object(
    'outcome',CASE WHEN v_failed=0 THEN 'completed' ELSE 'partial_failure' END,
    'processed',v_processed,'failed',v_failed
  );
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$
;

SELECT pg_temp.farkle_assert(EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.advance_due_canonical_game_timers(integer)'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('3f60fdfc00de2466dd2f31060892db0d') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig=ARRAY['search_path=""']::text[] AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false),'reinstalled candidate: definition owner security attributes grants');

DO $guard$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.advance_due_canonical_game_timers(integer)'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('e7c784e3fa2e412d3333ffd2355096f4','3f60fdfc00de2466dd2f31060892db0d') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig=ARRAY['search_path=""']::text[] AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false) THEN RAISE EXCEPTION 'farkle_wave2:shared_metadata_drift'; END IF; END $guard$;
SELECT id FROM private.game_timer_registry WHERE timer_kind='farkle_postgame' AND state IN ('scheduled','processing') ORDER BY due_at,id FOR UPDATE;
SELECT pg_advisory_xact_lock(19092026,1);
UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
UPDATE private.farkle_postgame_control_v2 SET enabled=false WHERE singleton;
DO $active$ BEGIN IF EXISTS(SELECT 1 FROM public.games WHERE game_type='farkle' AND status IN ('ante_decision','in_progress','game_over')) THEN RAISE EXCEPTION 'farkle_wave2:active_games_require_compatible_recovery'; END IF; END $active$;
UPDATE private.game_timer_registry SET state='cancelled',completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE timer_kind='farkle_postgame' AND state IN ('scheduled','processing');
CREATE OR REPLACE FUNCTION private.advance_due_canonical_game_timers(p_limit integer DEFAULT 64)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_timer private.game_timer_registry%ROWTYPE;
  v_legacy record;
  v_result jsonb;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_decision text;
  v_fold_probability numeric;
  v_processed integer:=0;
  v_failed integer:=0;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  FOR v_timer IN
    SELECT timer.*
      FROM private.game_timer_registry timer
      JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE timer.owner_task='canonical_timers'
       AND timer.state='scheduled'
       AND timer.due_at<=clock_timestamp()
       AND NOT coalesce(game_row.is_paused,false)
     ORDER BY timer.due_at,timer.id
     LIMIT greatest(1,least(coalesce(p_limit,64),256))
     FOR UPDATE OF timer SKIP LOCKED
  LOOP
    UPDATE private.game_timer_registry
       SET state='processing',attempt_count=attempt_count+1,
           last_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_timer.id;
    BEGIN
      v_result:=NULL;
      CASE v_timer.timer_kind
        WHEN 'dealer_selection_prepare' THEN
          v_result:=private.prepare_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'dealer_selection_complete' THEN
          v_result:=private.complete_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'config_timeout' THEN
          v_result:=private.handle_config_deadline_timeout_exact(
            v_timer.game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            (v_timer.metadata->>'expected_dealer_position')::integer
          );
        WHEN 'ante_phase' THEN
          v_result:=private.advance_ante_phase_exact(
            v_timer.game_id,v_timer.dealer_game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            clock_timestamp()
          );
        WHEN 'holm_decision' THEN
          SELECT * INTO v_player FROM public.players
           WHERE id=v_timer.actor_player_id;
          IF NOT FOUND THEN
            v_result:=jsonb_build_object('outcome','stale_actor');
          ELSE
            IF coalesce(v_player.is_bot,false) THEN
              SELECT coalesce(defaults.bot_fold_probability,30)
                INTO v_fold_probability FROM public.game_defaults defaults
               WHERE defaults.game_type='holm' LIMIT 1;
              v_decision:=CASE WHEN private.secure_random_unit()*100<coalesce(v_fold_probability,30)
                               THEN 'fold' ELSE 'stay' END;
            ELSE
              v_decision:='fold';
            END IF;
            SELECT public.holm_apply_deadline_decision(
              v_timer.game_id,v_timer.round_id,v_player.id,v_decision,
              NOT coalesce(v_player.is_bot,false)
            ) INTO v_result;
          END IF;
        WHEN 'farkle_turn' THEN
          v_result:=private.farkle_advance_due_v1(v_timer.round_id,clock_timestamp());
        WHEN 'horses_scc_turn' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
        WHEN 'horses_scc_terminal' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
          IF v_result->>'status'='tie_waiting_for_client' THEN
            v_result:=private.horses_scc_rollover_abandoned_round(
              v_timer.round_id,clock_timestamp()
            );
          END IF;
        WHEN 'standard_postgame' THEN
          v_result:=private.advance_standard_postgame(
            v_timer.game_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        ELSE
          RAISE EXCEPTION 'advance_due_canonical_game_timers:unknown_kind:%',
            v_timer.timer_kind;
      END CASE;

      IF v_result->>'outcome' IN ('pending','paused','not_prepared','no_eligible_players','deadline_not_expired') THEN
        SELECT * INTO v_game FROM public.games WHERE id=v_timer.game_id;
        UPDATE private.game_timer_registry
           SET state='scheduled',
               due_at=CASE WHEN v_result->>'outcome' IN ('pending','deadline_not_expired')
                 AND v_result->>'deadline' IS NOT NULL
                 THEN (v_result->>'deadline')::timestamptz
                 ELSE clock_timestamp()+interval '1 second' END,
               metadata=CASE WHEN v_timer.timer_kind='ante_phase'
                 AND v_game.ante_decision_deadline IS NOT NULL
                 THEN metadata || jsonb_build_object(
                   'expected_deadline',v_game.ante_decision_deadline
                 ) ELSE metadata END,
               updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      ELSE
        UPDATE private.game_timer_registry
           SET state='completed',completed_at=clock_timestamp(),
               metadata=metadata || jsonb_build_object(
                 'result',coalesce(v_result,'{}'::jsonb)
               ),updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      END IF;
      v_processed:=v_processed+1;
    EXCEPTION WHEN OTHERS THEN
      v_error:=SQLSTATE || ':' || SQLERRM;
      UPDATE private.game_timer_registry
         SET state='scheduled',due_at=clock_timestamp()+interval '5 seconds',
             last_error=v_error,updated_at=clock_timestamp()
       WHERE id=v_timer.id;
      v_failed:=v_failed+1;
    END;
  END LOOP;

  -- Client-created legacy dice rounds used NULL as a bot-delay sentinel.
  -- Convert only the exact active post-cutover actor to a database timestamp;
  -- no historical row is scanned or admitted.
  FOR v_legacy IN
    SELECT round_row.id,round_row.game_id,defaults.bot_decision_delay_seconds
    FROM public.rounds round_row CROSS JOIN public.games game_row
    JOIN public.game_defaults defaults
      ON defaults.game_type=game_row.game_type
    JOIN public.players actor
      ON actor.game_id=game_row.id AND actor.is_bot=true
   WHERE round_row.game_id=game_row.id
     AND game_row.game_type IN ('horses','ship-captain-crew')
     AND game_row.status='in_progress'
     AND NOT coalesce(game_row.is_paused,false)
     AND game_row.current_game_uuid IS NOT DISTINCT FROM round_row.dealer_game_id
     AND round_row.horses_state->>'gamePhase'='playing'
     AND nullif(round_row.horses_state->>'turnDeadline','') IS NULL
     AND actor.id::text=round_row.horses_state->>'currentTurnPlayerId'
     AND EXISTS (
       SELECT 1 FROM private.game_timer_cutover cutover
        WHERE cutover.singleton=true
          AND game_row.timer_generation>0
     )
     AND NOT private.recovery_session_deferred('canonical_timers',game_row.id)
     ORDER BY round_row.id LIMIT 64
  LOOP
    BEGIN
      UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{turnDeadline}',to_jsonb(
        clock_timestamp()+make_interval(secs=>greatest(0.1,coalesce(v_legacy.bot_decision_delay_seconds,2)))),true)
      WHERE id=v_legacy.id;
      PERFORM private.clear_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN jsonb_build_object(
    'outcome',CASE WHEN v_failed=0 THEN 'completed' ELSE 'partial_failure' END,
    'processed',v_processed,'failed',v_failed
  );
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$
;
ALTER FUNCTION private.advance_due_canonical_game_timers(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.advance_due_canonical_game_timers(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.advance_due_canonical_game_timers(integer) TO postgres;
GRANT EXECUTE ON FUNCTION private.advance_due_canonical_game_timers(integer) TO service_role;
DO $verify$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.advance_due_canonical_game_timers(integer)'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('e7c784e3fa2e412d3333ffd2355096f4') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig=ARRAY['search_path=""']::text[] AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false) THEN RAISE EXCEPTION 'farkle_wave2:restoration_metadata_mismatch'; END IF; END $verify$;

SELECT pg_temp.farkle_assert(EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.advance_due_canonical_game_timers(integer)'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('e7c784e3fa2e412d3333ffd2355096f4') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig=ARRAY['search_path=""']::text[] AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false),'recovery 2: definition owner security attributes grants');

SELECT pg_temp.farkle_assert((SELECT count(*)=1 FROM private.farkle_postgame_receipts_v2 WHERE game_id=(SELECT game_id FROM farkle_postgame_history_fixture)),'recovery preserves additive receipt history');
DO $guard$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.advance_due_canonical_game_timers(integer)'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('e7c784e3fa2e412d3333ffd2355096f4','3f60fdfc00de2466dd2f31060892db0d') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig=ARRAY['search_path=""']::text[] AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false) THEN RAISE EXCEPTION 'farkle_wave2:shared_metadata_drift'; END IF; END $guard$;
DO $gate$ BEGIN IF NOT EXISTS(SELECT 1 FROM private.farkle_release WHERE singleton AND NOT creation_enabled AND admin_only AND NOT production_defaults_approved) OR EXISTS(SELECT 1 FROM public.game_defaults WHERE game_type='farkle') THEN RAISE EXCEPTION 'farkle_wave2:release_gate_changed'; END IF; END $gate$;
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

CREATE OR REPLACE FUNCTION private.advance_due_canonical_game_timers(p_limit integer DEFAULT 64)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_timer private.game_timer_registry%ROWTYPE;
  v_legacy record;
  v_result jsonb;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_decision text;
  v_fold_probability numeric;
  v_processed integer:=0;
  v_failed integer:=0;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  FOR v_timer IN
    SELECT timer.*
      FROM private.game_timer_registry timer
      JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE timer.owner_task='canonical_timers'
       AND timer.state='scheduled'
       AND timer.due_at<=clock_timestamp()
       AND NOT coalesce(game_row.is_paused,false)
     ORDER BY timer.due_at,timer.id
     LIMIT greatest(1,least(coalesce(p_limit,64),256))
     FOR UPDATE OF timer SKIP LOCKED
  LOOP
    UPDATE private.game_timer_registry
       SET state='processing',attempt_count=attempt_count+1,
           last_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_timer.id;
    BEGIN
      v_result:=NULL;
      CASE v_timer.timer_kind
        WHEN 'dealer_selection_prepare' THEN
          v_result:=private.prepare_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'dealer_selection_complete' THEN
          v_result:=private.complete_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'config_timeout' THEN
          v_result:=private.handle_config_deadline_timeout_exact(
            v_timer.game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            (v_timer.metadata->>'expected_dealer_position')::integer
          );
        WHEN 'ante_phase' THEN
          v_result:=private.advance_ante_phase_exact(
            v_timer.game_id,v_timer.dealer_game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            clock_timestamp()
          );
        WHEN 'holm_decision' THEN
          SELECT * INTO v_player FROM public.players
           WHERE id=v_timer.actor_player_id;
          IF NOT FOUND THEN
            v_result:=jsonb_build_object('outcome','stale_actor');
          ELSE
            IF coalesce(v_player.is_bot,false) THEN
              SELECT coalesce(defaults.bot_fold_probability,30)
                INTO v_fold_probability FROM public.game_defaults defaults
               WHERE defaults.game_type='holm' LIMIT 1;
              v_decision:=CASE WHEN private.secure_random_unit()*100<coalesce(v_fold_probability,30)
                               THEN 'fold' ELSE 'stay' END;
            ELSE
              v_decision:='fold';
            END IF;
            SELECT public.holm_apply_deadline_decision(
              v_timer.game_id,v_timer.round_id,v_player.id,v_decision,
              NOT coalesce(v_player.is_bot,false)
            ) INTO v_result;
          END IF;
        WHEN 'farkle_postgame' THEN
          v_result:=public.farkle_advance_postgame(
            v_timer.game_id,v_timer.round_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        WHEN 'farkle_turn' THEN
          v_result:=private.farkle_advance_due_v1(v_timer.round_id,clock_timestamp());
        WHEN 'horses_scc_turn' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
        WHEN 'horses_scc_terminal' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
          IF v_result->>'status'='tie_waiting_for_client' THEN
            v_result:=private.horses_scc_rollover_abandoned_round(
              v_timer.round_id,clock_timestamp()
            );
          END IF;
        WHEN 'standard_postgame' THEN
          v_result:=private.advance_standard_postgame(
            v_timer.game_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        ELSE
          RAISE EXCEPTION 'advance_due_canonical_game_timers:unknown_kind:%',
            v_timer.timer_kind;
      END CASE;

      IF v_result->>'outcome' IN ('pending','paused','not_prepared','no_eligible_players','deadline_not_expired') THEN
        SELECT * INTO v_game FROM public.games WHERE id=v_timer.game_id;
        UPDATE private.game_timer_registry
           SET state='scheduled',
               due_at=CASE WHEN v_result->>'outcome' IN ('pending','deadline_not_expired')
                 AND v_result->>'deadline' IS NOT NULL
                 THEN (v_result->>'deadline')::timestamptz
                 ELSE clock_timestamp()+interval '1 second' END,
               metadata=CASE WHEN v_timer.timer_kind='ante_phase'
                 AND v_game.ante_decision_deadline IS NOT NULL
                 THEN metadata || jsonb_build_object(
                   'expected_deadline',v_game.ante_decision_deadline
                 ) ELSE metadata END,
               updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      ELSE
        UPDATE private.game_timer_registry
           SET state='completed',completed_at=clock_timestamp(),
               metadata=metadata || jsonb_build_object(
                 'result',coalesce(v_result,'{}'::jsonb)
               ),updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      END IF;
      v_processed:=v_processed+1;
    EXCEPTION WHEN OTHERS THEN
      v_error:=SQLSTATE || ':' || SQLERRM;
      UPDATE private.game_timer_registry
         SET state='scheduled',due_at=clock_timestamp()+interval '5 seconds',
             last_error=v_error,updated_at=clock_timestamp()
       WHERE id=v_timer.id;
      v_failed:=v_failed+1;
    END;
  END LOOP;

  -- Client-created legacy dice rounds used NULL as a bot-delay sentinel.
  -- Convert only the exact active post-cutover actor to a database timestamp;
  -- no historical row is scanned or admitted.
  FOR v_legacy IN
    SELECT round_row.id,round_row.game_id,defaults.bot_decision_delay_seconds
    FROM public.rounds round_row CROSS JOIN public.games game_row
    JOIN public.game_defaults defaults
      ON defaults.game_type=game_row.game_type
    JOIN public.players actor
      ON actor.game_id=game_row.id AND actor.is_bot=true
   WHERE round_row.game_id=game_row.id
     AND game_row.game_type IN ('horses','ship-captain-crew')
     AND game_row.status='in_progress'
     AND NOT coalesce(game_row.is_paused,false)
     AND game_row.current_game_uuid IS NOT DISTINCT FROM round_row.dealer_game_id
     AND round_row.horses_state->>'gamePhase'='playing'
     AND nullif(round_row.horses_state->>'turnDeadline','') IS NULL
     AND actor.id::text=round_row.horses_state->>'currentTurnPlayerId'
     AND EXISTS (
       SELECT 1 FROM private.game_timer_cutover cutover
        WHERE cutover.singleton=true
          AND game_row.timer_generation>0
     )
     AND NOT private.recovery_session_deferred('canonical_timers',game_row.id)
     ORDER BY round_row.id LIMIT 64
  LOOP
    BEGIN
      UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{turnDeadline}',to_jsonb(
        clock_timestamp()+make_interval(secs=>greatest(0.1,coalesce(v_legacy.bot_decision_delay_seconds,2)))),true)
      WHERE id=v_legacy.id;
      PERFORM private.clear_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN jsonb_build_object(
    'outcome',CASE WHEN v_failed=0 THEN 'completed' ELSE 'partial_failure' END,
    'processed',v_processed,'failed',v_failed
  );
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$
;

SELECT pg_temp.farkle_assert(EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.advance_due_canonical_game_timers(integer)'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('3f60fdfc00de2466dd2f31060892db0d') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig=ARRAY['search_path=""']::text[] AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false),'final candidate: definition owner security attributes grants');

SELECT pg_temp.farkle_postgame_cleanup();
DO $gate$ BEGIN IF NOT EXISTS(SELECT 1 FROM private.farkle_release WHERE singleton AND NOT creation_enabled AND admin_only AND NOT production_defaults_approved) OR EXISTS(SELECT 1 FROM public.game_defaults WHERE game_type='farkle') THEN RAISE EXCEPTION 'farkle_wave2:release_gate_changed'; END IF; END $gate$;

SELECT jsonb_build_object('passed',true,'assertions',(SELECT count(*) FROM farkle_proof_log),'cases',(SELECT jsonb_agg(case_name ORDER BY case_name) FROM farkle_proof_log)) AS proof;
ROLLBACK;
