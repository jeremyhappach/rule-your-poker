-- Rollback-contained exact challenge, shared rules, ACL and disclosure proof.
CREATE FUNCTION pg_temp.t2_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'take_two proof: %',label;END IF;END $$;
DO $proof$
DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();m uuid;c private.delayed_children;hash_i text;
 x jsonb;y jsonb;z jsonb;r integer;e private.delayed_review_events;pair integer[];at_i bigint:=1800000000000;
BEGIN
 INSERT INTO auth.users(id) VALUES(a),(b);
 UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id IN(a,b);
 UPDATE public.profiles SET is_active=true WHERE id IN(a,b);
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t2_assert(NOT EXISTS(SELECT FROM jsonb_array_elements(public.delayed_capabilities()->'games') g WHERE g->>'id'='take-two'),'admission initially closed');
 BEGIN PERFORM public.delayed_create(gen_random_uuid(),b,false,'[{"game":"take-two","stake":7}]');RAISE EXCEPTION 'admission bypass';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:admission_closed' THEN RAISE;END IF;END;
 RESET ROLE;
 UPDATE private.delayed_take_two_release SET enabled=true;
 SET LOCAL ROLE authenticated;
 m:=public.delayed_create(gen_random_uuid(),b,false,'[{"game":"take-two","stake":7}]');
 RESET ROLE;
 SELECT offer_hash INTO hash_i FROM private.delayed_matches WHERE id=m;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 SET LOCAL ROLE authenticated;
 PERFORM public.delayed_respond(m,gen_random_uuid(),hash_i,'accept');
 BEGIN PERFORM public.delayed_take_two_core(NULL,'deal');RAISE EXCEPTION 'browser core allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM 1 FROM private.delayed_take_two_deals;RAISE EXCEPTION 'browser decks allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 RESET ROLE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE match_id=m;
 PERFORM pg_temp.t2_assert((SELECT count(*)=3 FROM private.delayed_take_two_deals WHERE child_id=c.id),'three frozen decks');
 PERFORM pg_temp.t2_assert(c.config=private.take_two_rules('take-two/2'),'canonical config unchanged');
 FOR r IN 1..3 LOOP
  x:=public.delayed_take_two_core(c.id,'deal',r,0,NULL,NULL,NULL,at_i);
  y:=public.delayed_take_two_core(c.id,'deal',r,0,NULL,NULL,NULL,at_i+1000000);
  PERFORM pg_temp.t2_assert(x->'deck'=y->'deck' AND x->'slots'=y->'slots' AND x->'current'=y->'current','identical opportunities');
  PERFORM pg_temp.t2_assert(jsonb_array_length(x->'slots')=CASE WHEN r=1 THEN 28 ELSE 33 END,'correct round layout');
  z:=public.delayed_take_two_core(c.id,'visible',r,0,x);
  PERFORM pg_temp.t2_assert(NOT(z ?| ARRAY['deck','cursor']),'future cards private');
  x:=private.take_two_board_reduce(x,'tick',NULL,at_i+2500);
  y:=private.take_two_board_reduce(y,'tick',NULL,at_i+1002500);
  PERFORM pg_temp.t2_assert((x->>'deadline')::bigint=at_i+102500,'100-second clock');
  PERFORM pg_temp.t2_assert(private.take_two_meter(x,at_i+2500)=500 AND private.take_two_meter(x,at_i+6500)=50,'speed timing preserved');
  SELECT ARRAY(SELECT value::text::integer FROM jsonb_array_elements(p)) INTO pair FROM jsonb_array_elements(private.take_two_pairs(x)) p LIMIT 1;
  IF pair IS NOT NULL THEN
   z:=private.take_two_board_reduce(x,'pair',pair,at_i+2500);
   PERFORM pg_temp.t2_assert((z->>'score')::bigint IN(900,1700),'canonical pair scoring');
   z:=private.take_two_board_reduce(z,'take_score',NULL,at_i+2501);
   PERFORM pg_temp.t2_assert(z#>>'{result,reason}'='take_score','bank works');
  END IF;
  x:=private.take_two_board_reduce(x||'{"score":500}','draw',NULL,at_i+6500);
  y:=private.take_two_board_reduce(y,'draw',NULL,at_i+1006500);
  PERFORM pg_temp.t2_assert(x->'current'=y->'current' AND (x->>'score')::int=400 AND private.take_two_meter(x,at_i+6500)=500,'draw order penalty and reset');
  z:=private.take_two_board_reduce(x,'tick',NULL,at_i+102500);
  PERFORM pg_temp.t2_assert(z#>>'{result,reason}'='timeout' AND z#>>'{result,timeBonus}'='0','exact timeout');
 END LOOP;
 x:=public.delayed_take_two_core(c.id,'deal',1,0,NULL,NULL,NULL,at_i);
 x:=private.take_two_board_reduce(x,'tick',NULL,at_i+2500);
 x:=private.take_two_board_reduce(x,'take_score',NULL,at_i+2600);
 INSERT INTO private.delayed_review_events(child_id,match_id,event_key,kind,actor,round,score,completed_at,receipt)
 VALUES(c.id,m,c.id||':'||a||':1','attempt',a,1,0,clock_timestamp(),jsonb_build_object('game','take-two','rules',c.config,'result',x->'result')) RETURNING * INTO e;
 INSERT INTO private.delayed_review_boards VALUES(e.id,private.delayed_review_board('take-two',x));
 PERFORM set_config('request.jwt.claim.sub',b::text,true);SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t2_assert(public.delayed_reviews(c.id)->'events'='[]','opponent review embargo');
 BEGIN PERFORM public.delayed_review_begin(e.id);RAISE EXCEPTION 'begin bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.delayed_review_ack(e.id);RAISE EXCEPTION 'ack bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 RESET ROLE;
 INSERT INTO private.delayed_review_events(child_id,match_id,event_key,kind,actor,round,score,completed_at,receipt)
 VALUES(c.id,m,c.id||':'||b||':1','attempt',b,1,0,clock_timestamp(),jsonb_build_object('game','take-two','rules',c.config,'result',x->'result'));
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t2_assert(jsonb_array_length(public.delayed_reviews(c.id)->'events')=1,'review unlocks after own matching round');
 PERFORM public.delayed_review_begin(e.id);PERFORM public.delayed_review_ack(e.id);PERFORM public.delayed_review_ack(e.id);
 RESET ROLE;
 PERFORM pg_temp.t2_assert((SELECT count(*)=1 FROM private.delayed_review_seen WHERE event_id=e.id AND viewer=b),'ack once');
 BEGIN UPDATE private.delayed_take_two_deals SET deck='[]' WHERE child_id=c.id;RAISE EXCEPTION 'deal changed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $proof$;
SELECT 'PASS identical challenges, canonical timing/scoring, private stock, review embargo and ACLs' AS take_two_checks;
