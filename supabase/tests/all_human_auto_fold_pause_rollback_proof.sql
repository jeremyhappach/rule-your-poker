-- Run through .codex/scripts/build-all-human-auto-fold-proof.mjs.
-- Only synthetic fake-money fixtures. Every candidate definition and row rolls back.
CREATE OR REPLACE FUNCTION pg_temp.auto_fold_fixture(kind text)
RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE f jsonb;
BEGIN
 PERFORM set_config('request.headers','{}',true);
 PERFORM set_config('request.path','',true);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM set_config('app.three_five_seven_recovery','off',true);
 IF kind='holm' THEN
  f:=pg_temp.holm_boundary_fixture('auto-fold pause',false,false);
  UPDATE public.games SET timeout_enforcement_enabled=true,timeout_action='auto_fold',pussy_tax_enabled=true,pussy_tax_value=1 WHERE id=(f->>'game')::uuid;
 ELSE
  f:=pg_temp.decision_proof_fixture();
  f:=f||jsonb_build_object('u1',f->>'user1','u2',f->>'user2');
 END IF;
 IF (SELECT real_money FROM public.games WHERE id=(f->>'game')::uuid) THEN RAISE EXCEPTION 'proof:real_money_fixture'; END IF;
 -- Model the committed creation transaction before any gameplay/pause request.
 SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE;
 SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED;
 RETURN f;
END $f$;

CREATE OR REPLACE FUNCTION pg_temp.auto_fold_money(gid uuid)
RETURNS jsonb LANGUAGE plpgsql AS $f$
BEGIN
 SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE;
 SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED;
 RETURN (SELECT jsonb_build_object(
 'pot',(SELECT pot FROM public.games WHERE id=gid),
 'chips',(SELECT jsonb_agg(jsonb_build_array(id,chips) ORDER BY id) FROM public.players WHERE game_id=gid),
 'transfers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.gameplay_transfer_batches t WHERE game_id=gid),
 'results',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.game_results t WHERE game_id=gid),
 'snapshots',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.session_player_snapshots t WHERE game_id=gid),
 'transactions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.player_transactions t WHERE source_game_id=gid),
 'actions',(SELECT count(*) FROM public.player_actions a JOIN public.rounds r ON r.id=a.round_id WHERE r.game_id=gid),
 'rounds',(SELECT count(*) FROM public.rounds WHERE game_id=gid)));
END;
$f$;

DO $proof$
DECLARE f jsonb; g uuid; d uuid; r uuid; p1 uuid; p2 uuid; result jsonb; before_money jsonb;
 saved jsonb; body text; scoped text; attempts bigint; version bigint; paused_deadline timestamptz;
 kind text; outcome boolean; i integer;
BEGIN
 IF has_function_privilege('anon','private.pause_all_humans_auto_fold(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','private.pause_all_humans_auto_fold(uuid)','EXECUTE')
 OR has_function_privilege('service_role','private.pause_all_humans_auto_fold(uuid)','EXECUTE') THEN RAISE EXCEPTION 'proof:private_guard_exposed'; END IF;

 -- Exercise the real canonical timer owner with an exact fixture-only admission
 -- predicate in this rollback transaction. Its secondary legacy scan is scoped too.
 body:=pg_get_functiondef('private.advance_due_canonical_game_timers(integer)'::regprocedure);
 scoped:=replace(body,'WHERE timer.owner_task=''canonical_timers''',
  'WHERE game_row.id=current_setting(''proof.auto_fold_game'')::uuid AND timer.owner_task=''canonical_timers''');
 scoped:=replace(scoped,'WHERE round_row.game_id=game_row.id',
  'WHERE game_row.id=current_setting(''proof.auto_fold_game'')::uuid AND round_row.game_id=game_row.id');
 IF scoped=body OR scoped NOT LIKE '%WHERE game_row.id=current_setting(''proof.auto_fold_game'')::uuid AND round_row.game_id=game_row.id%' THEN RAISE EXCEPTION 'proof:runner_scope_drift'; END IF;
 EXECUTE scoped;
 f:=pg_temp.auto_fold_fixture('holm'); g:=(f->>'game')::uuid; d:=(f->>'dealer')::uuid;
 r:=(f->>'round')::uuid; p1:=(f->>'p1')::uuid; p2:=(f->>'p2')::uuid;
 PERFORM set_config('proof.auto_fold_game',g::text,true);
 UPDATE public.rounds SET decision_deadline=clock_timestamp()-interval '1 second' WHERE id=r;
 result:=private.advance_due_canonical_game_timers(64);
 IF (result->>'failed')::int>0 OR (SELECT is_paused FROM public.games WHERE id=g)
 OR NOT (SELECT auto_fold AND decision_locked FROM public.players WHERE id=p1)
 OR (SELECT auto_fold FROM public.players WHERE id=p2)
 OR (SELECT count(*) FROM public.player_actions WHERE round_id=r)<>1 THEN RAISE EXCEPTION 'proof:single_holm_expiry:%',result; END IF;
 before_money:=pg_temp.auto_fold_money(g);
 UPDATE public.rounds SET decision_deadline=clock_timestamp()-interval '1 second' WHERE id=r;
 result:=private.advance_due_canonical_game_timers(64);
 IF NOT (SELECT is_paused AND pause_version=1 FROM public.games WHERE id=g)
 OR NOT (SELECT auto_fold AND NOT decision_locked FROM public.players WHERE id=p2)
 OR pg_temp.auto_fold_money(g) IS DISTINCT FROM before_money THEN RAISE EXCEPTION 'proof:last_holm_expiry:%',result; END IF;
 SELECT decision_deadline INTO paused_deadline FROM public.rounds WHERE id=r;
 IF paused_deadline<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM private.game_timer_registry WHERE game_id=g AND round_id=r AND actor_player_id=p2 AND state='scheduled' AND due_at=paused_deadline) THEN RAISE EXCEPTION 'proof:paused_timer_lost'; END IF;
 SELECT sum(attempt_count) INTO attempts FROM private.game_timer_registry WHERE game_id=g;
 FOR i IN 1..3 LOOP result:=private.advance_due_canonical_game_timers(64); END LOOP;
 IF (SELECT sum(attempt_count) FROM private.game_timer_registry WHERE game_id=g)<>attempts
 OR pg_temp.auto_fold_money(g) IS DISTINCT FROM before_money THEN RAISE EXCEPTION 'proof:paused_timer_advanced'; END IF;
 result:=public.holm_apply_deadline_decision(g,r,p2,'fold',true);
 IF NOT coalesce((result->>'game_paused')::boolean,false) THEN RAISE EXCEPTION 'proof:paused_delivery'; END IF;

 -- Returning human clears only their own automatic intent, then host explicitly resumes.
 PERFORM set_config('request.jwt.claim.sub',f->>'u2',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'u2','role','authenticated')::text,true);
 SELECT intent_version INTO version FROM public.players WHERE id=p2;
 result:=public.set_automatic_play(g,r,d,p2,version,false);
 IF result->>'outcome'<>'accepted' OR NOT (SELECT is_paused FROM public.games WHERE id=g) THEN RAISE EXCEPTION 'proof:return_to_play'; END IF;
 PERFORM set_config('request.jwt.claim.sub',f->>'u1',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'u1','role','authenticated')::text,true);
 result:=public.set_game_paused(g,false,d,0);
 IF result->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'proof:stale_resume'; END IF;
 result:=public.set_game_paused(g,false,d,1);
 IF result->>'outcome'<>'resumed' OR (SELECT decision_deadline FROM public.rounds WHERE id=r)<=clock_timestamp() THEN RAISE EXCEPTION 'proof:resume_clock'; END IF;
 result:=public.holm_apply_deadline_decision(g,r,p2,'fold',true);
 IF result->>'outcome'<>'deadline_not_expired' OR (SELECT auto_fold FROM public.players WHERE id=p2) THEN RAISE EXCEPTION 'proof:late_delivery'; END IF;
 IF pg_temp.auto_fold_money(g) IS DISTINCT FROM before_money THEN RAISE EXCEPTION 'proof:resume_money'; END IF;
 EXECUTE body;

 -- Explicit automatic preference uses the same aggregate safeguard.
 f:=pg_temp.auto_fold_fixture('holm'); g:=(f->>'game')::uuid; r:=(f->>'round')::uuid; d:=(f->>'dealer')::uuid;
 FOR i IN 1..2 LOOP
  PERFORM set_config('request.jwt.claim.sub',f->>('u'||i),true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>('u'||i),'role','authenticated')::text,true);
  SELECT intent_version INTO version FROM public.players WHERE id=(f->>('p'||i))::uuid;
  result:=public.set_automatic_play(g,r,d,(f->>('p'||i))::uuid,version,true);
  IF result->>'outcome'<>'accepted' OR (SELECT is_paused FROM public.games WHERE id=g)<>(i=2) THEN RAISE EXCEPTION 'proof:automatic_intent:%',i; END IF;
 END LOOP;

 -- A manual fold does not mean absence. Both deliberate folds settle once.
 f:=pg_temp.auto_fold_fixture('holm'); g:=(f->>'game')::uuid; r:=(f->>'round')::uuid;
 FOR i IN 1..2 LOOP
  PERFORM set_config('request.jwt.claim.sub',f->>('u'||i),true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>('u'||i),'role','authenticated')::text,true);
  result:=public.holm_submit_decision(g,r,(f->>('p'||i))::uuid,'fold');
 END LOOP;
 IF (SELECT is_paused FROM public.games WHERE id=g) OR EXISTS(SELECT 1 FROM public.players WHERE game_id=g AND auto_fold)
 OR (SELECT count(*) FROM public.game_results WHERE game_id=g)<>1 THEN RAISE EXCEPTION 'proof:intentional_folds'; END IF;
 before_money:=pg_temp.auto_fold_money(g);
 result:=public.holm_submit_decision(g,r,(f->>'p2')::uuid,'fold');
 IF pg_temp.auto_fold_money(g) IS DISTINCT FROM before_money THEN RAISE EXCEPTION 'proof:duplicate_settlement'; END IF;
 -- Already-qualified state cannot prepare/activate a successor after a resume.
 UPDATE public.players SET auto_fold=true WHERE game_id=g;
 result:=public.prepare_next_holm_hand(g,r);
 IF NOT (SELECT is_paused FROM public.games WHERE id=g) THEN
  -- An already-prepared replay is inert; its activation owner must stop.
  SELECT id INTO p1 FROM public.rounds WHERE holm_predecessor_round_id=r;
  UPDATE public.rounds SET presentation_fallback_at=clock_timestamp()-interval '1 second' WHERE id=p1;
  result:=private.activate_prepared_holm_hand_exact(g,r,p1,'fallback');
 END IF;
 IF NOT (SELECT is_paused FROM public.games WHERE id=g) OR pg_temp.auto_fold_money(g) IS DISTINCT FROM before_money THEN RAISE EXCEPTION 'proof:successor_boundary'; END IF;

 -- 3-5-7 records missing timeout flags before either fold or settlement.
 f:=pg_temp.auto_fold_fixture('357'); g:=(f->>'game')::uuid; r:=(f->>'round')::uuid;
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.rounds SET decision_deadline=clock_timestamp()-interval '1 second' WHERE id=r;
 PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
 before_money:=pg_temp.auto_fold_money(g);
 result:=private.three_five_seven_recover_game(g);
 IF result->>'outcome'<>'paused' OR NOT (SELECT is_paused FROM public.games WHERE id=g)
 OR EXISTS(SELECT 1 FROM public.players WHERE game_id=g AND (NOT auto_fold OR decision_locked))
 OR pg_temp.auto_fold_money(g) IS DISTINCT FROM before_money THEN RAISE EXCEPTION 'proof:357_zero_client_expiry:%',result; END IF;
 result:=private.three_five_seven_recover_game(g);
 result:=public.three_five_seven_expire_round(g,r,(f->>'dealer')::uuid,1,1);
 IF pg_temp.auto_fold_money(g) IS DISTINCT FROM before_money THEN RAISE EXCEPTION 'proof:357_duplicate_expiry'; END IF;
 -- A present player who already chose fold is not classified as timed out.
 f:=pg_temp.auto_fold_fixture('357'); g:=(f->>'game')::uuid; r:=(f->>'round')::uuid;
 result:=public.three_five_seven_submit_decision(g,r,(f->>'dealer')::uuid,1,1,(f->>'p1')::uuid,'fold');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.rounds SET decision_deadline=clock_timestamp()-interval '1 second' WHERE id=r;
 PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
 result:=public.three_five_seven_expire_round(g,r,(f->>'dealer')::uuid,1,1);
 IF (SELECT is_paused FROM public.games WHERE id=g) OR (SELECT auto_fold FROM public.players WHERE id=(f->>'p1')::uuid)
 OR NOT (SELECT auto_fold FROM public.players WHERE id=(f->>'p2')::uuid) THEN RAISE EXCEPTION 'proof:357_single_expiry:%',result; END IF;

 -- Policy and eligibility controls preserve all seven game-specific contracts.
 FOREACH kind IN ARRAY ARRAY['holm-game','3-5-7','horses','ship-captain-crew','cribbage','gin-rummy','yahtzee'] LOOP
  f:=pg_temp.auto_fold_fixture('holm'); g:=(f->>'game')::uuid;
  UPDATE public.games SET game_type=kind,timeout_enforcement_enabled=NULL,timeout_action=NULL WHERE id=g;
  UPDATE public.players SET auto_fold=true WHERE game_id=g;
  saved:=private.capture_recovery_context();
  outcome:=private.pause_all_humans_auto_fold(g);
  IF outcome<>(kind IN ('holm-game','3-5-7')) OR private.capture_recovery_context() IS DISTINCT FROM saved THEN RAISE EXCEPTION 'proof:policy_or_context:%',kind; END IF;
 END LOOP;
 -- Bot identity is immutable: create the cohort with the intended identities.
 INSERT INTO public.games(name,status,game_type,current_host,real_money,timeout_enforcement_enabled,timeout_action)
 VALUES('Rollback proof: empty human cohort','in_progress','holm-game',(f->>'u1')::uuid,false,true,'auto_fold') RETURNING id INTO g;
 INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot,auto_fold)
 VALUES(g,(f->>'u2')::uuid,1,0,'active',true,false);
 IF private.pause_all_humans_auto_fold(g) THEN RAISE EXCEPTION 'proof:empty_human_cohort'; END IF;
 INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot,auto_fold)
 VALUES(g,(f->>'u1')::uuid,2,0,'active',false,true);
 IF NOT private.pause_all_humans_auto_fold(g) THEN RAISE EXCEPTION 'proof:bot_blocks_pause'; END IF;
 f:=pg_temp.auto_fold_fixture('holm'); g:=(f->>'game')::uuid;
 UPDATE public.players SET auto_fold=true WHERE id=(f->>'p1')::uuid;
 UPDATE public.players SET sitting_out=true WHERE id=(f->>'p2')::uuid;
 IF NOT private.pause_all_humans_auto_fold(g) THEN RAISE EXCEPTION 'proof:sitting_out_blocks_pause'; END IF;
 f:=pg_temp.auto_fold_fixture('holm'); g:=(f->>'game')::uuid;
 UPDATE public.players SET auto_fold=true WHERE game_id=g;
 UPDATE public.games SET timeout_enforcement_enabled=false WHERE id=g;
 IF private.pause_all_humans_auto_fold(g) THEN RAISE EXCEPTION 'proof:disabled_policy'; END IF;
 UPDATE public.games SET status='game_over',timeout_enforcement_enabled=true WHERE id=g;
 IF private.pause_all_humans_auto_fold(g) THEN RAISE EXCEPTION 'proof:terminal_game'; END IF;
END $proof$;
