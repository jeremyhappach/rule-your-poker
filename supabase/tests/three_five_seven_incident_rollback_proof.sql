-- Incident regression: actual financial triggers, both money modes, no retained fixtures.
BEGIN;
-- This enables ONLY this transaction's synthetic real-money fixtures; ROLLBACK restores closure.
UPDATE private.three_five_seven_release SET real_money_admission_enabled=true WHERE singleton;
CREATE FUNCTION pg_temp.incident_fail_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('app.incident_fail_snapshot',true)='on' THEN
  RAISE EXCEPTION 'incident357:injected_snapshot_failure';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER incident357_fail_snapshot BEFORE INSERT ON public.session_player_snapshots
 FOR EACH ROW EXECUTE FUNCTION pg_temp.incident_fail_snapshot();

DO $proof$
DECLARE
 users uuid[]; g uuid; d uuid; r uuid; next_d uuid; next_r uuid;
 p uuid[]; v jsonb; before_state jsonb; after_state jsonb; frame jsonb;
 real_mode boolean; winner_legs integer; reserve integer; cursor_before bigint;
 payout integer; version_before bigint; failed boolean; reasons text[];
BEGIN
 SELECT array_agg(id ORDER BY created_at,id) INTO users FROM (
  SELECT p.id,p.created_at FROM public.profiles p
  WHERE EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p.id)
    AND NOT public.has_role(p.id,'admin'::public.app_role)
  ORDER BY p.created_at,p.id LIMIT 4
 ) eligible;
 IF cardinality(users)<4 THEN RAISE EXCEPTION 'incident357:needs_four_nonadmin_profiles'; END IF;
 FOREACH real_mode IN ARRAY ARRAY[false,true] LOOP
 FOR winner_legs IN 0..2 LOOP
  g:=gen_random_uuid(); d:=gen_random_uuid(); next_d:=gen_random_uuid();
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',users[1])::text,true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_test_no_sweep','on',true);
  INSERT INTO public.games(id,name,status,game_type,current_game_uuid,current_host,dealer_position,
   ante_amount,rollover_amount,leg_value,legs_to_win,total_hands,pot,real_money)
  VALUES(g,'Rollback 357 incident qualification','ante_decision','3-5-7',d,users[1],1,6,1,2,3,0,0,real_mode);
  INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type)VALUES(d,g,users[1],'3-5-7');
  INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision)
  SELECT g,users[i],i,100,'active',false,false,'ante_up' FROM generate_series(1,3)i;
  INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot)
  VALUES(g,users[4],NULL,0,'active',true,false);
  SELECT array_agg(id ORDER BY position) INTO p FROM public.players WHERE game_id=g AND position IS NOT NULL;
  BEGIN
   UPDATE public.games SET ante_amount=-1 WHERE id=g;
   PERFORM public.three_five_seven_begin_game(g);
   RAISE EXCEPTION 'incident357:negative_ante_accepted';
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE '%invalid_ante%' THEN RAISE; END IF;
  END;
  IF (SELECT pot FROM public.games WHERE id=g)<>0
   OR EXISTS(SELECT 1 FROM public.players WHERE game_id=g AND position IS NOT NULL AND chips<>100)
   THEN RAISE EXCEPTION 'incident357:rejected_ante_changed_money'; END IF;
  SET LOCAL ROLE authenticated;
  BEGIN
   PERFORM public.three_five_seven_settle_game_authority_impl(g,gen_random_uuid(),d,1);
   RAISE EXCEPTION 'incident357:browser_bypassed_settlement_owner';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  v:=public.three_five_seven_begin_game(g); r:=(v->>'round_id')::uuid;
  IF (SELECT pot FROM public.games WHERE id=g)<>18 THEN RAISE EXCEPTION 'incident357:opening_ante'; END IF;
  -- Fund the purchased reserve explicitly in the synthetic fixture. No financial trigger is bypassed.
  PERFORM set_config('ptown.chip_transfer_reason','leg',true);
  UPDATE public.players SET legs=CASE WHEN id=p[1] THEN winner_legs WHEN id=p[2] AND winner_legs>0 THEN 1 ELSE 0 END,
   chips=chips-2*CASE WHEN id=p[1] THEN winner_legs WHEN id=p[2] AND winner_legs>0 THEN 1 ELSE 0 END
   WHERE game_id=g AND position IS NOT NULL;
  reserve:=2*(winner_legs+CASE WHEN winner_legs>0 THEN 1 ELSE 0 END); payout:=18+reserve;
  UPDATE public.player_cards SET cards=CASE WHEN player_id=p[1]
   THEN '[{"rank":"3","suit":"♠"},{"rank":"5","suit":"♥"},{"rank":"7","suit":"♦"}]'::jsonb
   ELSE '[{"rank":"2","suit":"♣"},{"rank":"4","suit":"♦"},{"rank":"6","suit":"♥"}]'::jsonb END,
   is_public=false WHERE round_id=r;
  IF winner_legs>0 THEN
    SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE;
    SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED;
  END IF;
  SELECT chip_transfer_cursor INTO cursor_before FROM public.games WHERE id=g;
  SELECT jsonb_build_object('game',to_jsonb(x),'players',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.players a WHERE game_id=g))
   INTO before_state FROM public.games x WHERE id=g;
  PERFORM set_config('app.three_five_seven_test_no_sweep','off',true);
  -- Failure after chip changes but before final snapshots rolls back result, money, publication, and resolution.
  PERFORM set_config('app.incident_fail_snapshot','on',true);
  failed:=false;
  BEGIN
   PERFORM private.three_five_seven_settle_instant_sweep(g,r,d,1);
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'incident357:injected_snapshot_failure' THEN RAISE; END IF;
   failed:=true;
  END;
  PERFORM set_config('app.incident_fail_snapshot','off',true);
  SELECT jsonb_build_object('game',to_jsonb(x),'players',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.players a WHERE game_id=g))
   INTO after_state FROM public.games x WHERE id=g;
  IF NOT failed OR before_state IS DISTINCT FROM after_state
   OR EXISTS(SELECT 1 FROM public.game_results WHERE game_id=g AND settlement_key='three_five_seven_terminal')
   OR EXISTS(SELECT 1 FROM private.three_five_seven_round_resolutions WHERE game_id=g)
   OR EXISTS(SELECT 1 FROM public.player_cards WHERE round_id=r AND is_public)
   THEN RAISE EXCEPTION 'incident357:partial_settlement:failed=% same=% results=% resolutions=% public=%',failed,before_state IS NOT DISTINCT FROM after_state,(SELECT count(*) FROM public.game_results WHERE game_id=g AND settlement_key='three_five_seven_terminal'),(SELECT count(*) FROM private.three_five_seven_round_resolutions WHERE game_id=g),(SELECT count(*) FROM public.player_cards WHERE round_id=r AND is_public); END IF;
  v:=private.three_five_seven_settle_instant_sweep(g,r,d,1);
  SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE;
  SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED;
  IF (v#>>'{settlement,payout_amount}')::integer<>payout
   OR (SELECT sum(chips) FROM public.players WHERE game_id=g)<>300
   OR (SELECT pot FROM public.games WHERE id=g)<>0
   OR (SELECT chips FROM public.players WHERE id=p[1])<>94-2*winner_legs+payout
   OR EXISTS(SELECT 1 FROM public.players WHERE game_id=g AND legs<>0)
   OR (SELECT count(*) FROM public.game_results WHERE game_id=g AND pot_won=payout)<>1
   OR EXISTS(SELECT 1 FROM public.session_player_snapshots s JOIN public.players a ON a.id=s.player_id WHERE s.game_id=g AND s.chips<>a.chips)
   THEN RAISE EXCEPTION 'incident357:funded_payout_failed:real=% legs=% receipt=%',real_mode,winner_legs,v; END IF;
  SELECT array_agg(reason ORDER BY cursor) INTO reasons FROM public.gameplay_transfer_batches WHERE game_id=g AND cursor>cursor_before;
  IF reasons IS DISTINCT FROM (CASE WHEN reserve>0 THEN ARRAY['sweep','transfer'] ELSE ARRAY['transfer'] END)
   THEN RAISE EXCEPTION 'incident357:payout_batch_reasons:legs=% reserve=% reasons=% rows=%',winner_legs,reserve,reasons,(SELECT jsonb_agg(to_jsonb(b)) FROM public.gameplay_transfer_batches b WHERE game_id=g AND cursor>cursor_before); END IF;
  IF EXISTS(SELECT 1 FROM public.gameplay_transfer_batches b WHERE b.game_id=g AND b.cursor>cursor_before
   AND (SELECT sum(value::numeric) FROM jsonb_each_text(b.closing_balances))-
       (SELECT sum(value::numeric) FROM jsonb_each_text(b.opening_balances))
       <> CASE WHEN b.reason='sweep' THEN reserve ELSE 0 END)
   THEN RAISE EXCEPTION 'incident357:unfunded_batch'; END IF;
  -- Peers and observers see only the winning proof, never another private hand.
  FOREACH version_before IN ARRAY ARRAY[2,4]::bigint[] LOOP
   PERFORM set_config('request.jwt.claim.sub',users[version_before]::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',users[version_before])::text,true);
   SET LOCAL ROLE authenticated;
   frame:=public.three_five_seven_current_frame(g);
   RESET ROLE;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(frame->'player_cards') c WHERE c->>'player_id'=p[1]::text AND jsonb_array_length(c->'cards')=3)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(frame->'player_cards') c WHERE c->>'player_id'=p[3]::text)
    THEN RAISE EXCEPTION 'incident357:proof_visibility:%',frame->'player_cards'; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',users[1])::text,true);
  v:=public.three_five_seven_settle_game(g,r,d,1);
  IF v->>'status'<>'already_settled' THEN RAISE EXCEPTION 'incident357:duplicate_settlement'; END IF;
  -- Recovery with zero connected clients uses the complete installed scheduler and exact synthetic scope.
  UPDATE private.three_five_seven_round_resolutions SET presentation_fallback_at=clock_timestamp()-interval '1 second' WHERE game_id=g;
  PERFORM set_config('app.three_five_seven_recovery_game_id',g::text,true);
  v:=private.advance_due_three_five_seven_state();
  PERFORM set_config('app.three_five_seven_recovery_game_id','',true);
  IF (SELECT status FROM public.games WHERE id=g)<>'game_selection'
   THEN RAISE EXCEPTION 'incident357:zero_client_postgame:%/%',v,(SELECT jsonb_agg(to_jsonb(f)) FROM private.game_recovery_unit_failures f WHERE game_id=g); END IF;
  v:=public.three_five_seven_advance_postgame(g,r,d,1);
  IF v->>'outcome'<>'already_advanced' THEN RAISE EXCEPTION 'incident357:postgame_duplicate'; END IF;
  -- New dealer game gets exactly one three-player ante and a real new deal.
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.games SET current_game_uuid=next_d,status='ante_decision',ante_amount=3 WHERE id=g;
  INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type)VALUES(next_d,g,users[1],'3-5-7');
  UPDATE public.players SET ante_decision='ante_up' WHERE game_id=g AND position IS NOT NULL;
  PERFORM set_config('app.three_five_seven_test_no_sweep','on',true);
  v:=public.three_five_seven_begin_game(g); next_r:=(v->>'round_id')::uuid;
  PERFORM public.three_five_seven_begin_game(g);
  SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE;
  SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED;
  IF next_r=r OR (SELECT pot FROM public.games WHERE id=g)<>9
   OR (SELECT count(*) FROM public.player_cards WHERE round_id=next_r)<>3
   OR (SELECT count(*) FROM public.gameplay_transfer_batches WHERE dealer_game_id=next_d AND reason='ante')<>1
   THEN RAISE EXCEPTION 'incident357:runback'; END IF;
  SELECT jsonb_build_object('game',to_jsonb(x),'players',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.players a WHERE game_id=g))
   INTO before_state FROM public.games x WHERE id=g;
  PERFORM public.three_five_seven_settle_game(g,r,d,1);
  PERFORM public.three_five_seven_advance_postgame(g,r,d,1);
  SELECT jsonb_build_object('game',to_jsonb(x),'players',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.players a WHERE game_id=g))
   INTO after_state FROM public.games x WHERE id=g;
  IF before_state IS DISTINCT FROM after_state THEN RAISE EXCEPTION 'incident357:late_replay_changed_runback'; END IF;
  -- Paused recovery uses fresh identity and CAS; stale requests cannot clear intent.
  UPDATE public.games SET is_paused=true WHERE id=g;
  UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE id=p[1];
  SELECT intent_version INTO version_before FROM public.players WHERE id=p[1];
  v:=public.set_automatic_play(g,r,d,p[1],version_before,false);
  IF v->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'incident357:stale_stop_accepted'; END IF;
  v:=public.set_automatic_play(g,next_r,next_d,p[1],version_before,false);
  IF v->>'outcome'<>'accepted' OR EXISTS(SELECT 1 FROM public.players WHERE id=p[1] AND (auto_fold OR sit_out_next_hand))
    OR NOT (SELECT is_paused FROM public.games WHERE id=g)
   THEN RAISE EXCEPTION 'incident357:paused_stop_failed:%',v; END IF;
  v:=public.set_automatic_play(g,next_r,next_d,p[1],version_before,true);
  IF v->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'incident357:stale_cas_accepted'; END IF;
  IF (SELECT sum(chips) FROM public.players WHERE game_id=g)+(SELECT pot FROM public.games WHERE id=g)<>300
   THEN RAISE EXCEPTION 'incident357:final_conservation'; END IF;
 END LOOP;
 END LOOP;
END $proof$;
ROLLBACK;
