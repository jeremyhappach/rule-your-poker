-- Isolated orchestration and recovery boundaries; scoring parity is established
-- by sealed-proof.sql and the real shared-core TypeScript command corpus.
DO $$
DECLARE a uuid;b uuid;m uuid;child uuid;other_child uuid;hash text;real_i boolean;r jsonb;s jsonb;result jsonb;at_i bigint;dispatch_token_i uuid;claim jsonb;e record;who uuid;g text;choice text;winner_i int;winner uuid;loser uuid;request uuid;fp jsonb;
BEGIN
 SELECT x.a,x.b INTO a,b FROM sealed_actors x;
 FOREACH real_i IN ARRAY ARRAY[false,true] LOOP
  PERFORM set_config('request.jwt.claim.sub',a::text,true);
  m:=public.delayed_create(gen_random_uuid(),b,real_i,'[{"game":"take-two","stake":3},{"game":"quintzee","stake":3}]');
  SELECT offer_hash INTO hash FROM private.delayed_matches WHERE id=m;PERFORM set_config('request.jwt.claim.sub',b::text,true);PERFORM public.delayed_respond(m,gen_random_uuid(),hash,'accept');
  SELECT id INTO child FROM private.delayed_children WHERE match_id=m AND ordinal=1;SELECT id INTO other_child FROM private.delayed_children WHERE match_id=m AND ordinal=2;
  UPDATE private.delayed_children SET available_at=clock_timestamp()-interval '12 hours' WHERE id=child;
  FOR i IN 1..3 LOOP PERFORM pg_temp.sealed_empty(child,a);PERFORM pg_temp.sealed_empty(child,b);END LOOP;
  PERFORM pg_temp.sealed_assert((SELECT status='active' FROM private.delayed_matches WHERE id=m) AND NOT EXISTS(SELECT FROM public.games WHERE id=m) AND NOT EXISTS(SELECT FROM private.delayed_settlements WHERE match_id=m),'completed child leaves parent and sibling active without settlement');
  UPDATE private.delayed_children SET available_at=clock_timestamp()-interval '160 hours' WHERE id=other_child;
  UPDATE public.account_access SET enabled=false WHERE user_id=a;UPDATE public.profiles SET is_active=false WHERE id=a;
  BEGIN PERFORM public.delayed_sealed_load(other_child,a);RAISE EXCEPTION 'sealed_proof:disabled read admitted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  r:=public.delayed_sealed_load(other_child,a,NULL,true);PERFORM pg_temp.sealed_assert(r->>'sealed'='true','worker reads disabled participant');
  BEGIN SET LOCAL ROLE authenticated;PERFORM public.delayed_sealed_load(other_child,a,NULL,true);RAISE EXCEPTION 'sealed_proof:browser reached worker load';EXCEPTION WHEN insufficient_privilege THEN NULL;END;RESET ROLE;
  -- The real claim owner selects the sealed child without borrowing its actor.
  dispatch_token_i:=gen_random_uuid();UPDATE private.delayed_recovery_state SET enabled=true,token=dispatch_token_i,claimed=false,expires_at=clock_timestamp()+interval '1 minute' WHERE singleton;
  claim:=public.delayed_recovery_claim(dispatch_token_i);
  PERFORM pg_temp.sealed_assert(EXISTS(SELECT FROM jsonb_array_elements(claim) x WHERE x->>'id'=other_child::text AND x->>'sealed'='true'),'worker claim carries sealed identity');
  FOR i IN 1..2 LOOP FOREACH who IN ARRAY ARRAY[a,b] LOOP
   r:=public.delayed_sealed_load(other_child,who,NULL,true);at_i:=floor(extract(epoch FROM (r->>'expires_at')::timestamptz)*1000);
   result:=public.delayed_sealed_commit(other_child,who,(r->>'revision')::bigint,r->'state','tick',at_i,false);
   PERFORM pg_temp.sealed_assert(result->>'outcome'='committed','Quintzee missed round recovers');
  END LOOP;END LOOP;
  PERFORM public.delayed_recovery_complete(dispatch_token_i,NULL);UPDATE public.account_access SET enabled=true WHERE user_id=a;UPDATE public.profiles SET is_active=true WHERE id=a;
  PERFORM pg_temp.sealed_finance(m,real_i);
  FOREACH who IN ARRAY ARRAY[a,b] LOOP
   PERFORM set_config('request.jwt.claim.sub',who::text,true);
   FOR e IN SELECT id FROM private.delayed_current_review_events WHERE match_id=m LOOP PERFORM public.delayed_review_ack(e.id);END LOOP;
   PERFORM public.delayed_finale_ack(m);
  END LOOP;
  PERFORM pg_temp.sealed_assert((public.delayed_history_detail(m)->>'runbackEligible')::boolean,'last viewer receives continuation');
 END LOOP;
 FOREACH g IN ARRAY ARRAY['tri-towers','quintzee','boxdrop'] LOOP FOR winner_i IN 1..2 LOOP FOREACH choice IN ARRAY ARRAY['play','skip'] LOOP
  winner:=CASE WHEN winner_i=1 THEN a ELSE b END;loser:=CASE WHEN winner_i=1 THEN b ELSE a END;
  m:=pg_temp.sealed_fixture(g,true);SELECT id INTO child FROM private.delayed_children WHERE match_id=m;
  UPDATE private.delayed_children SET available_at=clock_timestamp()-interval '12 hours' WHERE id=child RETURNING state INTO s;
  at_i:=floor(extract(epoch FROM clock_timestamp()-interval '11 hours')*1000);
  s:=s||jsonb_build_object('round',2,'totals',jsonb_build_object(winner::text,1000000,loser::text,500),'attempts',jsonb_build_array(
   jsonb_build_object('actor',winner,'round',1,'score',500000,'at',at_i,'board','{}'::jsonb),jsonb_build_object('actor',loser,'round',1,'score',500,'at',at_i,'board','{}'::jsonb),jsonb_build_object('actor',winner,'round',2,'score',500000,'at',at_i,'board','{}'::jsonb)));
  s:=jsonb_set(s,ARRAY['parts',winner::text,'submitted'],'true');UPDATE private.delayed_children SET state=s WHERE id=child;
  r:=public.delayed_sealed_load(child,loser);s:=jsonb_set(r->'state','{attempts}',(s->'attempts')||jsonb_build_array(jsonb_build_object('actor',loser,'round',2,'score',500,'at',at_i,'board','{}'::jsonb)));
  request:=gen_random_uuid();fp:=jsonb_build_object('child',child,'revision',r->'revision','segment',r->'segment','intent',jsonb_build_object('type','take_score'));
  result:=public.delayed_sealed_commit(child,loser,(r->>'revision')::bigint,s,'action',at_i,true,request,fp);
  r:=public.delayed_sealed_load(child,winner);PERFORM pg_temp.sealed_assert(r#>>'{state,optionalBonus,actor}'=winner::text AND r#>>'{state,optionalBonus,choice}'='pending','paired completion offers canonical bonus');
  request:=gen_random_uuid();fp:=jsonb_build_object('child',child,'revision',r->'revision','segment',r->'segment','intent',jsonb_build_object('type','bonus_'||choice));
  result:=public.delayed_sealed_commit(child,winner,(r->>'revision')::bigint,r->'state','action',at_i,false,request,fp);
  PERFORM pg_temp.sealed_assert(public.delayed_sealed_commit(child,winner,(r->>'revision')::bigint,r->'state','action',at_i,false,request,fp)->>'outcome'='duplicate','bonus command idempotent');
  IF choice='play' THEN PERFORM pg_temp.sealed_assert(NOT(result#>>'{record,terminal}')::boolean,'bonus Play retains round');PERFORM pg_temp.sealed_empty(child,winner);
  ELSE PERFORM pg_temp.sealed_assert((result#>>'{record,terminal}')::boolean AND jsonb_array_length(result#>'{record,state,attempts}')=4,'bonus Skip settles with no invented attempt');END IF;
  PERFORM pg_temp.sealed_finance(m,true);
 END LOOP;END LOOP;END LOOP;
END $$;
SELECT 'PASS: sibling continuation, worker claims, disabled-account recovery, finale ACKs, both-player bonus play/skip' sealed_continuation_proof;
