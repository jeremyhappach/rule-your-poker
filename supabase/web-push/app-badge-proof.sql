-- Synthetic fixtures, BEGIN/ROLLBACK only; never dispatch a real push.
CREATE FUNCTION pg_temp.badge_check(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'App badge: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.badge_parity() RETURNS void LANGUAGE plpgsql AS $$
DECLARE lobby jsonb:=public.delayed_lobby();h jsonb;c jsonb;n int:=0;who text:=auth.uid()::text;
BEGIN
 FOR h IN SELECT value FROM jsonb_array_elements(lobby->'matches') LOOP
  FOR c IN SELECT value FROM jsonb_array_elements(h->'lineup') LOOP
   IF (c->>'terminal')::boolean AND c->>'viewed'='false' THEN n:=n+1;
   ELSIF h->>'status'='active' AND h->>'held'='false' AND h->>'removedAt' IS NULL
    AND c->>'terminal'='false' AND c->>'playable'='true'
    AND (c->>'untimed'='true' OR coalesce(c->>'playableDeadline',c->>'expiresAt')::timestamptz>statement_timestamp())
    THEN n:=n+1;
   END IF;
  END LOOP;
  IF h->>'status'='settled' AND h->>'removedAt' IS NULL AND h->>'receipt' IS NOT NULL
   AND h->>'reviewsComplete'='true' AND h->>'finaleViewed'='false' THEN n:=n+1; END IF;
 END LOOP;
 PERFORM pg_temp.badge_check((lobby#>>'{badge,count}')::int=n,'parity with existing turn/result/finale projection');
 PERFORM pg_temp.badge_check(lobby->'badge'=private.async_badge_snapshot(auth.uid()),'shared lobby snapshot');
END $$;
DO $$
DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();u uuid;m uuid;e uuid;req uuid;
 c private.delayed_children;money boolean;tie_i boolean;outcome jsonb;before_row jsonb;
 sid uuid:=gen_random_uuid();device uuid:=gen_random_uuid();lease_i uuid:=gen_random_uuid();job jsonb;v bigint;
BEGIN
 FOREACH u IN ARRAY ARRAY[a,b,outsider] LOOP
  INSERT INTO auth.users(id) VALUES(u);
  UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=u;
  UPDATE public.profiles SET is_active=true WHERE id=u;
 END LOOP;
 PERFORM pg_temp.badge_check(NOT has_function_privilege('authenticated','private.async_badge_snapshot(uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','private.async_badge_snapshot(uuid)','EXECUTE')
  AND NOT has_function_privilege('service_role','private.async_badge_snapshot(uuid)','EXECUTE'),'private helper inaccessible');
 PERFORM pg_temp.badge_check(NOT has_function_privilege('authenticated','public.async_push_authorize(uuid,uuid,uuid)','EXECUTE'),'push stays service-only');
 FOREACH money IN ARRAY ARRAY[false,true] LOOP FOREACH tie_i IN ARRAY ARRAY[false,true] LOOP
  PERFORM set_config('request.jwt.claim.sub',a::text,true);req:=gen_random_uuid();
  m:=public.delayed_create(req,b,money,'[{"game":"quintzee","stake":5},{"game":"quintzee","stake":5}]');
  PERFORM pg_temp.badge_check(public.delayed_create(req,b,money,'[{"game":"quintzee","stake":5},{"game":"quintzee","stake":5}]')=m,'invitation replay');
  PERFORM set_config('request.jwt.claim.sub',b::text,true);PERFORM pg_temp.badge_parity();
  PERFORM pg_temp.badge_check((private.async_badge_snapshot(b)->>'count')::int=0,'invitations excluded');
  PERFORM public.delayed_respond(m,gen_random_uuid(),(SELECT offer_hash FROM private.delayed_matches WHERE id=m),'accept');
  PERFORM pg_temp.badge_parity();
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=m ORDER BY ordinal LOOP
   PERFORM set_config('request.jwt.claim.sub',c.actor::text,true);PERFORM pg_temp.badge_parity();
   INSERT INTO private.delayed_incidents(match_id,reason) VALUES(m,'badge rollback hold');
   PERFORM pg_temp.badge_parity();DELETE FROM private.delayed_incidents WHERE match_id=m;
   outcome:=private.delayed_record_outcome(c.id,c.revision,CASE WHEN tie_i THEN 'draw' ELSE 'normal' END,CASE WHEN NOT tie_i THEN a END,'{"proof":"app-badge"}');
   PERFORM pg_temp.badge_check(private.delayed_record_outcome(c.id,c.revision,CASE WHEN tie_i THEN 'draw' ELSE 'normal' END,CASE WHEN NOT tie_i THEN a END,'{"proof":"app-badge"}')=outcome,'outcome duplicate and late replay');
   SELECT id INTO e FROM private.delayed_current_review_events WHERE child_id=c.id AND kind='child';
   FOREACH u IN ARRAY ARRAY[a,b] LOOP
    PERFORM set_config('request.jwt.claim.sub',u::text,true);PERFORM pg_temp.badge_parity();
    PERFORM public.delayed_review_ack(e);PERFORM public.delayed_review_ack(e);PERFORM pg_temp.badge_parity();
   END LOOP;
  END LOOP;
  PERFORM pg_temp.badge_check((private.async_badge_snapshot(a)->>'count')::int=1,'one eligible unread finale');
  FOREACH u IN ARRAY ARRAY[a,b] LOOP
   PERFORM set_config('request.jwt.claim.sub',u::text,true);
   PERFORM public.delayed_finale_ack(m);PERFORM public.delayed_finale_ack(m);PERFORM pg_temp.badge_parity();
   PERFORM pg_temp.badge_check((private.async_badge_snapshot(u)->>'count')::int=0,'acknowledgement reaches zero');
  END LOOP;
  PERFORM pg_temp.badge_check((SELECT count(*)=2 AND sum(chips)=0 AND sum(abs(chips))=CASE WHEN tie_i THEN 0 ELSE 20 END FROM public.players WHERE game_id=m),'canonical chips preserved');
  PERFORM pg_temp.badge_check(NOT EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE game_id=m AND unmatched_deltas<>'{}'::jsonb),'balanced canonical ledger');
 END LOOP; END LOOP;
 -- Untimed and simultaneous Five Alive eligibility use existing game owners.
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 m:=public.delayed_create(gen_random_uuid(),b,false,'[{"game":"chess","stake":5},{"game":"five-alive","stake":5}]');
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 PERFORM public.delayed_respond(m,gen_random_uuid(),(SELECT offer_hash FROM private.delayed_matches WHERE id=m),'accept');
 FOREACH u IN ARRAY ARRAY[a,b] LOOP PERFORM set_config('request.jwt.claim.sub',u::text,true);PERFORM pg_temp.badge_parity(); END LOOP;
 PERFORM pg_temp.badge_check((SELECT expires_at IS NULL FROM private.delayed_children WHERE match_id=m AND game_type='chess'),'untimed Chess');
 -- Snapshot reads leave persistent gameplay untouched.
 SELECT jsonb_agg(to_jsonb(ch)) INTO before_row FROM private.delayed_children ch WHERE match_id=m;
 PERFORM private.async_badge_snapshot(a);PERFORM private.async_badge_snapshot(b);
 PERFORM pg_temp.badge_check(before_row=(SELECT jsonb_agg(to_jsonb(ch)) FROM private.delayed_children ch WHERE match_id=m),'read-only projection');
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);SET LOCAL ROLE authenticated;
 PERFORM pg_temp.badge_check(public.delayed_lobby()#>>'{badge,count}'='0','outsider sees zero');
 RESET ROLE;
 -- Authorized existing visible push carries the complete recipient count.
 INSERT INTO auth.sessions(id,user_id) VALUES(sid,a);
 INSERT INTO private.push_defaults(user_id,enabled,invitations_enabled) VALUES(a,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,invitations_enabled=true;
 INSERT INTO private.push_subscriptions(id,user_id,session_id,endpoint,p256dh,auth_secret)
  VALUES(device,a,sid,'https://web.push.apple.com/rollback-badge-'||device,repeat('B',87),repeat('A',22));
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 m:=public.delayed_create(gen_random_uuid(),a,false,'[{"game":"quintzee","stake":5}]');
 SET CONSTRAINTS ALL IMMEDIATE;
 SELECT id INTO e FROM private.push_events WHERE match_id=m AND user_id=a AND kind='invite';
 UPDATE private.push_deliveries SET state='sending',lease=lease_i,lease_until=now()+interval '90 seconds' WHERE event_id=e AND subscription_id=device;
 SET LOCAL ROLE service_role;job:=public.async_push_authorize(e,device,lease_i);RESET ROLE;
 PERFORM pg_temp.badge_check(job#>'{payload,badge}'=private.async_badge_snapshot(a),'push and lobby count share same snapshot');
 PERFORM pg_temp.badge_check(public.async_push_authorize(e,device,gen_random_uuid()) IS NULL,'invalid lease');
 UPDATE private.push_defaults SET quiet_enabled=true,quiet_start='00:00',quiet_end='00:00' WHERE user_id=a;
 PERFORM pg_temp.badge_check(public.async_push_authorize(e,device,lease_i) IS NULL,'quiet hours preserved');
 v:=(private.async_badge_snapshot(a)->>'version')::bigint;
 PERFORM pg_temp.badge_check(v>0 AND v<9007199254740991,'safe server ordering token');
END $$;
SELECT 'PASS: combined counts; actual turns/reviews/finales; both money modes and ties; replay/zero; Chess/Five Alive; privacy; visible push; lease and quiet guards; read-only counts' AS proof;
