-- Run only in a rollback transaction. Synthetic rows; no worker sweep or sends.
CREATE FUNCTION pg_temp.rmp_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'push proof: %',label; END IF; END $$;
CREATE TEMP TABLE rmp_context(a uuid,b uuid,sid uuid,subscription uuid,old_match uuid,old_child uuid);
INSERT INTO rmp_context VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
INSERT INTO auth.users(id) SELECT a FROM rmp_context UNION ALL SELECT b FROM rmp_context;
INSERT INTO public.profiles(id,username,is_active) SELECT a,'Push proof '||a,true FROM rmp_context UNION ALL SELECT b,'Push proof '||b,true FROM rmp_context
 ON CONFLICT(id) DO UPDATE SET is_active=true;
INSERT INTO auth.sessions(id,user_id) SELECT sid,a FROM rmp_context;
INSERT INTO private.push_defaults(user_id,enabled,invitations_enabled) SELECT a,true,true FROM rmp_context;
INSERT INTO private.push_subscriptions(id,user_id,session_id,endpoint,p256dh,auth_secret)
 SELECT subscription,a,sid,'https://web.push.apple.com/rollback-proof-'||subscription,repeat('B',87),repeat('A',22) FROM rmp_context;
INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash,status,accepted_at)
 SELECT old_match,b,a,true,'{}','push-baseline-proof','active',now() FROM rmp_context;
INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,actor,segment,available_at,last_call_at,expires_at)
 SELECT old_child,old_match,1,'run21',1,'{}',a,1,now(),now()+interval '24 hours',now()+interval '36 hours' FROM rmp_context;
SET CONSTRAINTS ALL IMMEDIATE;
CREATE TEMP TABLE rmp_baseline AS SELECT count(*) AS events FROM private.push_events WHERE match_id=(SELECT old_match FROM rmp_context);
SELECT pg_temp.rmp_assert((SELECT events FROM rmp_baseline)=CASE WHEN position('AND NOT m.real_money' in pg_get_functiondef('private.push_sync(uuid)'::regprocedure))>0 THEN 0 ELSE 2 END,'real turn matches pre/post deployment authority');
