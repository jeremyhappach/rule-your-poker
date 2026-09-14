CREATE OR REPLACE FUNCTION private.replay_gin_rule_proof_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $fn$
DECLARE f jsonb;mode text;bot boolean;state jsonb;result jsonb;g public.games;r public.rounds;actor uuid;card jsonb;meld jsonb;mi integer;
 exports jsonb:='[]';pack jsonb;again jsonb;viewer text;pub boolean;n bigint;checks jsonb:='[]';participant public.players;
BEGIN
 BEGIN
  FOREACH mode IN ARRAY ARRAY['normal_knock_layoff','undercut','gin','bot','postgame','request_end','dealer_selection'] LOOP
   bot:=mode='bot';
   f:=private.replay_gin_rule_prepare(CASE WHEN mode IN ('postgame','request_end','dealer_selection') THEN 'postgame_terminal' ELSE 'scoring' END,
    CASE WHEN mode IN ('postgame','request_end','bot','dealer_selection') THEN 'normal_knock_layoff' ELSE mode END,bot);
   SELECT * INTO g FROM public.games WHERE id=(f->>'game')::uuid;
   SELECT * INTO r FROM public.rounds WHERE id=(f->>'round')::uuid;
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->'users'->>1,'role','authenticated')::text,true);
   IF mode='gin' THEN
    PERFORM public.gin_rummy_apply_action(r.id,(f->'players'->>1)::uuid,'pass_first_draw',NULL,NULL,0);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->'users'->>0,'role','authenticated')::text,true);
    PERFORM public.gin_rummy_apply_action(r.id,(f->'players'->>0)::uuid,'take_first_draw',NULL,NULL,1);
    PERFORM public.gin_rummy_apply_action(r.id,(f->'players'->>0)::uuid,'knock',private.gin_card('K',chr(9827)),NULL,2);
    SELECT gr.state INTO state FROM private.gin_rummy_round_states gr WHERE round_id=r.id;
    IF state->>'phase'<>'scoring' THEN RAISE EXCEPTION 'proof:gin_not_scoring'; END IF;
    PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
    PERFORM private.gin_apply_action_core(r.id,(f->'players'->>0)::uuid,'finalize_scoring',NULL,NULL,3);
   ELSE
    IF bot THEN
     PERFORM private.gin_apply_action_core(r.id,(f->'players'->>1)::uuid,'take_first_draw',NULL,NULL,0);
     PERFORM private.gin_apply_bot_action(r.id);
    ELSE
     PERFORM public.gin_rummy_apply_action(r.id,(f->'players'->>1)::uuid,'take_first_draw',NULL,NULL,0);
     PERFORM public.gin_rummy_apply_action(r.id,(f->'players'->>1)::uuid,'knock',private.gin_card('K',chr(9829)),NULL,1);
    END IF;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->'users'->>0,'role','authenticated')::text,true);
    IF mode='request_end' THEN
     result:=public.request_session_end(g.id,g.current_game_uuid,g.timer_generation);
     IF (SELECT pending_session_end FROM public.games WHERE id=g.id) IS NOT TRUE THEN RAISE EXCEPTION 'proof:request_end:%',result; END IF;
    END IF;
    SELECT gr.state INTO state FROM private.gin_rummy_round_states gr WHERE round_id=r.id;
    IF mode IN ('normal_knock_layoff','undercut') THEN
     card:=private.gin_card('2',chr(9830));mi:=0;
     FOR meld IN SELECT value FROM jsonb_array_elements(state->'playerStates'->(f->'players'->>1)->'melds') LOOP
      EXIT WHEN private.gin_can_lay_off(card,meld);mi:=mi+1;
     END LOOP;
     PERFORM public.gin_rummy_apply_action(r.id,(f->'players'->>0)::uuid,'lay_off',card,mi,(state->>'actionCount')::bigint);
     SELECT gr.state INTO state FROM private.gin_rummy_round_states gr WHERE round_id=r.id;
    END IF;
    PERFORM public.gin_rummy_apply_action(r.id,(f->'players'->>0)::uuid,'finish_lay_off',NULL,NULL,(state->>'actionCount')::bigint);
   END IF;
   SELECT gr.state INTO state FROM private.gin_rummy_round_states gr WHERE round_id=r.id;
   IF state->>'phase'<>'complete' THEN RAISE EXCEPTION 'proof:rule_not_terminal:%',mode; END IF;
   IF mode='undercut' AND (state #>> '{knockResult,isUndercut}')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'proof:undercut_missing'; END IF;
   IF mode='gin' AND (state #>> '{knockResult,isGin}')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'proof:gin_missing'; END IF;
   IF mode='bot' AND NOT EXISTS(SELECT 1 FROM private.replay_steps s CROSS JOIN LATERAL jsonb_array_elements(s.body->'substeps') sub WHERE s.session_id=g.id AND sub->>'origin'='bot') THEN RAISE EXCEPTION 'proof:bot_origin'; END IF;
   IF mode IN ('postgame','dealer_selection') THEN
    result:=public.gin_rummy_advance_postgame(g.id,r.id,r.dealer_game_id,r.hand_number);
    IF result->>'outcome'<>'advanced' THEN RAISE EXCEPTION 'proof:postgame:%',result; END IF;
    SELECT count(*) INTO n FROM private.replay_steps WHERE session_id=g.id;
    result:=public.gin_rummy_advance_postgame(g.id,r.id,r.dealer_game_id,r.hand_number);
    IF result->>'outcome'<>'already_advanced' OR n<>(SELECT count(*) FROM private.replay_steps WHERE session_id=g.id) THEN RAISE EXCEPTION 'proof:postgame_duplicate'; END IF;
    IF mode='dealer_selection' THEN
     PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->'users'->>1,'role','authenticated')::text,true);
     SELECT * INTO participant FROM public.players WHERE id=(f->'players'->>1)::uuid;
     result:=public.session_leave(g.id,participant.id,participant.participation_version);
     SELECT * INTO g FROM public.games WHERE id=g.id;
     IF g.status<>'waiting' THEN RAISE EXCEPTION 'proof:departure_waiting:%:%',g.status,result; END IF;
     SELECT * INTO participant FROM public.players WHERE id=participant.id;
     result:=public.session_take_seat(g.id,2,participant.id,participant.participation_version);
     PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->'users'->>0,'role','authenticated')::text,true);
     result:=public.begin_session_dealer_selection(g.id);
     IF result->>'outcome'<>'started' THEN RAISE EXCEPTION 'proof:dealer_begin:%',result; END IF;
     SELECT * INTO g FROM public.games WHERE id=g.id;
     INSERT INTO public.system_settings(key,value) VALUES('session_dealer_draw_tie_harness',jsonb_build_object('armed',false))
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;
     result:=private.prepare_session_dealer_selection(g.id,g.timer_generation);
     IF result->>'outcome'<>'prepared' THEN RAISE EXCEPTION 'proof:dealer_prepare:%',result; END IF;
     -- A real authoritative 3-second presentation deadline, never a fabricated event.
     PERFORM pg_sleep(3.05);
     result:=public.advance_session_dealer_selection(g.id);
     IF result->>'outcome'<>'advanced' THEN RAISE EXCEPTION 'proof:dealer_complete:%',result; END IF;
    END IF;
   END IF;
   FOR viewer IN SELECT value FROM jsonb_array_elements_text(f->'users') LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',viewer,'role','authenticated')::text,true);
    FOREACH pub IN ARRAY ARRAY[true,false] LOOP
     pack:=public.export_gin_replay_v1(g.id,r.id,pub);
     exports:=exports||jsonb_build_array(jsonb_build_object('category',mode,'package',pack));
    END LOOP;
   END LOOP;
   DELETE FROM public.games WHERE id=g.id;
   again:=public.export_gin_replay_v1(g.id,r.id,false);
   IF again IS DISTINCT FROM pack THEN RAISE EXCEPTION 'proof:rule_live_dependency'; END IF;
   checks:=checks||jsonb_build_array(mode);
  END LOOP;
  RAISE EXCEPTION USING ERRCODE='ZP004',MESSAGE='rollback_rule_proof';
 EXCEPTION WHEN SQLSTATE 'ZP004' THEN NULL;
 END;
 RETURN jsonb_build_object('exports',exports,'ruleChecks',checks,'fixturesRolledBack',true,'liveRowsRemovedDuringProof',true);
END;
$fn$;
REVOKE ALL ON FUNCTION private.replay_gin_rule_proof_v1() FROM PUBLIC,anon,authenticated,service_role;
