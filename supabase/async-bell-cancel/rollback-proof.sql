-- Execute in BEGIN / ROLLBACK, with actual production constraints and roles.
CREATE FUNCTION pg_temp.bell_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'async bell proof: %',label;END IF;END $$;
CREATE TEMP TABLE bell_checks(label text);
DO $proof$
DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 m uuid; sibling uuid; retained uuid; req uuid; create_req uuid; offer text; answer jsonb; center jsonb;
 mode boolean; sid uuid:=gen_random_uuid();sub uuid;binding_i uuid;event_i uuid;lease_i uuid:=gen_random_uuid();
 c uuid; deadline timestamptz; before_receipts bigint; before_profiles bigint;
BEGIN
 INSERT INTO auth.users(id) VALUES(a),(b),(outsider);
 INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES(a,true,true),(b,true,true),(outsider,true,true)
 ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true;
 INSERT INTO public.profiles(id,username,is_active) VALUES(a,'Bell proof sender '||a,true),(b,'Bell proof opponent '||b,true),(outsider,'Bell proof outsider '||outsider,true)
 ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,is_active=true;
 INSERT INTO auth.sessions(id,user_id) VALUES(sid,b);
 INSERT INTO private.push_defaults(user_id,enabled,invitations_enabled) VALUES(b,true,true)
 ON CONFLICT(user_id) DO UPDATE SET enabled=true,invitations_enabled=true;
 INSERT INTO private.push_subscriptions(user_id,session_id,endpoint,p256dh,auth_secret)
 VALUES(b,sid,'https://web.push.apple.com/bell-proof-'||b,repeat('B',87),repeat('A',22)) RETURNING id,binding INTO sub,binding_i;
 SELECT count(*) INTO before_receipts FROM private.delayed_settlements;
 FOREACH mode IN ARRAY ARRAY[false,true] LOOP
  create_req:=gen_random_uuid();req:=gen_random_uuid();
  PERFORM set_config('request.jwt.claim.sub',a::text,true);SET LOCAL ROLE authenticated;
  m:=public.delayed_create(create_req,b,mode,'[{"game":"run21","stake":7},{"game":"run21","stake":3}]');
  RESET ROLE;
  SELECT offer_hash INTO offer FROM private.delayed_matches WHERE id=m;
  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT id INTO event_i FROM private.push_events WHERE match_id=m AND kind='invite';
  PERFORM pg_temp.bell_assert(event_i IS NOT NULL,'invitation push queued');
  UPDATE private.push_deliveries SET state='sending',lease=lease_i,lease_until=clock_timestamp()+interval '1 minute'
   WHERE event_id=event_i AND subscription_id=sub;
  PERFORM set_config('request.jwt.claim.sub',b::text,true);SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.delayed_respond(m,gen_random_uuid(),offer,'cancel');RAISE EXCEPTION 'recipient cancellation allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  BEGIN PERFORM public.delayed_respond(m,gen_random_uuid(),offer,'cancel');RAISE EXCEPTION 'outsider cancellation allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  PERFORM set_config('request.jwt.claim.sub',a::text,true);
  answer:=public.delayed_respond(m,req,offer,'cancel');
  PERFORM pg_temp.bell_assert(answer->>'deleted'='true','cancel returns deleted');
  PERFORM pg_temp.bell_assert(public.delayed_respond(m,req,offer,'cancel')=answer,'cancel replay');
  PERFORM pg_temp.bell_assert(public.delayed_create(create_req,b,mode,'[{"game":"run21","stake":7},{"game":"run21","stake":3}]')=m,'create replay cannot resurrect');
  BEGIN PERFORM public.delayed_respond(m,req,'wrong','cancel');RAISE EXCEPTION 'request conflict allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:request_conflict' THEN RAISE;END IF;END;
  BEGIN PERFORM public.delayed_home(m);RAISE EXCEPTION 'deleted home visible';
  EXCEPTION WHEN no_data_found THEN PERFORM pg_temp.bell_assert(SQLERRM='delayed:invitation_cancelled','sender canceled home identity');END;
  PERFORM pg_temp.bell_assert(NOT EXISTS(SELECT FROM jsonb_array_elements(public.delayed_list()) x WHERE x->>'id'=m::text),'sender lobby empty');
  PERFORM set_config('request.jwt.claim.sub',b::text,true);
  BEGIN PERFORM public.delayed_respond(m,gen_random_uuid(),offer,'accept');RAISE EXCEPTION 'accept after cancel allowed';
  EXCEPTION WHEN no_data_found THEN NULL;END;
  PERFORM pg_temp.bell_assert(NOT EXISTS(SELECT FROM jsonb_array_elements(public.delayed_list()) x WHERE x->>'id'=m::text),'recipient lobby empty');
  RESET ROLE;
  PERFORM pg_temp.bell_assert(NOT EXISTS(SELECT FROM private.delayed_matches WHERE id=m)
   AND NOT EXISTS(SELECT FROM private.delayed_children WHERE match_id=m)
   AND NOT EXISTS(SELECT FROM public.platform_notifications WHERE match_id=m)
   AND NOT EXISTS(SELECT FROM private.push_events WHERE match_id=m),'physical deletion and notices/push cleared');
  PERFORM pg_temp.bell_assert((SELECT count(*)=2 FROM public.delayed_match_updates WHERE match_id=m AND revision>0),'both owner invalidations survive');
  SET LOCAL ROLE service_role;
  PERFORM pg_temp.bell_assert(public.async_push_authorize(event_i,sub,lease_i) IS NULL,'leased unsent invitation cannot authorize');
  RESET ROLE;

  -- Acceptance first: exact same public RPC and row lock.
  PERFORM set_config('request.jwt.claim.sub',a::text,true);SET LOCAL ROLE authenticated;
  retained:=public.delayed_create(gen_random_uuid(),b,mode,'[{"game":"run21","stake":7}]');
  RESET ROLE;SELECT offer_hash INTO offer FROM private.delayed_matches WHERE id=retained;
  PERFORM set_config('request.jwt.claim.sub',b::text,true);SET LOCAL ROLE authenticated;
  PERFORM public.delayed_respond(retained,gen_random_uuid(),offer,'accept');
  PERFORM set_config('request.jwt.claim.sub',a::text,true);
  BEGIN PERFORM public.delayed_respond(retained,gen_random_uuid(),offer,'cancel');RAISE EXCEPTION 'accepted cancellation allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:offer_changed' THEN RAISE;END IF;END;
  RESET ROLE;
  PERFORM pg_temp.bell_assert((SELECT status='active' AND accepted_at IS NOT NULL FROM private.delayed_matches WHERE id=retained),'accepted match preserved');
  BEGIN PERFORM private.delayed_delete_pending_invitation(retained);RAISE EXCEPTION 'accepted cleanup allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:pending_invitation_required' THEN RAISE;END IF;END;
  UPDATE private.delayed_matches SET status='settled',settled_at=clock_timestamp() WHERE id=retained;
  BEGIN PERFORM private.delayed_delete_pending_invitation(retained);RAISE EXCEPTION 'completed cleanup allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:pending_invitation_required' THEN RAISE;END IF;END;
  PERFORM pg_temp.bell_assert((SELECT status='settled' FROM private.delayed_matches WHERE id=retained),'completed match preserved');
  INSERT INTO bell_checks VALUES('cancel/accept, auth, replay, lobby, unsent push and accepted/completed preservation in money mode '||mode);
 END LOOP;

 -- Two match IDs share one opponent. Dead and expired own turns cannot affect
 -- the earliest playable deadline, navigation count or per-match result suppression.
 FOR i IN 1..2 LOOP
  PERFORM set_config('request.jwt.claim.sub',a::text,true);SET LOCAL ROLE authenticated;
  m:=public.delayed_create(gen_random_uuid(),b,false,'[{"game":"run21","stake":7},{"game":"run21","stake":7},{"game":"run21","stake":7}]');
  RESET ROLE;SELECT offer_hash INTO offer FROM private.delayed_matches WHERE id=m;
  PERFORM set_config('request.jwt.claim.sub',b::text,true);SET LOCAL ROLE authenticated;
  PERFORM public.delayed_respond(m,gen_random_uuid(),offer,'accept');RESET ROLE;
  UPDATE private.delayed_children SET actor=a WHERE match_id=m;
  UPDATE private.delayed_children SET available_at=now()-interval '8 hours',last_call_at=now()+interval '16 hours',expires_at=now()+interval '28 hours' WHERE match_id=m AND ordinal=1;
  UPDATE private.delayed_children SET available_at=now()-interval '37 hours',last_call_at=now()-interval '13 hours',expires_at=now()-interval '1 hour' WHERE match_id=m AND ordinal=2;
  UPDATE private.delayed_children SET gameplay_due_at=now()-interval '1 second' WHERE match_id=m AND ordinal=3;
  PERFORM private.delayed_notify(m);
  UPDATE public.platform_notifications SET actionable=true,payload=payload||'{"completionCount":2}' WHERE match_id=m AND user_id=a AND kind='results';
  IF i=1 THEN sibling:=m;END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);SET LOCAL ROLE authenticated;
 center:=public.platform_notification_center();RESET ROLE;
 PERFORM pg_temp.bell_assert((SELECT count(*)=2 FROM jsonb_array_elements(center->'items') n WHERE n->>'kind'='turn' AND (n->>'match_id')::uuid IN(m,sibling)),'same opponent separate matches');
 PERFORM pg_temp.bell_assert(NOT EXISTS(SELECT FROM jsonb_array_elements(center->'items') n WHERE n->>'kind'='results' AND (n->>'match_id')::uuid IN(m,sibling)),'suppress before summary and badge');
 PERFORM pg_temp.bell_assert((SELECT bool_and(n#>>'{payload,availableCount}'='1' AND (n#>>'{payload,earliestDeadline}')::timestamptz=now()+interval '28 hours') FROM jsonb_array_elements(center->'items') n WHERE n->>'kind'='turn' AND (n->>'match_id')::uuid IN(m,sibling)),'earliest currently playable deadline only');
 UPDATE private.delayed_children SET actor=b WHERE match_id=m;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);SET LOCAL ROLE authenticated;
 center:=public.platform_notification_center();RESET ROLE;
 PERFORM pg_temp.bell_assert(EXISTS(SELECT FROM jsonb_array_elements(center->'items') n WHERE n->>'kind'='results' AND n->>'match_id'=m::text)
  AND NOT EXISTS(SELECT FROM jsonb_array_elements(center->'items') n WHERE n->>'kind'='results' AND n->>'match_id'=sibling::text),'mixed results filter per match and reappear');
 PERFORM pg_temp.bell_assert((center->>'actionable')::int=jsonb_array_length(center->'items'),'badge counts filtered rows');
 PERFORM pg_temp.bell_assert(NOT EXISTS(SELECT FROM private.delayed_review_seen WHERE viewer=a),'no result acknowledgment');
 PERFORM pg_temp.bell_assert((SELECT count(*) FROM private.delayed_settlements)=before_receipts,'no settlement writes');
 PERFORM pg_temp.bell_assert(NOT has_function_privilege('authenticated','private.delayed_delete_pending_invitation(uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.delayed_respond(uuid,uuid,text,text)','EXECUTE'),'private deletion ACL and public RPC ACL');
 INSERT INTO bell_checks VALUES('same opponent, expired/gameplay-expired exclusion, earliest deadline, mixed results, restored results, badge, unchanged review and financial authority');
END $proof$;
SELECT jsonb_agg(label) AS checks FROM bell_checks;

