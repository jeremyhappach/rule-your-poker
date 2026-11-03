-- Run inside BEGIN/ROLLBACK against the candidate and installed authority.
-- All identities and matches are synthetic; no historical rows are changed.
CREATE TEMP TABLE rb_checks(label text);
CREATE FUNCTION pg_temp.rb_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'runback proof: %',label;END IF;END $$;
DO $proof$
DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();outside_i uuid:=gen_random_uuid();m uuid;n uuid;repeat_i uuid;req uuid;
 c record;e record;actor_i uuid;real_i boolean;caps jsonb;lineup_i jsonb;h jsonb;before_i jsonb;after_i jsonb;bad jsonb;
 hash_i text;history_i jsonb;accounts_i bigint;settlements_i bigint;
BEGIN
 INSERT INTO auth.users(id) VALUES(a),(b),(outside_i);
 INSERT INTO public.profiles(id,username,is_active)
 VALUES(a,'Runback release '||a,true),(b,'Runback release '||b,true),(outside_i,'Runback release '||outside_i,true)
 ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,is_active=true;
 FOREACH real_i IN ARRAY ARRAY[false,true] LOOP
  PERFORM set_config('request.jwt.claim.sub',a::text,true);
  SET LOCAL ROLE authenticated;
  caps:=public.delayed_capabilities();
  lineup_i:=jsonb_build_array(
   jsonb_build_object('game',caps->'games'->2->>'id','stake',7,'config',caps->'games'->2->'rules'),
   jsonb_build_object('game',caps->'games'->1->>'id','stake',9,'config',caps->'games'->1->'rules'),
   jsonb_build_object('game',caps->'games'->2->>'id','stake',11,'config',caps->'games'->2->'rules'));
  req:=gen_random_uuid();m:=public.delayed_create(req,b,real_i,lineup_i);
  PERFORM pg_temp.rb_assert(public.delayed_create(req,b,real_i,lineup_i)=m,'duplicate create receipt');
  RESET ROLE;
  SELECT offer_hash INTO hash_i FROM private.delayed_matches WHERE id=m;
  PERFORM set_config('request.jwt.claim.sub',b::text,true);
  SET LOCAL ROLE authenticated;
  PERFORM public.delayed_respond(m,gen_random_uuid(),hash_i,'accept');
  RESET ROLE;
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=m ORDER BY ordinal LOOP
   PERFORM private.delayed_record_outcome(c.id,c.revision,'normal',a,'{}');
  END LOOP;
  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT count(*) INTO accounts_i FROM public.player_transactions;
  SELECT count(*) INTO settlements_i FROM private.delayed_settlements;
  SELECT jsonb_build_object('offer',offer,'realMoney',real_money,'policy',policy_version) INTO history_i FROM private.delayed_matches WHERE id=m;
  FOREACH actor_i IN ARRAY ARRAY[a,b] LOOP
   PERFORM set_config('request.jwt.claim.sub',actor_i::text,true);
   FOR e IN SELECT id FROM private.delayed_review_events WHERE match_id=m LOOP
    SET LOCAL ROLE authenticated;PERFORM public.delayed_review_ack(e.id);RESET ROLE;
   END LOOP;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub',a::text,true);
  SET LOCAL ROLE authenticated;h:=public.delayed_history_detail(m);RESET ROLE;
  SELECT jsonb_agg(jsonb_build_object('game',v->>'game','stake',v->'stake','config',v->'config') ORDER BY (v->>'ordinal')::int)
   INTO before_i FROM jsonb_array_elements(h->'lineup') v;
  PERFORM pg_temp.rb_assert(before_i=lineup_i AND (h->>'realMoney')::boolean=real_i AND (h->>'opponentEligible')::boolean,'exact source order/rules/stakes/mode/recipient');
  PERFORM pg_temp.rb_assert(NOT (h->>'runbackEligible')::boolean,'no pre-ACK eligibility');
  SET LOCAL ROLE authenticated;PERFORM public.delayed_finale_ack(m);h:=public.delayed_history_detail(m);RESET ROLE;
  PERFORM pg_temp.rb_assert(NOT (h->>'runbackEligible')::boolean,'first viewer not eligible');
  PERFORM set_config('request.jwt.claim.sub',b::text,true);
  SET LOCAL ROLE authenticated;PERFORM public.delayed_finale_ack(m);h:=public.delayed_history_detail(m);PERFORM public.delayed_finale_ack(m);RESET ROLE;
  PERFORM pg_temp.rb_assert((h->>'runbackEligible')::boolean,'last viewer eligible');
  PERFORM set_config('request.jwt.claim.sub',a::text,true);
  SET LOCAL ROLE authenticated;PERFORM public.delayed_finale_ack(m);h:=public.delayed_history_detail(m);RESET ROLE;
  PERFORM pg_temp.rb_assert(NOT (h->>'runbackEligible')::boolean AND (SELECT count(*) FROM private.delayed_runback_viewers WHERE match_id=m)=1,'replay keeps one immutable shortcut owner');
  PERFORM pg_temp.rb_assert((SELECT count(*) FROM public.player_transactions)=accounts_i AND (SELECT count(*) FROM private.delayed_settlements)=settlements_i,'template reads and ACKs create zero financial writes');
  INSERT INTO rb_checks VALUES('exact template and first/last/replayed ACK; zero finance, real='||real_i);
  FOREACH actor_i IN ARRAY ARRAY[a,b] LOOP
   PERFORM set_config('request.jwt.claim.sub',actor_i::text,true);
   req:=gen_random_uuid();SET LOCAL ROLE authenticated;
   n:=public.delayed_create(req,CASE actor_i WHEN a THEN b ELSE a END,real_i,lineup_i);
   PERFORM pg_temp.rb_assert(public.delayed_create(req,CASE actor_i WHEN a THEN b ELSE a END,real_i,lineup_i)=n,'lost response retry returns same invitation');
   repeat_i:=public.delayed_create(gen_random_uuid(),CASE actor_i WHEN a THEN b ELSE a END,real_i,lineup_i);
   RESET ROLE;
   PERFORM pg_temp.rb_assert(n<>m AND n<>repeat_i AND (SELECT status='invited' FROM private.delayed_matches WHERE id=n),'intentional reuse creates independent invitation');
   PERFORM pg_temp.rb_assert(NOT EXISTS(SELECT FROM public.games WHERE id IN(n,repeat_i)) AND NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id IN(n,repeat_i)),'new invitations have no prior/new reservations or finance');
  END LOOP;
  SELECT jsonb_build_object('offer',offer,'realMoney',real_money,'policy',policy_version) INTO after_i FROM private.delayed_matches WHERE id=m;
  PERFORM pg_temp.rb_assert(after_i=history_i,'original historical settings unchanged');
  INSERT INTO rb_checks VALUES('both participants repeated reuse; duplicate dedupe; no obligations or history mutation, real='||real_i);
  PERFORM set_config('request.jwt.claim.sub',outside_i::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.delayed_history_detail(m);RAISE EXCEPTION 'proof:outsider read';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  BEGIN PERFORM public.delayed_finale_ack(m);RAISE EXCEPTION 'proof:outsider ACK';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',a::text,true);
  bad:=jsonb_set(lineup_i,'{0,config,unsupported}', 'true');
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.delayed_create(gen_random_uuid(),b,real_i,bad);RAISE EXCEPTION 'proof:bad config accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:unsupported_configuration' THEN RAISE;END IF;END;
  RESET ROLE;
  UPDATE public.profiles SET is_active=false WHERE id=b;
  SET LOCAL ROLE authenticated;h:=public.delayed_history_detail(m);
  BEGIN PERFORM public.delayed_create(gen_random_uuid(),b,real_i,lineup_i);RAISE EXCEPTION 'proof:inactive accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  n:=public.delayed_create(gen_random_uuid(),outside_i,real_i,lineup_i);RESET ROLE;
  PERFORM pg_temp.rb_assert(NOT (h->>'opponentEligible')::boolean AND (SELECT opponent=outside_i FROM private.delayed_matches WHERE id=n),'inactive original stays explicit; eligible replacement accepted');
  UPDATE public.profiles SET is_active=true WHERE id=b;
  INSERT INTO rb_checks VALUES('stranger authorization, incompatible rules and recipient recovery, real='||real_i);
 END LOOP;
 PERFORM pg_temp.rb_assert(NOT has_table_privilege('authenticated','private.delayed_runback_viewers','SELECT') AND NOT has_table_privilege('anon','private.delayed_runback_viewers','INSERT'),'private receipt ACL');
 PERFORM pg_temp.rb_assert((SELECT relrowsecurity FROM pg_class WHERE oid='private.delayed_runback_viewers'::regclass),'private receipt RLS');
 INSERT INTO rb_checks VALUES('shortcut receipt RLS/ACL');
END $proof$;
SELECT jsonb_agg(label ORDER BY label) AS runback_checks FROM rb_checks;
