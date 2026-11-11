-- Prepend BEGIN, a short lock timeout, and optionally the candidate migration.
-- Run after installation with the same fixture and without candidate DDL.
CREATE FUNCTION pg_temp.assert_push(ok boolean,label text) RETURNS void
 LANGUAGE plpgsql AS $$
BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'foreground push proof: %',label; END IF;
END
$$;

CREATE TEMP TABLE push_fixture(recipient uuid,opponent uuid,session_id uuid,device uuid);
INSERT INTO push_fixture VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());

-- Exercise the installed dispatch bodies with a synthetic-only claim scan.
DO $$
DECLARE claim text:=pg_get_functiondef('public.async_push_claim()'::regprocedure);
BEGIN
 PERFORM pg_temp.assert_push(strpos(claim,'FROM private.push_deliveries WHERE state')>0,'recognized claim scan');
 claim:=replace(claim,'public.async_push_claim','pg_temp.claim_push');
 claim:=replace(claim,'FROM private.push_deliveries WHERE state',
  'FROM private.push_deliveries WHERE subscription_id=(SELECT device FROM pg_temp.push_fixture) AND state');
 claim:=replace(claim,'pg_try_advisory_xact_lock(914,6021)','pg_try_advisory_xact_lock(914,6022)');
 EXECUTE claim;
END
$$;

INSERT INTO auth.users(id) SELECT recipient FROM push_fixture UNION ALL SELECT opponent FROM push_fixture;
UPDATE public.account_access SET enabled=true,ever_enabled=true
 WHERE user_id IN(SELECT recipient FROM push_fixture UNION ALL SELECT opponent FROM push_fixture);
INSERT INTO public.profiles(id,username,is_active)
 SELECT recipient,'Push foreground proof '||recipient,true FROM push_fixture
 UNION ALL SELECT opponent,'Push foreground proof '||opponent,true FROM push_fixture
 ON CONFLICT(id) DO UPDATE SET is_active=true,username=excluded.username;
INSERT INTO auth.sessions(id,user_id) SELECT session_id,recipient FROM push_fixture;
INSERT INTO private.push_defaults(user_id,enabled,invitations_enabled) SELECT recipient,true,true FROM push_fixture;
INSERT INTO private.push_subscriptions(id,user_id,session_id,endpoint,p256dh,auth_secret)
 SELECT device,recipient,session_id,'https://web.push.apple.com/rollback-foreground-'||device,repeat('B',87),repeat('A',22)
 FROM push_fixture;
SET CONSTRAINTS ALL IMMEDIATE;

DO $$
DECLARE
 f push_fixture;
 money boolean;
 match_key uuid;
 child_id uuid;
 invitation_id uuid;
 event_key uuid;
 job jsonb;
 lease_id uuid;
BEGIN
 SELECT * INTO f FROM push_fixture;
 INSERT INTO public.voice_presence_heartbeats(user_id,tab_id,status,interaction_age_ms)
 VALUES(f.recipient,'installed-pwa','active',90000),(f.recipient,'other-tab','active',NULL);

 FOREACH money IN ARRAY ARRAY[false,true] LOOP
  match_key:=gen_random_uuid(); child_id:=gen_random_uuid();
  UPDATE public.voice_presence_heartbeats SET status='active' WHERE user_id=f.recipient;
  UPDATE public.voice_presence_heartbeats SET status='hidden' WHERE user_id=f.recipient AND tab_id='other-tab';
  PERFORM pg_temp.assert_push(private.push_user_active(f.recipient),'one visible PWA after another tab hides');

  INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash,status,accepted_at)
  VALUES(match_key,f.opponent,f.recipient,money,'{}','foreground-proof','active',now());
  INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,actor,segment,available_at,last_call_at,expires_at)
  VALUES(child_id,match_key,1,'run21',1,'{}',f.recipient,1,now(),now()+interval '24 hours',now()+interval '36 hours');
  SELECT e.id INTO event_key FROM private.push_events e
   WHERE e.match_id=match_key AND e.user_id=f.recipient AND e.kind='turn';
  PERFORM pg_temp.assert_push((SELECT foreground_suppressed FROM private.push_events e WHERE e.id=event_key),'active turn stamped');
  PERFORM private.delayed_notify(match_key);
  PERFORM set_config('request.jwt.claim.sub',f.recipient::text,true);
  PERFORM pg_temp.assert_push(EXISTS(
   SELECT FROM jsonb_array_elements(public.platform_notification_center()->'items') item
   WHERE item->>'kind'='turn' AND item->>'match_id'=match_key::text),'in-app turn available');
  PERFORM set_config('request.jwt.claim.sub','',true);

  UPDATE private.delayed_children SET available_at=now()-interval '25 hours',last_call_at=now()-interval '1 hour',
   expires_at=now()+interval '11 hours' WHERE id=child_id;
  PERFORM pg_temp.assert_push((SELECT e.foreground_suppressed FROM private.push_events e
   WHERE e.match_id=match_key AND e.user_id=f.recipient AND e.kind='last_call'),'active Last Call stamped');
  UPDATE public.voice_presence_heartbeats SET status='leaving' WHERE user_id=f.recipient AND tab_id='installed-pwa';
  PERFORM pg_temp.assert_push(NOT private.push_user_active(f.recipient),'all windows backgrounded');
  PERFORM pg_temp.assert_push(pg_temp.claim_push() IS NULL,'no delayed claim after backgrounding');
  PERFORM pg_temp.assert_push((SELECT d.state='skipped' FROM private.push_deliveries d
   WHERE d.event_id=event_key AND d.subscription_id=f.device),'foreground delivery permanently skipped');

  UPDATE private.delayed_children SET actor=f.opponent WHERE id=child_id;
  UPDATE private.delayed_children SET actor=f.recipient,segment=segment+1,
   available_at=now(),last_call_at=now()+interval '24 hours',expires_at=now()+interval '36 hours' WHERE id=child_id;
  job:=pg_temp.claim_push(); event_key:=(job->>'eventId')::uuid; lease_id:=(job->>'lease')::uuid;
  PERFORM pg_temp.assert_push(event_key IS NOT NULL,'fresh background turn claimed');
  UPDATE public.voice_presence_heartbeats SET status='active' WHERE user_id=f.recipient AND tab_id='other-tab';
  PERFORM pg_temp.assert_push(public.async_push_authorize(event_key,f.device,lease_id) IS NULL,'foreground return before authorize suppresses');
  UPDATE public.voice_presence_heartbeats SET status='hidden' WHERE user_id=f.recipient;
  PERFORM pg_temp.assert_push(pg_temp.claim_push() IS NULL,'suppressed lease never retried');

  UPDATE private.delayed_children SET actor=f.opponent WHERE id=child_id;
  UPDATE private.delayed_children SET actor=f.recipient,segment=segment+1 WHERE id=child_id;
  UPDATE private.push_defaults SET quiet_enabled=true,quiet_start='00:00',quiet_end='00:00' WHERE user_id=f.recipient;
  PERFORM pg_temp.assert_push(pg_temp.claim_push() IS NULL,'background Quiet Hours still defer');
  UPDATE private.push_defaults SET quiet_enabled=false WHERE user_id=f.recipient;
  UPDATE private.push_deliveries SET retry_at=clock_timestamp() WHERE subscription_id=f.device AND state='pending';
  job:=pg_temp.claim_push(); event_key:=(job->>'eventId')::uuid; lease_id:=(job->>'lease')::uuid;
  PERFORM pg_temp.assert_push(event_key IS NOT NULL,'background turn resumes after Quiet Hours');
  UPDATE private.push_match_preferences SET enabled=false WHERE user_id=f.recipient AND match_id=match_key;
  PERFORM pg_temp.assert_push(public.async_push_authorize(event_key,f.device,lease_id) IS NULL,'match opt-out remains effective');
  UPDATE private.push_match_preferences SET enabled=true WHERE user_id=f.recipient AND match_id=match_key;
  PERFORM pg_temp.assert_push(public.async_push_authorize(event_key,f.device,lease_id)->'payload'->>'kind'='turn','background turn authorized');
  PERFORM pg_temp.assert_push(public.async_push_receipt(event_key,f.device,lease_id,'sent'),'receipt recorded once');
  PERFORM pg_temp.assert_push(NOT public.async_push_receipt(event_key,f.device,lease_id,'sent'),'duplicate receipt rejected');
  PERFORM pg_temp.assert_push(pg_temp.claim_push() IS NULL,'no duplicate availability push');
 END LOOP;

 UPDATE public.voice_presence_heartbeats SET status='active' WHERE user_id=f.recipient AND tab_id='installed-pwa';
 invitation_id:=gen_random_uuid();
 INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash)
 VALUES(invitation_id,f.opponent,f.recipient,false,'{}','foreground-invitation-proof');
 PERFORM pg_temp.assert_push((SELECT e.foreground_suppressed FROM private.push_events e
  WHERE e.match_id=invitation_id AND e.user_id=f.recipient AND e.kind='invite'),'active invitation stamped');
 UPDATE public.voice_presence_heartbeats SET status='hidden' WHERE user_id=f.recipient;
 PERFORM pg_temp.assert_push(pg_temp.claim_push() IS NULL,'foreground invitation never delivered later');
 PERFORM pg_temp.assert_push(NOT has_function_privilege('authenticated','public.async_push_claim()','EXECUTE')
  AND NOT has_function_privilege('anon','public.async_push_authorize(uuid,uuid,uuid)','EXECUTE'),'service-only dispatch');
END
$$;
ROLLBACK;
SELECT jsonb_build_object('passed',true,'fixture_profiles_remaining',
 (SELECT count(*) FROM public.profiles WHERE username LIKE 'Push foreground proof %')) AS proof;
