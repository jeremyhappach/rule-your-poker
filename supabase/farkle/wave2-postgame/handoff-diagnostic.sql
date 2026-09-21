-- Historical diagnostic of 433afeb4d, not a migration or the final acceptance proof.
-- The generic helper probe runs as database owner; final client-role negatives
-- live in handoff-proof.sql and the complete rollback-proof.sql.
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

-- Diagnostic only, not a migration. Caller wraps candidate + fixture helpers +
-- this file in BEGIN/ROLLBACK. No production state persists.
CREATE TEMP TABLE farkle_handoff_diagnostic(mode text, facts jsonb);
DO $p$
DECLARE mode text; f jsonb; g uuid; d uuid; r uuid; deadline timestamptz;
 timeout_answer jsonb; timeout_error text; generic_error text; generic_wrote boolean;
 before_chips integer; original_game jsonb; after_game jsonb; duplicate jsonb;
BEGIN
 UPDATE public.system_settings SET value=jsonb_build_object('enabled',false) WHERE key='make_it_take_it';
 FOREACH mode IN ARRAY ARRAY['retained_farkle','neutral_setup'] LOOP
  f:=pg_temp.farkle_postgame_fixture(); g:=(f->>'game')::uuid; d:=(f->>'dealer')::uuid; r:=(f->>'round')::uuid;
  PERFORM pg_temp.farkle_postgame_bank(f);
  PERFORM public.farkle_advance_postgame(g,r,d,1);
  PERFORM private.farkle_claim_v1(g,d,NULL,'cleanup');
  -- Simulates only the isolated owner's proposed neutral setup assignment.
  -- No guard or deployed shared function is changed by this diagnostic.
  IF mode='neutral_setup' THEN UPDATE public.games SET game_type=NULL WHERE id=g; END IF;
  deadline:=clock_timestamp()-interval '1 second';
  UPDATE public.games SET config_deadline=deadline WHERE id=g;
  PERFORM set_config('app.farkle_authority','',true);
  PERFORM pg_temp.farkle_identity((f->>'peer')::uuid);
  SELECT chips INTO before_chips FROM public.players WHERE id=(f->>'b')::uuid;
  generic_wrote:=false; generic_error:=NULL;
  BEGIN
   PERFORM public.increment_player_chips((f->>'b')::uuid,1);
   SELECT chips<>before_chips INTO generic_wrote FROM public.players WHERE id=(f->>'b')::uuid;
   RAISE EXCEPTION 'diagnostic:undo_generic_probe';
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'diagnostic:undo_generic_probe' THEN generic_error:=SQLSTATE||':'||SQLERRM; END IF;
  END;
  SELECT to_jsonb(x) INTO original_game FROM public.games x WHERE id=g;
  timeout_answer:=NULL; timeout_error:=NULL;
  BEGIN
   timeout_answer:=private.handle_config_deadline_timeout_exact(g,deadline,3);
  EXCEPTION WHEN OTHERS THEN timeout_error:=SQLSTATE||':'||SQLERRM;
  END;
  SELECT to_jsonb(x) INTO after_game FROM public.games x WHERE id=g;
  duplicate:=public.farkle_advance_postgame(g,r,d,1);
  INSERT INTO farkle_handoff_diagnostic VALUES(mode,jsonb_build_object(
   'generic_rpc_authenticated_execute',has_function_privilege('authenticated','public.increment_player_chips(uuid,integer)','EXECUTE'),
   'generic_chip_write_succeeded',generic_wrote,'generic_error',generic_error,
   'timeout_result',timeout_answer,'timeout_error',timeout_error,
   'resulting_status',after_game->'status','resulting_game_type',after_game->'game_type',
   'failed_timeout_unchanged',CASE WHEN timeout_error IS NOT NULL THEN after_game=original_game ELSE NULL END,
   'continuation_duplicate',duplicate->>'outcome',
   'duplicate_unchanged',(SELECT to_jsonb(x)=after_game FROM public.games x WHERE id=g),
   'authority_claim_restored',coalesce(current_setting('app.farkle_authority',true),'')=''));
  PERFORM private.farkle_claim_v1(g,d,NULL,'cleanup'); DELETE FROM public.games WHERE id=g;
  PERFORM set_config('app.farkle_authority','',true);
 END LOOP;
END $p$;
SELECT jsonb_build_object('diagnostic',jsonb_object_agg(mode,facts),
 'release',(SELECT to_jsonb(r) FROM private.farkle_release r),
 'fixture_count',(SELECT count(*) FROM public.games WHERE name='TEST ONLY: Wave2 postgame rollback')) AS evidence
FROM farkle_handoff_diagnostic;

ROLLBACK;
