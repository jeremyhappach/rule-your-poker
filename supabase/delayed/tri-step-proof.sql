-- Execute in BEGIN / ROLLBACK. Every identity and match is synthetic.
CREATE FUNCTION pg_temp.tri_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'tri step proof: %',label;END IF;END $$;
CREATE TEMP TABLE tri_step_checks(label text);
-- Fail after canonical chips, ledger, snapshots and account postings were written.
CREATE FUNCTION pg_temp.tri_step_fault() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('ptown.tri_step_fault',true)='on' THEN
  PERFORM pg_temp.tri_assert((SELECT count(*)=2 FROM public.players WHERE game_id=NEW.match_id),'fault follows financial writes');
  RAISE EXCEPTION 'tri step injected settlement failure';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tri_step_proof_fault AFTER INSERT ON private.delayed_settlements FOR EACH ROW EXECUTE FUNCTION pg_temp.tri_step_fault();
DO $$
DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();m uuid;c private.delayed_children;
 s jsonb;v jsonb;replay jsonb;cmd jsonb;req uuid;actor_i uuid;hash_i text;at_i bigint;expected bigint;winner_i uuid;
 real_i boolean;tie_i boolean;round_i integer;old_rev bigint;old_segment integer;first_cmd jsonb;first_actor uuid;first_req uuid;last_req uuid;
BEGIN
 INSERT INTO auth.users(id) VALUES(a),(b),(outsider);
 UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id IN(a,b,outsider);
 UPDATE public.profiles SET is_active=true WHERE id IN(a,b,outsider);
 PERFORM pg_temp.tri_assert(NOT has_function_privilege('authenticated','public.delayed_tri_step(uuid,uuid,uuid,bigint,bigint,jsonb)','execute') AND NOT has_function_privilege('anon','public.delayed_tri_step(uuid,uuid,uuid,bigint,bigint,jsonb)','execute'),'browser execution denied');
 PERFORM pg_temp.tri_assert(has_function_privilege('service_role','public.delayed_tri_step(uuid,uuid,uuid,bigint,bigint,jsonb)','execute'),'service grant');
 FOREACH real_i IN ARRAY ARRAY[false,true] LOOP
 FOREACH tie_i IN ARRAY ARRAY[false,true] LOOP
  SET CONSTRAINTS ALL DEFERRED;
  PERFORM set_config('request.jwt.claim.sub',a::text,true);SET LOCAL ROLE authenticated;
  m:=public.delayed_create(gen_random_uuid(),b,real_i,'[{"game":"tri-towers","stake":7}]');RESET ROLE;
  SELECT offer_hash INTO hash_i FROM private.delayed_matches WHERE id=m;
  PERFORM set_config('request.jwt.claim.sub',b::text,true);SET LOCAL ROLE authenticated;
  PERFORM public.delayed_respond(m,gen_random_uuid(),hash_i,'accept');RESET ROLE;
  SELECT * INTO c FROM private.delayed_children WHERE match_id=m;
  BEGIN PERFORM public.delayed_tri_step(c.id,outsider);RAISE EXCEPTION 'outsider accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  UPDATE public.account_access SET enabled=false WHERE user_id=c.actor;
  BEGIN PERFORM public.delayed_tri_step(c.id,c.actor);RAISE EXCEPTION 'disabled accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  UPDATE public.account_access SET enabled=true WHERE user_id=c.actor;
  FOR round_i IN 1..4 LOOP
   SELECT * INTO c FROM private.delayed_children WHERE match_id=m;actor_i:=c.actor;
   s:=public.delayed_tri_step(c.id,actor_i);req:=gen_random_uuid();
   v:=public.delayed_tri_step(c.id,actor_i,req,(s->>'revision')::bigint,(s->>'segment')::integer,'{"type":"start"}');
   PERFORM pg_temp.tri_assert(v#>>'{board,phase}'='intro' AND NOT(v->'board' ?| ARRAY['deck','cursor']),'private frozen intro');
   PERFORM pg_temp.tri_assert(v#>'{board,rules}'=c.config,'frozen rule identity');
   -- Release a synthetic intro through the real zero-client tick path.
   at_i:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1;
   UPDATE private.delayed_children SET state=jsonb_set(state,'{board,deadline}',to_jsonb(at_i)),gameplay_due_at=to_timestamp(at_i/1000.0) WHERE id=c.id;
   s:=public.delayed_tri_step(c.id,actor_i);
   PERFORM pg_temp.tri_assert(s#>>'{board,phase}'='ready','intro deadline catchup');
   req:=gen_random_uuid();old_rev:=(s->>'revision')::bigint;old_segment:=(s->>'segment')::integer;
   v:=public.delayed_tri_step(c.id,actor_i,req,old_rev,old_segment,'{"type":"draw"}');
   PERFORM pg_temp.tri_assert(v#>>'{board,phase}'='playing' AND (v#>>'{board,deadline}')::bigint>=(s#>>'{board,deadline}')::bigint,'Ready action starts canonical clock');
   replay:=public.delayed_tri_step(c.id,actor_i,req,old_rev,old_segment,'{"type":"draw"}');
   PERFORM pg_temp.tri_assert(v->'board'=replay->'board' AND v->'revision'=replay->'revision','duplicate exact receipt');
   BEGIN PERFORM public.delayed_tri_step(c.id,actor_i,req,old_rev,old_segment,'{"type":"take_score"}');RAISE EXCEPTION 'changed replay accepted';
   EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:request_conflict' THEN RAISE;END IF;END;
   PERFORM pg_temp.tri_assert(public.delayed_tri_step(c.id,actor_i,gen_random_uuid(),old_rev,old_segment,'{"type":"draw"}')->>'error'='delayed:stale_action','stale command denied');
   IF round_i=1 THEN first_actor:=actor_i;first_req:=req;first_cmd:=jsonb_build_object('revision',old_rev,'segment',old_segment);END IF;
   -- A fixture-only prior score and due clock allow bounded actual reducer/commit
   -- settlement. No saved customer board or historical score is modified.
   at_i:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1;
   expected:=CASE WHEN tie_i OR actor_i<>a THEN 0 ELSE 1000 END;
   UPDATE private.delayed_children SET state=jsonb_set(state,'{board}',(state->'board')||jsonb_build_object('score',(state#>>ARRAY['totals',actor_i::text])::bigint+expected,'deadline',at_i)),gameplay_due_at=to_timestamp(at_i/1000.0) WHERE id=c.id;
   req:=gen_random_uuid();last_req:=req;
   IF round_i=4 THEN
    PERFORM set_config('ptown.tri_step_fault','on',true);
    BEGIN
     PERFORM public.delayed_tri_step(c.id,actor_i,req,(v->>'revision')::bigint,(v->>'segment')::integer,'{"type":"draw"}');
     RAISE EXCEPTION 'fault was not injected';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'tri step injected settlement failure' THEN RAISE;END IF;END;
    PERFORM set_config('ptown.tri_step_fault','off',true);
    PERFORM pg_temp.tri_assert((SELECT revision=(v->>'revision')::bigint AND NOT terminal FROM private.delayed_children WHERE id=c.id),'failed settlement restores child revision');
    PERFORM pg_temp.tri_assert(NOT EXISTS(SELECT FROM private.delayed_settlements WHERE match_id=m) AND NOT EXISTS(SELECT FROM private.delayed_outcomes WHERE child_id=c.id)
     AND NOT EXISTS(SELECT FROM public.games WHERE id=m) AND NOT EXISTS(SELECT FROM public.players WHERE game_id=m)
     AND NOT EXISTS(SELECT FROM public.game_results WHERE game_id=m) AND NOT EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE game_id=m)
     AND NOT EXISTS(SELECT FROM public.session_player_snapshots WHERE game_id=m) AND NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=m)
     AND NOT EXISTS(SELECT FROM private.delayed_commands WHERE actor=actor_i AND request_id=req),'failed settlement leaves no partial financial/result/receipt writes');
   END IF;
   replay:=public.delayed_tri_step(c.id,actor_i,req,(v->>'revision')::bigint,(v->>'segment')::integer,'{"type":"draw"}');
   PERFORM pg_temp.tri_assert(replay->>'error'='delayed:stale_action','deadline wins incoming action');
   s:=public.delayed_tri_step(c.id,actor_i);
   PERFORM pg_temp.tri_assert((s->>'segment')::int=old_segment+1,'one continuation');
   PERFORM pg_temp.tri_assert((SELECT count(*)=0 FROM private.delayed_commands WHERE actor=actor_i AND request_id=req),'expired action has no receipt');
   PERFORM pg_temp.tri_assert((s->>'terminal')::boolean=(round_i=4),'terminal only at completion');
   PERFORM pg_temp.tri_assert(s->'board'='null'::jsonb,'finished own board retired');
  END LOOP;
  SELECT * INTO c FROM private.delayed_children WHERE match_id=m;
  SET CONSTRAINTS ALL IMMEDIATE;
  winner_i:=CASE WHEN tie_i THEN NULL ELSE a END;expected:=CASE WHEN tie_i THEN 0 ELSE 7 END;
  PERFORM pg_temp.tri_assert((SELECT winner IS NOT DISTINCT FROM winner_i FROM private.delayed_outcomes WHERE child_id=c.id),'canonical winner/tie');
  PERFORM pg_temp.tri_assert((SELECT count(*)=1 AND min(organizer_delta)=expected AND min(opponent_delta)=-expected FROM private.delayed_settlements WHERE match_id=m),'one settlement');
  PERFORM pg_temp.tri_assert((SELECT count(*)=2 AND sum(chips)=0 AND bool_and(chips=CASE WHEN user_id=a THEN expected ELSE -expected END) FROM public.players WHERE game_id=m),'actual canonical chips');
  PERFORM pg_temp.tri_assert((SELECT count(*)=2 AND bool_and(chips=CASE WHEN user_id=a THEN expected ELSE -expected END) FROM public.session_player_snapshots WHERE game_id=m),'final snapshots');
  PERFORM pg_temp.tri_assert((SELECT count(*)=CASE WHEN real_i THEN 2 ELSE 0 END AND coalesce(sum(amount),0)=0 FROM public.player_transactions WHERE source_game_id=m AND transaction_type='SessionResult'),'balanced account postings');
  PERFORM pg_temp.tri_assert((SELECT count(*)=CASE WHEN tie_i THEN 0 ELSE 1 END FROM public.gameplay_transfer_batches WHERE game_id=m) AND NOT EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE game_id=m AND unmatched_deltas<>'{}'),'balanced canonical ledger');
  replay:=public.delayed_tri_step(c.id,first_actor,first_req,(first_cmd->>'revision')::bigint,(first_cmd->>'segment')::integer,'{"type":"draw"}');
  PERFORM pg_temp.tri_assert((replay->>'terminal')::boolean AND (replay->>'revision')::bigint=c.revision,'late receipt replay returns current terminal state');
  PERFORM pg_temp.tri_assert(public.delayed_tri_step(c.id,c.actor,gen_random_uuid(),c.revision,c.segment,'{"type":"start"}')->>'error'='delayed:stale_action','terminal cannot restart');
  PERFORM pg_temp.tri_assert((SELECT status='session_ended' FROM public.games WHERE id=m) AND (SELECT status='settled' FROM private.delayed_matches WHERE id=m),'terminal lifecycle');
  INSERT INTO tri_step_checks VALUES(real_i||' / tie='||tie_i||' : actual rules, clocks, receipt replay, late replay, authorization, continuation and canonical settlement');
 END LOOP;END LOOP;
END $$;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT * FROM tri_step_checks;
