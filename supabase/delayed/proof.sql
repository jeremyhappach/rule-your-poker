-- Run only inside BEGIN/ROLLBACK. Synthetic identities and canonical writes.
CREATE FUNCTION pg_temp.aw_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Async Words proof: %',label;END IF;END $$;
CREATE FUNCTION pg_temp.aw_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id::text=current_setting('aw.fail',true) AND NEW.status='session_ended' THEN RAISE EXCEPTION 'aw:injected_failure';END IF;RETURN NEW;END $$;
CREATE TRIGGER aw_proof_failure BEFORE UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION pg_temp.aw_fail();
DO $$
DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();parent uuid;hash text;request uuid;
 c private.delayed_children;s jsonb;answer jsonb;prior jsonb;kind text;i int;now_at timestamptz;incident uuid;before_deadline timestamptz;
 bag jsonb;rack_a jsonb;rack_b jsonb;used jsonb;
BEGIN
 INSERT INTO auth.users(id) VALUES(a),(b),(outsider);
 INSERT INTO public.profiles(id,username,is_active) VALUES(a,'AW '||left(a::text,12),true),(b,'AW '||left(b::text,12),true),(outsider,'AW '||left(outsider::text,12),true)
 ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,is_active=true;
 UPDATE private.delayed_release SET admission_enabled=true;
 UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp();
 PERFORM set_config('request.jwt.claim.sub',a::text,true);PERFORM set_config('request.jwt.claim.role','authenticated',true);
 BEGIN PERFORM public.delayed_create(gen_random_uuid(),b,true,'[{"game":"ptown-words","stake":9}]');RAISE EXCEPTION 'aw:unexpected real admission';EXCEPTION WHEN raise_exception THEN IF SQLERRM='aw:unexpected real admission' THEN RAISE;END IF;END;
 BEGIN PERFORM public.delayed_create(gen_random_uuid(),b,false,'[{"game":"run21","stake":9}]');RAISE EXCEPTION 'aw:unexpected other admission';EXCEPTION WHEN raise_exception THEN IF SQLERRM='aw:unexpected other admission' THEN RAISE;END IF;END;
 BEGIN PERFORM public.delayed_create(gen_random_uuid(),b,false,'[{"game":"ptown-words","stake":9},{"game":"ptown-words","stake":9}]');RAISE EXCEPTION 'aw:unexpected multi admission';EXCEPTION WHEN raise_exception THEN IF SQLERRM='aw:unexpected multi admission' THEN RAISE;END IF;END;
 BEGIN PERFORM public.delayed_create(gen_random_uuid(),b,false,'[{"game":"ptown-words","stake":0}]');RAISE EXCEPTION 'aw:unexpected invalid stake';EXCEPTION WHEN raise_exception THEN IF SQLERRM='aw:unexpected invalid stake' THEN RAISE;END IF;END;
 FOREACH kind IN ARRAY ARRAY['normal','tie','forfeit','recovery'] LOOP
  PERFORM set_config('request.jwt.claim.sub',a::text,true);request:=gen_random_uuid();
  parent:=public.delayed_create(request,b,false,'[{"game":"ptown-words","stake":9}]');
  PERFORM pg_temp.aw_assert(public.delayed_create(request,b,false,'[{"game":"ptown-words","stake":9}]')=parent,'create replay');
  SELECT offer_hash INTO hash FROM private.delayed_matches WHERE id=parent;
  PERFORM set_config('request.jwt.claim.sub',b::text,true);request:=gen_random_uuid();
  answer:=public.delayed_respond(parent,request,hash,'accept');PERFORM pg_temp.aw_assert(answer->>'status'='active','explicit acceptance');
  PERFORM pg_temp.aw_assert(public.delayed_respond(parent,request,hash,'accept')=answer,'accept replay');
  SELECT * INTO STRICT c FROM private.delayed_children WHERE match_id=parent;
  PERFORM pg_temp.aw_assert(c.starter::text=c.state->'players'->(c.state->>'turnIndex')::int->>'id' AND jsonb_array_length(c.state->'openingDraws')>=2,'opening tile draw');
  PERFORM pg_temp.aw_assert(c.expires_at=c.available_at+interval '36 hours' AND c.last_call_at=c.available_at+interval '24 hours','36h/24h');
  PERFORM pg_temp.aw_assert(NOT EXISTS(SELECT FROM public.games WHERE id=parent) AND NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=parent),'zero interim financial writes');
  PERFORM set_config('request.jwt.claim.sub',c.actor::text,true);answer:=public.delayed_words_snapshot(c.id);
  PERFORM pg_temp.aw_assert(NOT answer?'bag' AND NOT answer?'racks' AND jsonb_array_length(answer->'rack')=7,'rack/bag projection');
  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  BEGIN PERFORM public.delayed_words_snapshot(c.id);RAISE EXCEPTION 'aw:unexpected outsider';EXCEPTION WHEN no_data_found OR insufficient_privilege THEN NULL;END;
  PERFORM set_config('request.jwt.claim.sub',c.actor::text,true);
  BEGIN PERFORM public.delayed_words_action(c.id,gen_random_uuid(),c.revision,'time_bank','[{"slot":0}]');RAISE EXCEPTION 'aw:unexpected bank';EXCEPTION WHEN raise_exception THEN IF SQLERRM='aw:unexpected bank' THEN RAISE;END IF;END;
  IF kind IN('normal','tie') THEN
   -- Deterministic synthetic racks, conserving the original complete tile set.
   SELECT jsonb_agg(value ORDER BY (value->>'value')::int,(value->>'id')::int) INTO bag FROM jsonb_array_elements((c.state->'bag')||(c.state->'racks'->a::text)||(c.state->'racks'->b::text));
   SELECT jsonb_agg(value ORDER BY ordinal) INTO rack_a FROM jsonb_array_elements(bag) WITH ORDINALITY t(value,ordinal) WHERE ordinal BETWEEN 3 AND 9;
   SELECT jsonb_agg(value ORDER BY ordinal) INTO rack_b FROM jsonb_array_elements(bag) WITH ORDINALITY t(value,ordinal) WHERE ordinal BETWEEN CASE WHEN kind='tie' THEN 10 ELSE 94 END AND CASE WHEN kind='tie' THEN 16 ELSE 100 END;
   used:=rack_a||rack_b;
   SELECT coalesce(jsonb_agg(value),'[]'::jsonb) INTO bag FROM jsonb_array_elements(bag) item WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(used) u WHERE u->>'id'=item.value->>'id');
   UPDATE private.delayed_children SET state=jsonb_set(jsonb_set(state,'{bag}',bag),'{racks}',jsonb_build_object(a::text,rack_a,b::text,rack_b)) WHERE id=c.id;
   FOR i IN 1..4 LOOP
    SELECT * INTO c FROM private.delayed_children WHERE id=c.id;PERFORM set_config('request.jwt.claim.sub',c.actor::text,true);request:=gen_random_uuid();
    IF i=4 AND kind='normal' THEN
     PERFORM set_config('aw.fail',parent::text,true);
     BEGIN PERFORM public.delayed_words_action(c.id,request,c.revision,'pass');RAISE EXCEPTION 'aw:missing injected failure';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'aw:injected_failure' THEN RAISE;END IF;END;
     PERFORM pg_temp.aw_assert(NOT EXISTS(SELECT FROM private.delayed_outcomes WHERE match_id=parent) AND NOT EXISTS(SELECT FROM public.games WHERE id=parent),'last outcome and canonical writes roll back together');
     PERFORM set_config('aw.fail','',true);
    END IF;
    answer:=public.delayed_words_action(c.id,request,c.revision,'pass');
    PERFORM pg_temp.aw_assert(public.delayed_words_action(c.id,request,c.revision,'pass')=answer,'action replay');
   END LOOP;
  ELSE
   IF kind='recovery' THEN
    incident:=private.delayed_incident_open(parent,'Synthetic verified incident');before_deadline:=c.expires_at;
    PERFORM pg_temp.aw_assert((public.delayed_words_snapshot(c.id)->>'paused')::boolean,'incident hold');
    PERFORM pg_sleep(0.01);PERFORM private.delayed_incident_close(incident,'Synthetic incident resolved');
    PERFORM pg_temp.aw_assert((SELECT expires_at>before_deadline FROM private.delayed_children WHERE id=c.id),'measured resume');
   END IF;
   now_at:=clock_timestamp()-interval '1 second';
   UPDATE private.delayed_children SET available_at=now_at-interval '36 hours',last_call_at=now_at-interval '12 hours',expires_at=now_at,state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM now_at)*1000)::bigint)) WHERE id=c.id;
   IF kind='recovery' THEN PERFORM private.delayed_words_recover();answer:=public.delayed_words_snapshot(c.id);
   ELSE answer:=public.delayed_words_action(c.id,gen_random_uuid(),c.revision,'pass');PERFORM pg_temp.aw_assert(answer->>'error'='delayed:deadline','late action commits expiry');END IF;
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.aw_assert((SELECT count(*)=1 FROM private.delayed_outcomes WHERE match_id=parent) AND (SELECT count(*)=1 FROM private.delayed_settlements WHERE match_id=parent),'one immutable outcome and receipt');
  PERFORM pg_temp.aw_assert((SELECT count(*)=2 AND sum(chips)=0 AND sum(abs(chips))=CASE WHEN kind='tie' THEN 0 ELSE 18 END FROM public.players WHERE game_id=parent),'canonical player deltas');
  PERFORM pg_temp.aw_assert((SELECT count(*)=2 AND sum(chips)=0 FROM public.session_player_snapshots WHERE game_id=parent),'canonical snapshots');
  PERFORM pg_temp.aw_assert((SELECT count(*)=CASE WHEN kind='tie' THEN 0 ELSE 1 END FROM public.gameplay_transfer_batches WHERE game_id=parent),'one transfer or zero-net no transfer: '||kind||' count='||(SELECT count(*) FROM public.gameplay_transfer_batches WHERE game_id=parent));
  PERFORM pg_temp.aw_assert(NOT EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE game_id=parent AND unmatched_deltas<>'{}'::jsonb),'balanced deferred ledger');
  PERFORM pg_temp.aw_assert(NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=parent),'fake mode leaves real account history untouched');
  PERFORM pg_temp.aw_assert((SELECT reason=CASE WHEN kind='tie' THEN 'draw' WHEN kind='normal' THEN 'normal' ELSE 'timeout_forfeit' END FROM private.delayed_outcomes WHERE match_id=parent),'normal versus forfeit');
  prior:=private.delayed_finalize(parent);PERFORM pg_temp.aw_assert(private.delayed_finalize(parent)=prior,'parent replay');
  PERFORM pg_temp.aw_assert(NOT EXISTS(SELECT FROM public.platform_notifications WHERE match_id=parent AND actionable),'terminal clears obligations');
  BEGIN UPDATE private.delayed_outcomes SET evidence='{}' WHERE match_id=parent;RAISE EXCEPTION 'aw:mutable outcome';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 END LOOP;
 PERFORM pg_temp.aw_assert(NOT has_function_privilege('authenticated','private.delayed_finalize(uuid)','EXECUTE') AND NOT has_table_privilege('authenticated','private.delayed_children','UPDATE'),'private mutation denied');
 PERFORM pg_temp.aw_assert(has_function_privilege('authenticated','public.delayed_words_action(uuid,uuid,bigint,text,jsonb)','EXECUTE'),'ordinary authenticated action available');
END $$;
DROP TRIGGER aw_proof_failure ON public.games;
SELECT 'PASS async Words normal/tie/forfeit/recovery, canonical chips/ledger, rollback, privacy, replay, permissions, fake-only scope' AS proof;
