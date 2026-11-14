-- Run inside BEGIN/ROLLBACK, after the candidate migration or against installed
-- authority. Existing matches are read only; all fixtures are synthetic.
CREATE FUNCTION pg_temp.review_type_assert(ok boolean,label text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'review_type:%',label; END IF; END $f$;

CREATE TEMP TABLE review_type_before ON COMMIT DROP AS
SELECT 'child' kind,id,to_jsonb(c) value FROM private.delayed_children c
UNION ALL SELECT 'match',id,to_jsonb(m) FROM private.delayed_matches m;
CREATE TEMP TABLE review_type_counts ON COMMIT DROP AS SELECT
 (SELECT count(*) FROM public.player_transactions) transactions,
 (SELECT count(*) FROM public.gameplay_transfer_batches) batches,
 (SELECT count(*) FROM private.delayed_current_outcomes) outcomes,
 (SELECT count(*) FROM private.delayed_review_seen) seen,
 (SELECT count(*) FROM private.delayed_review_playback) playback;

DO $proof$
DECLARE
 a constant uuid:='d7dc1928-3727-4351-b0ff-0e80c81c2953';
 target constant uuid:='e5c6ddff-2129-49b7-9add-7183ec8816ca';
 expected_event constant uuid:='b1b6ef06-3d6a-4e20-baee-018fe52549a2';
 entry record;who uuid;r jsonb;again jsonb;n integer:=0;
BEGIN
 -- Exact owner report: opponent Round 2 and saved board remain available.
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 SET LOCAL ROLE authenticated;
 r:=public.delayed_reviews(target);
 again:=public.delayed_reviews(target);
 PERFORM pg_temp.review_type_assert((r-'serverAt')=(again-'serverAt'),'repeat read');
 PERFORM pg_temp.review_type_assert(EXISTS(SELECT FROM jsonb_array_elements(r->'events') e
  WHERE e->>'id'=expected_event::text AND e->>'round'='2' AND e->'board'<>'null'::jsonb),'reported saved round');
 RESET ROLE;
 -- All retained children, both participants: active, terminal, completed winner/
 -- tie receipts, old turns, and the corrected Chess generation use the same RPC.
 FOR entry IN SELECT c.id,m.organizer,m.opponent FROM private.delayed_children c
  JOIN private.delayed_matches m ON m.id=c.match_id
  WHERE m.status IN('active','settled') AND NOT EXISTS(
   SELECT FROM private.delayed_removals d WHERE d.match_id=m.id) LOOP
  FOREACH who IN ARRAY ARRAY[entry.organizer,entry.opponent] LOOP
   PERFORM set_config('request.jwt.claim.sub',who::text,true);
   SET LOCAL ROLE authenticated;
   r:=public.delayed_reviews(entry.id);
   RESET ROLE;
   PERFORM pg_temp.review_type_assert(NOT EXISTS(SELECT FROM jsonb_array_elements(r->'events') e
    WHERE NOT EXISTS(SELECT FROM private.delayed_current_review_events current_event
     WHERE current_event.id=(e->>'id')::uuid AND current_event.child_id=entry.id)),'current generation only');
   n:=n+1;
  END LOOP;
 END LOOP;
 PERFORM pg_temp.review_type_assert(n>0,'retained participant projections');
 PERFORM set_config('review_type.projections',n::text,true);
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.delayed_reviews(target);RAISE EXCEPTION 'review_type:outsider accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub','',true);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.delayed_reviews(target);RAISE EXCEPTION 'review_type:missing identity accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
 SET LOCAL ROLE anon;
 BEGIN PERFORM public.delayed_reviews(target);RAISE EXCEPTION 'review_type:anonymous accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
 PERFORM pg_temp.review_type_assert(NOT EXISTS(
  SELECT FROM review_type_before b WHERE b.value IS DISTINCT FROM CASE b.kind
   WHEN 'child' THEN (SELECT to_jsonb(c) FROM private.delayed_children c WHERE c.id=b.id)
   ELSE (SELECT to_jsonb(m) FROM private.delayed_matches m WHERE m.id=b.id) END),'existing state and clocks unchanged');
END $proof$;

DO $privacy$
DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();m uuid;child uuid;e uuid;game text;
 r jsonb;config_i jsonb;
BEGIN
 INSERT INTO auth.users(id) VALUES(a),(b);
 UPDATE public.profiles SET username='Async review proof '||id WHERE id IN(a,b);
 -- Only projection fixtures: no gameplay, settlement, or financial entry point.
 FOREACH game IN ARRAY ARRAY['take-two','crib-lab'] LOOP
  m:=gen_random_uuid();child:=gen_random_uuid();
  config_i:=jsonb_build_object('sharedDeck',true);
  INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,status,offer,offer_hash,accepted_at)
   VALUES(m,a,b,false,'active','[]','review-type-proof',clock_timestamp());
  INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,starter,actor,segment,revision,
   available_at,last_call_at,expires_at,state)
   VALUES(child,m,1,game,1,config_i,a,b,1,1,statement_timestamp(),statement_timestamp()+interval '24 hours',
    statement_timestamp()+interval '36 hours',jsonb_build_object('players',jsonb_build_array(a,b),'attempts','[]'::jsonb));
  INSERT INTO private.delayed_review_events(child_id,match_id,event_key,kind,actor,round,score,completed_at,receipt)
   VALUES(child,m,child||':'||a||':1','attempt',a,1,100,clock_timestamp(),jsonb_build_object('game',game))
   RETURNING id INTO e;
  INSERT INTO private.delayed_review_boards VALUES(e,'{"saved":"opponent round"}');
  PERFORM set_config('request.jwt.claim.sub',b::text,true);SET LOCAL ROLE authenticated;
  r:=public.delayed_reviews(child);
  PERFORM pg_temp.review_type_assert(r->'events'='[]','same-deck embargo '||game);
  BEGIN PERFORM public.delayed_review_begin(e);RAISE EXCEPTION 'review_type:begin bypass';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  BEGIN PERFORM public.delayed_review_ack(e);RAISE EXCEPTION 'review_type:ack bypass';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  RESET ROLE;
  INSERT INTO private.delayed_review_events(child_id,match_id,event_key,kind,actor,round,score,completed_at,receipt)
   VALUES(child,m,child||':'||b||':1','attempt',b,1,80,clock_timestamp(),jsonb_build_object('game',game));
  SET LOCAL ROLE authenticated;
  r:=public.delayed_reviews(child);
  PERFORM pg_temp.review_type_assert(jsonb_array_length(r->'events')=1
   AND r#>>'{events,0,id}'=e::text AND r#>>'{events,0,board,saved}'='opponent round','matching round unlock '||game);
  RESET ROLE;
 END LOOP;
 PERFORM pg_temp.review_type_assert(EXISTS(SELECT FROM review_type_counts c WHERE
  c.transactions=(SELECT count(*) FROM public.player_transactions)
  AND c.batches=(SELECT count(*) FROM public.gameplay_transfer_batches)
  AND c.outcomes=(SELECT count(*) FROM private.delayed_current_outcomes)
  AND c.seen=(SELECT count(*) FROM private.delayed_review_seen)
  AND c.playback=(SELECT count(*) FROM private.delayed_review_playback)),'zero financial or acknowledgement writes');
 PERFORM pg_temp.review_type_assert(has_function_privilege('authenticated','public.delayed_reviews(uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.delayed_reviews(uuid)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.delayed_reviews(uuid)','EXECUTE'),'unchanged execution grants');
END $privacy$;
SELECT 'PASS exact Quintzee result, participant projections, repeat reads, authorization, corrected generation, same-deck privacy, unchanged state/clocks/finances/ACKs' AS proof,
 current_setting('review_type.projections')::integer AS participant_projections;
