-- Run after reviews-proof.sql, inside the same BEGIN/ROLLBACK transaction.
-- The caller supplies frozen shared rules in finale.proof.rules. Synthetic IDs only.
DO $$
DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();m uuid:=gen_random_uuid();
 ids uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];i integer;e uuid;f uuid;event_i uuid;cfg jsonb;
 rules jsonb:=current_setting('finale.proof.rules')::jsonb;game_i text;before_fin jsonb;after_fin jsonb;old_ack timestamptz;topic text;
BEGIN
 INSERT INTO auth.users(id) VALUES(a),(b),(outsider);
 INSERT INTO public.profiles(id,username,is_active) VALUES(a,'Finale proof '||a,true),(b,'Finale proof '||b,true),(outsider,'Finale proof '||outsider,true)
 ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,is_active=true;
 INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,status,offer,offer_hash,accepted_at)
 VALUES(m,a,b,false,'active',jsonb_build_array(jsonb_build_object('game','run21','stake',1,'config',rules->'run21'),jsonb_build_object('game','tri-towers','stake',5,'config',rules->'tri'),jsonb_build_object('game','quintzee','stake',1,'config',rules->'quintzee')),'finale-proof',clock_timestamp());
 FOR i IN 1..3 LOOP
  game_i:=(ARRAY['run21','tri-towers','quintzee'])[i];cfg:=rules->(ARRAY['run21','tri','quintzee'])[i];
  INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,starter,actor,segment,revision,available_at,last_call_at,expires_at)
  VALUES(ids[i],m,i,game_i,(ARRAY[1,5,1])[i],cfg,b,b,1,1,statement_timestamp(),statement_timestamp()+interval '24 hours',statement_timestamp()+interval '36 hours');
  UPDATE private.delayed_children SET state=jsonb_build_object('players',jsonb_build_array(a,b),'attempts',jsonb_build_array(jsonb_build_object('actor',b,'round',3,'score',23100,'at',1000,'board',jsonb_build_object('phase','stage_complete','rules',cfg,'result',jsonb_build_object('score',23100))))) WHERE id=ids[i];
 END LOOP;
 -- Exact-topic Presence authorization on an active synthetic child, before terminal state.
 SELECT 'delayed-playing:'||m||':'||ids[1]||':'||b||':'||floor(extract(epoch FROM expires_at)*1000)::bigint INTO topic FROM private.delayed_children WHERE id=ids[1];
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 PERFORM pg_temp.review_assert(private.delayed_presence_allowed(topic,true),'actor Presence publish');
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM pg_temp.review_assert(private.delayed_presence_allowed(topic,false) AND NOT private.delayed_presence_allowed(topic,true),'observer read only');
 PERFORM pg_temp.review_assert(NOT private.delayed_presence_allowed(topic||'1',false),'wrong deadline denied');
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 PERFORM pg_temp.review_assert(NOT private.delayed_presence_allowed(topic,false),'outsider Presence denied');
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 FOREACH i IN ARRAY ARRAY[3,1,2] LOOP PERFORM private.delayed_record_outcome(ids[i],1,'normal',CASE WHEN i=2 THEN b ELSE a END,'{}');END LOOP;
 SET CONSTRAINTS ALL IMMEDIATE;
 SELECT jsonb_build_object('receipt',to_jsonb(s),'players',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.players p WHERE p.game_id=m),'batches',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.gameplay_transfer_batches t WHERE t.game_id=m),'snapshots',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.player_id) FROM public.session_player_snapshots p WHERE p.game_id=m)) INTO before_fin FROM private.delayed_settlements s WHERE s.match_id=m;
 PERFORM pg_temp.review_assert((before_fin#>>'{receipt,organizer_delta}')::int=-3,'canonical net minus three');
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM pg_temp.review_assert(NOT private.delayed_presence_allowed(topic,false),'terminal Presence denied');
 -- Model an old premature finale receipt only in this rollback-contained fixture.
 INSERT INTO private.delayed_finale_seen VALUES(m,a,clock_timestamp()) RETURNING seen_at INTO old_ack;
 FOR event_i IN SELECT id FROM private.delayed_review_events WHERE child_id IN(ids[2],ids[3]) LOOP PERFORM public.delayed_review_ack(event_i);END LOOP;
 PERFORM pg_temp.review_assert(NOT (public.delayed_home(m)->>'reviewsComplete')::boolean AND (public.delayed_home(m)->>'finaleViewed')::boolean,'old finale ACK does not bypass remaining Run21');
 PERFORM pg_temp.review_assert(NOT (public.delayed_history_detail(m)->>'reviewsComplete')::boolean,'archive uses same guard');
 BEGIN PERFORM public.delayed_finale_ack(m);RAISE EXCEPTION 'proof:early finale';EXCEPTION WHEN object_not_in_prerequisite_state THEN IF SQLERRM<>'delayed:reviews_pending' THEN RAISE;END IF;END;
 SELECT id INTO e FROM private.delayed_review_events WHERE child_id=ids[1] AND kind='attempt';
 SELECT id INTO f FROM private.delayed_review_events WHERE child_id=ids[1] AND kind='child';
 PERFORM public.delayed_review_ack(f);
 PERFORM pg_temp.review_assert(NOT (public.delayed_home(m)->>'reviewsComplete')::boolean,'child ACK cannot bypass attempt');
 PERFORM pg_temp.review_assert(NOT private.delayed_review_cleanup_eligible(x),'unseen snapshot retained') FROM private.delayed_review_events x WHERE x.id=e;
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 BEGIN PERFORM public.delayed_finale_ack(m);RAISE EXCEPTION 'proof:outsider finale';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 PERFORM pg_temp.review_assert(NOT (public.delayed_home(m)->>'reviewsComplete')::boolean,'viewer isolation');
 FOR event_i IN SELECT id FROM private.delayed_review_events WHERE match_id=m AND kind='child' LOOP PERFORM public.delayed_review_ack(event_i);END LOOP;
 PERFORM pg_temp.review_assert((public.delayed_home(m)->>'reviewsComplete')::boolean,'own attempts do not require opponent replay');
 PERFORM set_config('request.jwt.claim.sub',a::text,true);PERFORM public.delayed_review_ack(e);PERFORM public.delayed_review_ack(e);
 PERFORM pg_temp.review_assert((public.delayed_home(m)->>'reviewsComplete')::boolean,'all reviews complete');
 PERFORM public.delayed_finale_ack(m);PERFORM public.delayed_finale_ack(m);
 PERFORM pg_temp.review_assert((SELECT seen_at=old_ack FROM private.delayed_finale_seen WHERE match_id=m AND viewer=a),'old immutable finale timestamp preserved');
 SELECT jsonb_build_object('receipt',to_jsonb(s),'players',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.players p WHERE p.game_id=m),'batches',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.gameplay_transfer_batches t WHERE t.game_id=m),'snapshots',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.player_id) FROM public.session_player_snapshots p WHERE p.game_id=m)) INTO after_fin FROM private.delayed_settlements s WHERE s.match_id=m;
 PERFORM pg_temp.review_assert(before_fin=after_fin,'review actions preserve settlement, negative chips, ledger and final snapshots');
END $$;
SELECT 'PASS per-viewer finale gates, historical ACK, retained unseen snapshots, duplicate ACK, immutable financial state and exact-topic Presence authorization' proof;
