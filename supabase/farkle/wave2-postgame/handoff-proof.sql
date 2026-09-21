-- Full handoff under real database roles; no shared-owner extension.
CREATE FUNCTION pg_temp.farkle_human_write(f jsonb,kind text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $p$
DECLARE prior_role text:=current_setting('role'); count_rows integer:=0; error_code text; tested_role text;
BEGIN
 PERFORM set_config('role','authenticated',true);
 tested_role:=current_user;
 BEGIN
  CASE kind
   WHEN 'chips' THEN UPDATE public.players SET chips=chips+1 WHERE id=(f->>'a')::uuid;
   WHEN 'pot' THEN UPDATE public.games SET pot=pot+1 WHERE id=(f->>'game')::uuid;
   WHEN 'status' THEN UPDATE public.games SET status='in_progress' WHERE id=(f->>'game')::uuid;
   WHEN 'round' THEN UPDATE public.rounds SET farkle_state=jsonb_set(farkle_state,'{thisTurn}','999') WHERE id=(f->>'round')::uuid;
   WHEN 'config' THEN UPDATE public.dealer_games SET config=jsonb_set(config,'{ante_amount}','999') WHERE id=(f->>'dealer')::uuid;
   WHEN 'generic_rpc' THEN PERFORM public.increment_player_chips((f->>'a')::uuid,1);
  END CASE;
  GET DIAGNOSTICS count_rows=ROW_COUNT;
 EXCEPTION WHEN OTHERS THEN error_code:=SQLSTATE;
 END;
 PERFORM set_config('role',prior_role,true);
 RETURN jsonb_build_object('role',tested_role,'rows',count_rows,'error',error_code);
EXCEPTION WHEN OTHERS THEN PERFORM set_config('role',prior_role,true); RAISE;
END $p$;
DO $p$
DECLARE f jsonb; g uuid; d uuid; r uuid; p uuid; ans jsonb; duplicate jsonb; before_game jsonb;
 frozen jsonb; state_before jsonb; balances jsonb; kind text; phase text; deadline timestamptz; next_deadline timestamptz;
 version bigint; denied boolean; result_count integer; replay_before jsonb;
BEGIN
 UPDATE public.system_settings SET value=jsonb_build_object('enabled',false) WHERE key='make_it_take_it';
 f:=pg_temp.farkle_postgame_fixture(); g:=(f->>'game')::uuid; d:=(f->>'dealer')::uuid; r:=(f->>'round')::uuid;
 PERFORM pg_temp.farkle_postgame_bank(f);
 PERFORM pg_temp.farkle_assert((SELECT game_type='farkle' AND status='game_over' FROM public.games WHERE id=g),'handoff retains Farkle through terminal settlement');
 SELECT config INTO frozen FROM public.dealer_games WHERE id=d;
 SELECT farkle_state INTO state_before FROM public.rounds WHERE id=r;
 SELECT jsonb_object_agg(id,chips) INTO balances FROM public.players WHERE game_id=g;
 replay_before:=public.farkle_read_replay(r);
 ans:=public.farkle_advance_postgame(g,r,d,1);
 PERFORM pg_temp.farkle_assert(ans->>'status'='game_selection' AND (SELECT game_type IS NULL AND current_game_uuid IS NULL AND NOT config_complete FROM public.games WHERE id=g),'handoff admits canonical neutral setup');
 FOR phase IN SELECT unnest(ARRAY['setup','after_timeout']) LOOP
  PERFORM pg_temp.farkle_identity((f->>'admin')::uuid);
  FOREACH kind IN ARRAY ARRAY['chips','pot','status','round','config','generic_rpc'] LOOP
   ans:=pg_temp.farkle_human_write(f,kind);
   PERFORM pg_temp.farkle_assert(ans->>'role'='authenticated' AND (ans->>'rows')::integer=0,
    'handoff authenticated write rejected '||phase||' '||kind);
  END LOOP;
  -- A generic future definer still cannot modify the retired Farkle artifact.
  denied:=false;
  BEGIN PERFORM pg_temp.farkle_generic_definer(g,r,(f->>'a')::uuid,d,'round');
  EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:authority_claim_required'; END;
  PERFORM pg_temp.farkle_assert(denied,'handoff generic definer cannot edit Farkle history '||phase);
  IF phase='setup' THEN
   -- Expire only this synthetic setup timer. The canonical owner still validates
   -- the exact captured deadline/dealer and performs every resulting write.
   deadline:=clock_timestamp()-interval '1 second';
   UPDATE public.games SET config_deadline=deadline WHERE id=g;
   PERFORM set_config('app.farkle_authority','',true);
   SELECT to_jsonb(x) INTO before_game FROM public.games x WHERE id=g;
   PERFORM set_config('request.jwt.claim.role','service_role',true);
   PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
   ans:=private.handle_config_deadline_timeout_exact(g,deadline-interval '1 second',3);
   PERFORM pg_temp.farkle_assert(ans->>'reason'='stale-deadline' AND (SELECT to_jsonb(x)=before_game FROM public.games x WHERE id=g),'handoff stale timeout is read only');
   -- Drive the actual scheduled dispatch, limiting execution to this exact timer.
   PERFORM pg_temp.farkle_assert(NOT EXISTS(SELECT 1 FROM public.rounds rr JOIN public.games gg ON gg.id=rr.game_id
    WHERE gg.game_type IN ('horses','ship-captain-crew') AND gg.status='in_progress' AND gg.current_game_uuid=rr.dealer_game_id
    AND rr.horses_state->>'gamePhase'='playing' AND nullif(rr.horses_state->>'turnDeadline','') IS NULL),'handoff recovery has no unrelated legacy actor writes');
   UPDATE private.game_timer_registry SET due_at='-infinity' WHERE game_id=g AND timer_kind='config_timeout' AND state='scheduled';
   PERFORM private.advance_due_canonical_game_timers(1);
   PERFORM pg_temp.farkle_assert(EXISTS(SELECT 1 FROM private.game_timer_registry WHERE game_id=g AND timer_kind='config_timeout'
    AND metadata->'result'->>'outcome'='rotated') AND (SELECT game_type IS NULL AND status='game_selection' AND dealer_position=4 FROM public.games WHERE id=g)
    AND (SELECT sitting_out FROM public.players WHERE id=(f->>'b')::uuid),'handoff complete chain uses canonical setup timeout authority');
   SELECT config_deadline,to_jsonb(x) INTO next_deadline,before_game FROM public.games x WHERE id=g;
   ans:=private.handle_config_deadline_timeout_exact(g,deadline,3);
   PERFORM pg_temp.farkle_assert(ans->>'outcome'='suppressed' AND (SELECT to_jsonb(x)=before_game FROM public.games x WHERE id=g),'handoff duplicate timeout cannot rotate again');
   ans:=private.handle_config_deadline_timeout_exact(g,next_deadline,3);
   PERFORM pg_temp.farkle_assert(ans->>'reason'='stale-dealer' AND (SELECT to_jsonb(x)=before_game FROM public.games x WHERE id=g),'handoff stale dealer timeout cannot cross identity');
   duplicate:=public.farkle_advance_postgame(g,r,d,1);
   PERFORM pg_temp.farkle_assert(duplicate->>'outcome'='already_advanced' AND (SELECT to_jsonb(x)=before_game FROM public.games x WHERE id=g),'handoff duplicate continuation after timeout is harmless');
   denied:=false; BEGIN PERFORM public.farkle_advance_postgame(g,r,gen_random_uuid(),1); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle_postgame:round_identity_mismatch'; END;
   PERFORM pg_temp.farkle_assert(denied AND (SELECT to_jsonb(x)=before_game FROM public.games x WHERE id=g),'handoff stale continuation cannot cross identity');
  END IF;
 END LOOP;
 PERFORM pg_temp.farkle_assert((SELECT jsonb_object_agg(id,chips) FROM public.players WHERE game_id=g)=balances
  AND (SELECT farkle_state=state_before FROM public.rounds WHERE id=r) AND (SELECT config=frozen FROM public.dealer_games WHERE id=d)
  AND public.farkle_read_replay(r)=replay_before,'handoff timeout preserves balances scores config and semantic replay');
 -- The next dealer is the admin: Run Back resolves the immutable prior snapshot.
 UPDATE private.farkle_release SET creation_enabled=true WHERE singleton;
 ans:=public.configure_dealer_game(g,(f->>'a')::uuid,4,'farkle',jsonb_build_object('ante_amount',7,'runBackDealerGameId',d),next_deadline);
 UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
 PERFORM pg_temp.farkle_assert(ans->>'outcome'='configured' AND (SELECT config=frozen FROM public.dealer_games WHERE id=(ans->'dealer_game'->>'id')::uuid)
  AND (SELECT game_type='farkle' AND status='ante_decision' FROM public.games WHERE id=g),'handoff Run Back restores Farkle from frozen snapshot');
 PERFORM set_config('app.farkle_authority','',true);
 denied:=false; BEGIN PERFORM pg_temp.farkle_generic_definer(g,r,(f->>'a')::uuid,d,'player'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'handoff next Farkle setup reinstates exact player write guard');
 PERFORM private.farkle_claim_v1(g,d,NULL,'cleanup'); DELETE FROM public.games WHERE id=g;
 PERFORM set_config('app.farkle_authority','',true);
 PERFORM pg_temp.farkle_assert(NOT EXISTS(SELECT 1 FROM public.rounds WHERE game_id=g)
  AND NOT EXISTS(SELECT 1 FROM private.farkle_postgame_receipts_v2 WHERE game_id=g),'handoff fixture cleanup');
END $p$;
