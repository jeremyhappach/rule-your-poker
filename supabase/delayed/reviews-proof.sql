-- Execute only inside BEGIN/ROLLBACK. All writes target synthetic UUIDs.
-- Does not invoke global recovery or board pruning, or change admission.
CREATE FUNCTION pg_temp.review_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'review proof: %',label;END IF;END $$;
CREATE FUNCTION pg_temp.review_fixture(a uuid,b uuid,stakes integer[]) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE m uuid:=gen_random_uuid();cfg jsonb:=private.ptown_words_rules_for('ptown-words/3');i integer;BEGIN
 INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,status,offer,offer_hash,accepted_at)
 VALUES(m,a,b,false,'active',(SELECT jsonb_agg(jsonb_build_object('game','ptown-words','stake',s,'config',cfg)) FROM unnest(stakes)s),'proof',clock_timestamp());
 FOR i IN 1..array_length(stakes,1) LOOP
  INSERT INTO private.delayed_children(match_id,ordinal,game_type,stake,config,starter,actor,segment,revision,available_at,last_call_at,expires_at)
  VALUES(m,i,'ptown-words',stakes[i],cfg,a,a,1,1,statement_timestamp(),statement_timestamp()+interval '24 hours',statement_timestamp()+interval '36 hours');
 END LOOP;RETURN m;END $$;
CREATE FUNCTION pg_temp.review_fail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.id::text=current_setting('review.fail',true) AND NEW.status='session_ended' THEN RAISE EXCEPTION 'review:injected';END IF;RETURN NEW;END $$;
CREATE TRIGGER review_proof_failure BEFORE UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION pg_temp.review_fail();
DO $$
DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();m uuid;c uuid;e uuid;f uuid;z uuid;ids uuid[];
 board jsonb;st jsonb;h jsonb;r jsonb;receipt jsonb;rev bigint;before_caps jsonb;signature text;expected text;
BEGIN
 FOR signature,expected IN SELECT * FROM (VALUES
 ('public.settle_gameplay_chip_transfers(uuid,jsonb,text)','86c0feb55524f14ab9f58a06cdee2ef6'),
 ('public.record_session_results()','eb408dcb7dca842776909bd603183a60'),
 ('public.finalize_gameplay_transfer_batch()','5d1c8703caee40ce7392d4eb6de1aaf9'),
 ('private.delayed_finalize(uuid)','3c319dee938f4242d6174b27bc3ff260')) v(s,h) LOOP
  PERFORM pg_temp.review_assert(md5(replace(pg_get_functiondef(signature::regprocedure),chr(13),''))=expected,'unchanged canonical owner '||signature);
 END LOOP;
 INSERT INTO auth.users(id) VALUES(a),(b),(outsider);
 INSERT INTO public.profiles(id,username,is_active) VALUES(a,'Review proof '||a,true),(b,'Review proof '||b,true),(outsider,'Review proof '||outsider,true)
 ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,is_active=true;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 before_caps:=public.delayed_capabilities();
 PERFORM pg_temp.review_assert(before_caps->>'max_children'='32' AND jsonb_array_length(before_caps->'games')=5,'existing five-game admission');
 BEGIN PERFORM public.delayed_create(gen_random_uuid(),b,true,'[{"game":"run21","stake":5}]');RAISE EXCEPTION 'proof:real admitted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='proof:real admitted' THEN RAISE;END IF;END;
 BEGIN PERFORM public.delayed_create(gen_random_uuid(),b,false,'[{"game":"run21","stake":0}]');RAISE EXCEPTION 'proof:invalid stake';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='proof:invalid stake' THEN RAISE;END IF;END;
 m:=public.delayed_create(gen_random_uuid(),b,false,'[{"game":"run21","stake":5}]');
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 PERFORM public.delayed_respond(m,gen_random_uuid(),(SELECT offer_hash FROM private.delayed_matches WHERE id=m),'accept');
 SELECT id INTO c FROM private.delayed_children WHERE match_id=m;
 PERFORM pg_temp.review_assert(NOT EXISTS(SELECT FROM public.games WHERE id=m) AND NOT EXISTS(SELECT FROM public.players WHERE game_id=m) AND NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=m),'acceptance has no financial writes');
 board:=jsonb_build_object('playerId',b,'columns','[[],[],[],[],[]]'::jsonb,'presented','[]'::jsonb,'current',NULL,'passesUsed',0,'cardIndex',0,'revision',1,'startedAt',1000,'deadline',2000,'deck','PRIVATE','result',jsonb_build_object('score',45780,'at',2000,'reason','collect','aggregate',100,'totals','[20,20,20,20,20]'::jsonb,'aceElevations','[]'::jsonb,'speed',100,'multiplier',100));
 st:=jsonb_build_object('version','delayed/1','game','run21','child',c,'players',jsonb_build_array(b,a),'round',1,'turn',1,'totals',jsonb_build_object(b,45780,a,0),'attempts',jsonb_build_array(jsonb_build_object('actor',b,'round',1,'score',45780,'at',2000,'board',board,'evidence',jsonb_build_object('salt','PRIVATE'))),'board',NULL,'deck',NULL,'completed',false,'winner',NULL,'segmentStartedAt',NULL);
 UPDATE private.delayed_children SET state=st,actor=a,segment=2,revision=2 WHERE id=c;
 PERFORM private.delayed_notify(m);PERFORM set_config('request.jwt.claim.sub',a::text,true);
 h:=public.delayed_home(m);r:=public.delayed_reviews(c);e:=(r#>>'{events,0,id}')::uuid;
 PERFORM pg_temp.review_assert(h->>'unsettled'='5' AND h#>ARRAY['lineup','0','scores',b::text]='null'::jsonb AND h#>>ARRAY['lineup','0','scores',a::text]='0','own score immediate, opponent hidden');
 PERFORM pg_temp.review_assert(jsonb_array_length(r->'events')=1 AND r#>>'{events,0,score}'='45780' AND position('PRIVATE' IN r::text)=0,'sanitized immutable attempt capture');
 PERFORM pg_temp.review_assert(NOT EXISTS(SELECT FROM public.games WHERE id=m),'review capture is provisional');
 PERFORM public.delayed_review_ack(e);PERFORM public.delayed_review_ack(e);
 PERFORM pg_temp.review_assert((SELECT count(*)=1 FROM private.delayed_review_seen WHERE event_id=e) AND public.delayed_home(m)#>>ARRAY['lineup','0','scores',b::text]='45780','duplicate ACK and viewer disclosure');
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 BEGIN PERFORM public.delayed_reviews(c);RAISE EXCEPTION 'proof:outsider';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.delayed_review_ack(e);RAISE EXCEPTION 'proof:outsider ACK';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN UPDATE private.delayed_review_events SET score=0 WHERE id=e;RAISE EXCEPTION 'proof:mutable';
 EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM NOT LIKE '%immutable_record%' THEN RAISE;END IF;END;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM private.delayed_record_outcome(c,2,'normal',b,'{"proof":"synthetic review"}');SET CONSTRAINTS ALL IMMEDIATE;
 SELECT to_jsonb(s) INTO receipt FROM private.delayed_settlements s WHERE match_id=m;
 PERFORM pg_temp.review_assert(receipt->>'organizer_delta'='-5' AND (SELECT chips=-5 FROM public.players WHERE game_id=m AND user_id=a) AND (SELECT chips=5 FROM public.players WHERE game_id=m AND user_id=b),'actual canonical negative and positive chips');
 PERFORM pg_temp.review_assert((SELECT count(*)=1 FROM public.gameplay_transfer_batches WHERE game_id=m) AND NOT EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE game_id=m AND unmatched_deltas<>'{}') AND (SELECT count(*)=2 AND sum(chips)=0 FROM public.session_player_snapshots WHERE game_id=m),'one balanced transfer and atomic final snapshots');
 SELECT id INTO f FROM private.delayed_review_events WHERE child_id=c AND kind='child';
 PERFORM pg_temp.review_assert(public.delayed_home(m)#>'{lineup,0,result}'='null'::jsonb AND public.delayed_history_detail(m)#>>'{lineup,0,result,delta}'='-5','pending final hidden; audit details preserved');
 PERFORM public.delayed_review_ack(f);PERFORM public.delayed_finale_ack(m);PERFORM public.delayed_finale_ack(m);
 PERFORM pg_temp.review_assert((SELECT count(*)=1 FROM private.delayed_finale_seen WHERE match_id=m) AND private.delayed_finalize(m)=receipt,'finale and parent replay');
 SELECT revision INTO rev FROM public.platform_notifications WHERE match_id=m AND user_id=a AND kind='settled';PERFORM private.delayed_notify(m);
 PERFORM pg_temp.review_assert((SELECT revision=rev FROM public.platform_notifications WHERE match_id=m AND user_id=a AND kind='settled') AND public.delayed_history()#>>'{0,id}'=m::text,'stable notifications and history');
 PERFORM pg_temp.review_assert(NOT private.delayed_review_cleanup_eligible(x),'pending final viewer retains board') FROM private.delayed_review_events x WHERE id=e;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);PERFORM public.delayed_review_ack(f);PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM public.delayed_review_begin(e);PERFORM pg_temp.review_assert(NOT private.delayed_review_cleanup_eligible(x),'playback lease retains board') FROM private.delayed_review_events x WHERE id=e;
 UPDATE private.delayed_review_playback SET lease_until=clock_timestamp()-interval '1 minute' WHERE event_id=e;
 PERFORM pg_temp.review_assert(private.delayed_review_cleanup_eligible(x),'fully acknowledged expired playback eligible') FROM private.delayed_review_events x WHERE id=e;
 -- Deliberately do not call the global pruning function on the hosted database.
 z:=pg_temp.review_fixture(a,b,ARRAY[5,5]);SELECT array_agg(id ORDER BY ordinal) INTO ids FROM private.delayed_children WHERE match_id=z;
 PERFORM private.delayed_record_outcome(ids[1],1,'normal',a,'{}');
 PERFORM pg_temp.review_assert(NOT EXISTS(SELECT FROM public.games WHERE id=z),'first child cannot settle parent');
 PERFORM set_config('review.fail',z::text,true);
 BEGIN PERFORM private.delayed_record_outcome(ids[2],1,'normal',b,'{}');RAISE EXCEPTION 'proof:failure missing';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'review:injected' THEN RAISE;END IF;END;
 PERFORM pg_temp.review_assert((SELECT count(*)=1 FROM private.delayed_outcomes WHERE match_id=z) AND NOT EXISTS(SELECT FROM private.delayed_settlements WHERE match_id=z) AND NOT EXISTS(SELECT FROM public.games WHERE id=z) AND NOT EXISTS(SELECT FROM private.delayed_review_events WHERE child_id=ids[2]),'financial failure rolls back last outcome and review');
 PERFORM set_config('review.fail','',true);PERFORM private.delayed_record_outcome(ids[2],1,'normal',b,'{}');SET CONSTRAINTS ALL IMMEDIATE;
 PERFORM pg_temp.review_assert((SELECT organizer_delta=0 FROM private.delayed_settlements WHERE match_id=z) AND NOT EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE game_id=z),'net-zero receipt without transfer');
 PERFORM private.delayed_record_outcome(ids[2],1,'normal',b,'{}');
 BEGIN PERFORM private.delayed_record_outcome(ids[2],1,'normal',a,'{}');RAISE EXCEPTION 'proof:conflicting replay';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%outcome_conflict%' THEN RAISE;END IF;END;
 PERFORM pg_temp.review_assert(NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id IN(m,z)),'fake-only account isolation');
 PERFORM pg_temp.review_assert(NOT has_table_privilege('authenticated','private.delayed_review_events','SELECT') AND NOT has_table_privilege('service_role','private.delayed_review_boards','SELECT') AND NOT has_function_privilege('anon','public.delayed_history(uuid,timestamptz,uuid)','EXECUTE') AND NOT has_function_privilege('authenticated','private.delayed_finalize(uuid)','EXECUTE'),'raw records and financial authority denied');
 PERFORM pg_temp.review_assert(public.delayed_capabilities()=before_caps,'admission unchanged');
END $$;
DROP TRIGGER review_proof_failure ON public.games;
SELECT 'PASS review privacy, acknowledgements, authorization, immutable audit, history, retention eligibility, canonical negative chips, balanced ledger, atomic failure/retry, net-zero and replay' proof;
