-- All users, fixtures, and financial activity in this script are synthetic.
CREATE FUNCTION pg_temp.verify(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'latency proof: %',label; END IF;END $$;
DO $$
DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 m uuid;c private.delayed_children;v jsonb;prior jsonb;req uuid;first_req uuid;first_rev bigint;first_actor uuid;
 original timestamptz;deadline bigint;actor_i uuid;expected bigint;tie_i boolean;real_i boolean;first_rack jsonb;
BEGIN
 INSERT INTO auth.users(id) VALUES(a),(b),(outsider);
 UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id IN(a,b,outsider);
 UPDATE public.profiles SET is_active=true WHERE id IN(a,b,outsider);
 FOREACH real_i IN ARRAY ARRAY[false,true] LOOP
 FOREACH tie_i IN ARRAY ARRAY[true,false] LOOP
 SET CONSTRAINTS ALL DEFERRED;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);SET LOCAL ROLE authenticated;
 m:=public.delayed_create(gen_random_uuid(),b,real_i,'[{"game":"ptown-words","stake":7}]');RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 PERFORM public.delayed_respond(m,gen_random_uuid(),(SELECT offer_hash FROM private.delayed_matches WHERE id=m),'accept');
 SELECT * INTO STRICT c FROM private.delayed_children WHERE match_id=m;
 PERFORM pg_temp.verify(c.config=private.ptown_words_rules() AND c.expires_at=c.available_at+interval '36 hours' AND c.gameplay_due_at IS NULL,'live frozen config and availability');
 first_actor:=c.actor;original:=c.expires_at;
 PERFORM set_config('request.jwt.claim.sub',(CASE WHEN c.actor=a THEN b ELSE a END)::text,true);
 v:=public.delayed_words_inspect(c.id);
 PERFORM pg_temp.verify(NOT(v->>'canAct')::boolean AND v->'playDeadline'='null' AND NOT(v ?| ARRAY['racks','bag']),'inspection has no clock side effects or private rack leak');
 BEGIN PERFORM public.delayed_words_action(c.id,gen_random_uuid(),c.revision,'begin_turn');RAISE EXCEPTION 'opponent started';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub',c.actor::text,true);
 BEGIN PERFORM public.delayed_words_action(c.id,gen_random_uuid(),c.revision,'pass');RAISE EXCEPTION 'unarmed pass accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:enter_turn_first' THEN RAISE;END IF;END;
 first_rev:=c.revision; first_req:=gen_random_uuid();
 v:=public.delayed_words_action(c.id,first_req,c.revision,'begin_turn');deadline:=(v->>'deadline')::bigint;
 PERFORM pg_temp.verify(deadline=(v->>'playDeadline')::bigint AND deadline-(v->>'serverAt')::bigint BETWEEN 179000 AND 180000,'server arms exactly three minutes');
 PERFORM pg_temp.verify((SELECT floor(extract(epoch FROM (item->>'expiresAt')::timestamptz)*1000)::bigint=deadline AND (item->>'availabilityExpiresAt')::timestamptz=original FROM jsonb_array_elements(public.delayed_home(m)->'lineup') item WHERE item->>'id'=c.id::text),'lobby resume uses the entered deadline');
 PERFORM pg_temp.verify(public.delayed_words_action(c.id,first_req,c.revision,'begin_turn')=v,'exact duplicate start');
 PERFORM pg_temp.verify(public.delayed_words_snapshot(c.id)->'playDeadline'=v->'playDeadline' AND public.delayed_words_inspect(c.id)->'playDeadline'=v->'playDeadline','reload/inspect do not restart');
 v:=public.delayed_words_action(c.id,gen_random_uuid(),(v->>'revision')::bigint,'begin_turn');
 PERFORM pg_temp.verify((v->>'deadline')::bigint=deadline,'independent tab resume preserves deadline');
 BEGIN PERFORM public.delayed_words_action(c.id,gen_random_uuid(),(v->>'revision')::bigint,'request_pause');RAISE EXCEPTION 'pause allowed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:invalid_action' THEN RAISE;END IF;END;
 FOR i IN 0..1 LOOP
  prior:=v;req:=gen_random_uuid();
  v:=public.delayed_words_action(c.id,req,(prior->>'revision')::bigint,'time_bank',jsonb_build_array(jsonb_build_object('slot',i)));
  PERFORM pg_temp.verify((v->>'deadline')::bigint=deadline+180000*(i+1) AND v->'turn'=prior->'turn' AND v->'rack'=prior->'rack','one exact bank extension');
  PERFORM pg_temp.verify(v=public.delayed_words_action(c.id,req,(prior->>'revision')::bigint,'time_bank',jsonb_build_array(jsonb_build_object('slot',i))),'duplicate bank replay');
 END LOOP;
 prior:=public.delayed_words_action(c.id,gen_random_uuid(),(v->>'revision')::bigint,'time_bank','[{"slot":0}]');
 PERFORM pg_temp.verify(prior->>'error'='ptown_words:time_bank_used' AND prior->'deadline'=v->'deadline','spent bank denied');
 PERFORM pg_temp.verify((SELECT expires_at=original AND segment=1 FROM private.delayed_children WHERE id=c.id),'banks preserve availability and turn identity');
 -- Active time can cross the original 36-hour boundary.
 UPDATE private.delayed_children SET available_at=c.available_at-interval '37 hours',last_call_at=c.last_call_at-interval '37 hours',expires_at=original-interval '37 hours' WHERE id=c.id;
 PERFORM pg_temp.verify(NOT private.delayed_expire(c.id,c.segment,original-interval '37 hours') AND (SELECT NOT terminal FROM private.delayed_children WHERE id=c.id),'entered clock takes precedence over availability');
 -- Playable expiry is a live-rules pass, not availability forfeiture.
 FOR n IN 1..4 LOOP
  SELECT * INTO c FROM private.delayed_children WHERE id=c.id;actor_i:=c.actor;
  PERFORM set_config('request.jwt.claim.sub',actor_i::text,true);
  IF n>1 THEN
   v:=public.delayed_words_action(c.id,gen_random_uuid(),c.revision,'begin_turn');
   IF n=3 THEN PERFORM pg_temp.verify(v->'timeBankSpent'->first_actor::text='[0,1]'::jsonb,'spent slots persist on next own turn');END IF;
  END IF;
  IF n=4 THEN
   -- Equal rack values and explicit scores exercise both authoritative outcomes.
   UPDATE private.delayed_children SET state=state||jsonb_build_object('scores',jsonb_build_object(a::text,CASE WHEN tie_i THEN 0 ELSE 10 END,b::text,0),
    'racks',jsonb_build_object(a::text,'[]'::jsonb,b::text,'[]'::jsonb)) WHERE id=c.id;
  END IF;
  UPDATE private.delayed_children SET gameplay_due_at=date_trunc('milliseconds',clock_timestamp())-interval '1 millisecond',state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1)) WHERE id=c.id;
  v:=public.delayed_words_snapshot(c.id);
  PERFORM pg_temp.verify(jsonb_array_length(v->'moves')=n AND v->'moves'->-1->>'action'='pass','one timeout pass');
  PERFORM pg_temp.verify((SELECT gameplay_due_at IS NULL AND started_at IS NULL AND segment=n+1 FROM private.delayed_children WHERE id=c.id),'next turn is unarmed');
  PERFORM pg_temp.verify(NOT private.delayed_expire(c.id,c.segment,c.expires_at),'late job cannot expire next turn');
 END LOOP;
 SET CONSTRAINTS ALL IMMEDIATE;expected:=CASE WHEN tie_i THEN 0 ELSE 7 END;
 PERFORM pg_temp.verify((v->>'finished')::boolean AND (SELECT count(*)=1 FROM private.delayed_outcomes WHERE child_id=c.id),'terminal exactly once');
 PERFORM pg_temp.verify((SELECT count(*)=1 AND min(organizer_delta)=expected AND min(opponent_delta)=-expected FROM private.delayed_settlements WHERE match_id=m),'canonical settlement');
 PERFORM pg_temp.verify((SELECT count(*)=2 AND sum(chips)=0 AND bool_and(chips=CASE WHEN user_id=a THEN expected ELSE -expected END) FROM public.players WHERE game_id=m),'canonical player chips');
 PERFORM pg_temp.verify((SELECT count(*)=2 AND bool_and(chips=CASE WHEN user_id=a THEN expected ELSE -expected END) FROM public.session_player_snapshots WHERE game_id=m),'frozen financial snapshots');
 PERFORM pg_temp.verify((SELECT count(*)=CASE WHEN real_i THEN 2 ELSE 0 END AND coalesce(sum(amount),0)=0 FROM public.player_transactions WHERE source_game_id=m),'account postings');
 PERFORM pg_temp.verify((SELECT count(*)=CASE WHEN tie_i THEN 0 ELSE 1 END FROM public.gameplay_transfer_batches WHERE game_id=m),'canonical transfer batch');
 PERFORM set_config('request.jwt.claim.sub',first_actor::text,true);
 prior:=public.delayed_words_action(c.id,first_req,first_rev,'begin_turn');
 PERFORM pg_temp.verify(prior->'revision'<>v->'revision' AND (public.delayed_words_snapshot(c.id)->>'finished')::boolean,'late receipt replay leaves terminal state');
 END LOOP;END LOOP;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 m:=public.delayed_create(gen_random_uuid(),b,false,'[{"game":"ptown-words","stake":7}]');
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 PERFORM public.delayed_respond(m,gen_random_uuid(),(SELECT offer_hash FROM private.delayed_matches WHERE id=m),'accept');
 SELECT * INTO c FROM private.delayed_children WHERE match_id=m;
 UPDATE private.delayed_children SET available_at=c.available_at-interval '37 hours',last_call_at=c.last_call_at-interval '37 hours',expires_at=c.expires_at-interval '37 hours' WHERE id=c.id;
 PERFORM set_config('request.jwt.claim.sub',c.actor::text,true);
 v:=public.delayed_words_action(c.id,gen_random_uuid(),c.revision,'begin_turn');
 PERFORM pg_temp.verify(v->>'error'='delayed:deadline' AND v#>>'{outcome,reason}'='timeout_forfeit','missed unentered 36-hour availability forfeits');
END $$;
SELECT 'passed' AS clock_and_settlement;
