-- Standalone hosted rollback proof. No provider calls or global claim sweep.
BEGIN;
SET LOCAL statement_timeout='20s';
CREATE FUNCTION pg_temp.df_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'delivery-first proof: %',label; END IF; END $$;
CREATE TEMP TABLE df_context(a uuid,b uuid,sid uuid,subscription uuid,m uuid,c uuid,c2 uuid);
INSERT INTO df_context VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
-- Test the deployed owner bodies. Only the approved predicate is transformed
-- before installation. Scope the claim's initial scan to the synthetic device.
DO $$
DECLARE source text; target text;
 old_guard text := 'e.kind IN(''table_open'',''turn'',''last_call'') AND private.push_user_active(e.user_id)';
 new_guard text := 'e.kind=''table_open'' AND private.push_user_active(e.user_id)';
BEGIN
 FOREACH target IN ARRAY ARRAY['claim','authorize'] LOOP
  source:=pg_get_functiondef(CASE target WHEN 'claim' THEN 'public.async_push_claim()'::regprocedure ELSE 'public.async_push_authorize(uuid,uuid,uuid)'::regprocedure END);
  PERFORM pg_temp.df_assert((length(source)-length(replace(source,old_guard,''))=length(old_guard)) OR
   (strpos(source,old_guard)=0 AND length(source)-length(replace(source,new_guard,''))=length(new_guard)),'exact recognized presence guard');
  source:=replace(source,old_guard,new_guard);
  PERFORM pg_temp.df_assert(strpos(source,'private.push_quiet_at')>0 AND strpos(source,'private.push_eligible')>0,'quiet and eligibility guards retained');
  source:=replace(source,'public.async_push_'||target,'pg_temp.df_'||target);
  IF target='claim' THEN
   PERFORM pg_temp.df_assert(strpos(source,'FROM private.push_deliveries WHERE state')>0,'recognized claim scan');
   source:=replace(source,'FROM private.push_deliveries WHERE state','FROM private.push_deliveries WHERE subscription_id=(SELECT subscription FROM pg_temp.df_context) AND state');
  END IF;
  EXECUTE source;
 END LOOP;
END $$;
INSERT INTO auth.users(id) SELECT a FROM df_context UNION ALL SELECT b FROM df_context;
UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id IN(SELECT a FROM df_context UNION ALL SELECT b FROM df_context);
INSERT INTO public.profiles(id,username,is_active)
 SELECT a,'Push delivery-first proof '||a,true FROM df_context UNION ALL SELECT b,'Push delivery-first proof '||b,true FROM df_context
 ON CONFLICT(id) DO UPDATE SET is_active=true,username=excluded.username;
INSERT INTO auth.sessions(id,user_id) SELECT sid,a FROM df_context;
INSERT INTO private.push_defaults(user_id,enabled,invitations_enabled) SELECT a,true,true FROM df_context;
INSERT INTO private.push_subscriptions(id,user_id,session_id,endpoint,p256dh,auth_secret)
 SELECT subscription,a,sid,'https://web.push.apple.com/rollback-delivery-first-'||subscription,repeat('B',87),repeat('A',22) FROM df_context;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE x df_context; money boolean; q jsonb; job jsonb; first_event uuid; second_event uuid; invite uuid; event_i uuid; lease_i uuid;
BEGIN
 SELECT * INTO x FROM df_context;
 INSERT INTO public.voice_presence_heartbeats(user_id,tab_id,status,interaction_age_ms) VALUES(x.a,'delivery-first-phone','active',0);
 FOREACH money IN ARRAY ARRAY[false,true] LOOP
  x.m:=gen_random_uuid();x.c:=gen_random_uuid();x.c2:=gen_random_uuid();
  INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash,status,accepted_at)
   VALUES(x.m,x.b,x.a,money,'{}','delivery-first-proof','active',now());
  INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,actor,segment,available_at,last_call_at,expires_at)
   VALUES(x.c,x.m,1,'run21',1,'{}',x.a,1,now(),now()+interval '24 hours',now()+interval '36 hours');
  PERFORM pg_temp.df_assert(private.push_user_active(x.a),'fixture is actively using the app');
  q:=pg_temp.df_claim();first_event:=(q->>'eventId')::uuid;
  PERFORM pg_temp.df_assert(first_event IS NOT NULL,'active turn is claimed');
  job:=pg_temp.df_authorize(first_event,x.subscription,(q->>'lease')::uuid);
  PERFORM pg_temp.df_assert(job->'payload'->>'kind'='turn' AND job->'payload'->>'opponentName'='Push delivery-first proof '||x.b,'active turn authorized with opponent name');
  PERFORM pg_temp.df_assert(pg_temp.df_claim() IS NULL,'same pending cycle cannot be claimed twice');
  PERFORM pg_temp.df_assert(public.async_push_receipt(first_event,x.subscription,(q->>'lease')::uuid,'retry'),'retry receipt accepted');
  PERFORM pg_temp.df_assert(NOT public.async_push_receipt(first_event,x.subscription,(q->>'lease')::uuid,'sent'),'stale duplicate receipt rejected');
  UPDATE private.push_deliveries SET retry_at=clock_timestamp()-interval '1 second' WHERE event_id=first_event AND subscription_id=x.subscription;
  q:=pg_temp.df_claim();
  PERFORM pg_temp.df_assert((q->>'eventId')::uuid=first_event,'retry retains event identity');
  PERFORM pg_temp.df_assert(public.async_push_receipt(first_event,x.subscription,(q->>'lease')::uuid,'sent'),'sent receipt accepted');
  INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,actor,segment,available_at,last_call_at,expires_at)
   VALUES(x.c2,x.m,2,'tri-towers',1,'{}',x.a,1,now(),now()+interval '24 hours',now()+interval '36 hours');
  PERFORM pg_temp.df_assert((SELECT count(*)=1 FROM private.push_events WHERE match_id=x.m AND user_id=x.a AND kind='turn'),'later child stays in same availability cycle');
  UPDATE private.delayed_children SET actor=x.b WHERE match_id=x.m;
  UPDATE private.delayed_children SET actor=x.a,segment=segment+1 WHERE id=x.c;
  q:=pg_temp.df_claim();second_event:=(q->>'eventId')::uuid;
  PERFORM pg_temp.df_assert(second_event IS NOT NULL AND second_event<>first_event,'clear then rearm emits a fresh event');
  PERFORM pg_temp.df_assert((SELECT count(*)=2 FROM private.push_events WHERE match_id=x.m AND user_id=x.a AND kind='turn'),'exactly one event per availability cycle');
  PERFORM pg_temp.df_assert(pg_temp.df_authorize(first_event,x.subscription,(q->>'lease')::uuid) IS NULL,'old-cycle replay rejected');
  PERFORM pg_temp.df_assert(pg_temp.df_authorize(second_event,x.subscription,gen_random_uuid()) IS NULL,'foreign lease rejected');
  UPDATE private.push_match_preferences SET enabled=false WHERE match_id=x.m AND user_id=x.a;
  PERFORM pg_temp.df_assert(pg_temp.df_authorize(second_event,x.subscription,(q->>'lease')::uuid) IS NULL,'authorize respects match opt-out');
  UPDATE private.push_match_preferences SET enabled=true WHERE match_id=x.m AND user_id=x.a;
  UPDATE private.push_subscriptions SET disabled=true WHERE id=x.subscription;
  PERFORM pg_temp.df_assert(pg_temp.df_authorize(second_event,x.subscription,(q->>'lease')::uuid) IS NULL,'disabled device rejected');
  UPDATE private.push_subscriptions SET disabled=false,binding=gen_random_uuid() WHERE id=x.subscription;
  PERFORM pg_temp.df_assert(pg_temp.df_authorize(second_event,x.subscription,(q->>'lease')::uuid) IS NULL,'changed account binding rejected');
  UPDATE private.push_subscriptions SET binding=(SELECT binding FROM private.push_deliveries WHERE event_id=second_event AND subscription_id=x.subscription) WHERE id=x.subscription;
  UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=x.sid;
  PERFORM pg_temp.df_assert(pg_temp.df_authorize(second_event,x.subscription,(q->>'lease')::uuid) IS NULL,'expired auth session rejected');
  UPDATE auth.sessions SET not_after=NULL WHERE id=x.sid;
  UPDATE private.push_defaults SET quiet_enabled=true,quiet_start='00:00',quiet_end='00:00' WHERE user_id=x.a;
  PERFORM pg_temp.df_assert(pg_temp.df_authorize(second_event,x.subscription,(q->>'lease')::uuid) IS NULL,'authorize respects Quiet Hours while active');
  PERFORM pg_temp.df_assert((SELECT state='pending' AND lease IS NULL FROM private.push_deliveries WHERE event_id=second_event AND subscription_id=x.subscription),'quiet defers and releases lease');
  UPDATE private.push_deliveries SET retry_at=clock_timestamp()-interval '1 second' WHERE event_id=second_event AND subscription_id=x.subscription;
  PERFORM pg_temp.df_assert(pg_temp.df_claim() IS NULL,'claim respects Quiet Hours while active');
  UPDATE private.push_defaults SET quiet_enabled=false WHERE user_id=x.a;
  UPDATE private.push_deliveries SET retry_at=clock_timestamp()-interval '1 second' WHERE event_id=second_event AND subscription_id=x.subscription;
  UPDATE public.voice_presence_heartbeats SET status='hidden' WHERE user_id=x.a;
  q:=pg_temp.df_claim();
  PERFORM pg_temp.df_assert(pg_temp.df_authorize(second_event,x.subscription,(q->>'lease')::uuid) IS NOT NULL,'background turn remains deliverable after quiet ends');
  PERFORM public.async_push_receipt(second_event,x.subscription,(q->>'lease')::uuid,'sent');
  UPDATE public.voice_presence_heartbeats SET status='active',interaction_age_ms=0 WHERE user_id=x.a;
  UPDATE private.delayed_children SET available_at=now()-interval '25 hours',last_call_at=now()-interval '1 hour',expires_at=now()+interval '11 hours' WHERE id=x.c;
  UPDATE private.push_deliveries SET retry_at=clock_timestamp()-interval '1 second' WHERE subscription_id=x.subscription AND state='pending';
  q:=pg_temp.df_claim();event_i:=(q->>'eventId')::uuid;
  PERFORM pg_temp.df_assert(private.push_user_active(x.a),'Last Call fixture remains active');
  PERFORM pg_temp.df_assert(pg_temp.df_authorize(event_i,x.subscription,(q->>'lease')::uuid)->'payload'->>'kind'='last_call','active Last Call claimed and authorized');
  PERFORM public.async_push_receipt(event_i,x.subscription,(q->>'lease')::uuid,'sent');
  UPDATE private.delayed_children SET actor=x.b WHERE id=x.c;
  UPDATE private.push_match_preferences SET enabled=false WHERE match_id=x.m AND user_id=x.a;
  UPDATE private.delayed_children SET actor=x.a,segment=segment+1 WHERE id=x.c;
  PERFORM pg_temp.df_assert(pg_temp.df_claim() IS NULL,'opted-out cycle never delivers');
  UPDATE private.push_match_preferences SET enabled=true WHERE match_id=x.m AND user_id=x.a;
  PERFORM pg_temp.df_assert(pg_temp.df_claim() IS NULL,'later opt-in cannot replay an un-enrolled cycle');
  UPDATE private.delayed_children SET actor=x.b WHERE id=x.c;
  UPDATE private.delayed_children SET actor=x.a,segment=segment+1,available_at=now(),last_call_at=now()+interval '24 hours',expires_at=now()+interval '36 hours' WHERE id=x.c;
  q:=pg_temp.df_claim();event_i:=(q->>'eventId')::uuid;
  PERFORM pg_temp.df_assert(event_i IS NOT NULL,'subsequent enrolled cycle is eligible');
  UPDATE private.delayed_matches SET status='settled' WHERE id=x.m;
  PERFORM pg_temp.df_assert(pg_temp.df_authorize(event_i,x.subscription,(q->>'lease')::uuid) IS NULL,'terminal match rejects delivery');
  UPDATE private.push_deliveries SET state='skipped',lease=NULL,lease_until=NULL WHERE subscription_id=x.subscription;
 END LOOP;
 invite:=gen_random_uuid();
 INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash)
  VALUES(invite,x.b,x.a,false,'{}','delivery-first-invitation');
 q:=pg_temp.df_claim();event_i:=(q->>'eventId')::uuid;
 PERFORM pg_temp.df_assert(pg_temp.df_authorize(event_i,x.subscription,(q->>'lease')::uuid)->'payload'->>'kind'='invite','active invitation remains deliverable');
 UPDATE private.push_defaults SET invitations_enabled=false WHERE user_id=x.a;
 PERFORM pg_temp.df_assert(pg_temp.df_authorize(event_i,x.subscription,(q->>'lease')::uuid) IS NULL,'invitation opt-out retained');
 UPDATE private.push_defaults SET invitations_enabled=true WHERE user_id=x.a;
 UPDATE private.delayed_matches SET status='expired' WHERE id=invite;
 PERFORM pg_temp.df_assert(pg_temp.df_authorize(event_i,x.subscription,(q->>'lease')::uuid) IS NULL,'expired invitation rejected');
 PERFORM pg_temp.df_assert(NOT has_function_privilege('authenticated','public.async_push_claim()','EXECUTE') AND NOT has_function_privilege('anon','public.async_push_authorize(uuid,uuid,uuid)','EXECUTE'),'service-only dispatch preserved');
END $$;
ROLLBACK;
SELECT jsonb_build_object('passed',true,'fixture_profiles_remaining',(SELECT count(*) FROM public.profiles WHERE username LIKE 'Push delivery-first proof %'),
 'cases','both money modes; active turn and Last Call; active invite; background; Quiet Hours at claim/authorize; opt-outs; cycle dedupe/rearm; retries/duplicate receipts; binding/device/session/lease; terminal/expired; service-only authorization',
 'containment','temporary owner copies; synthetic-device-only claim scan; no provider calls; all fixture writes rolled back') proof;
