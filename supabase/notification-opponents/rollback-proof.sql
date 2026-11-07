-- Run only inside a rollback transaction after migration 20261107034130.
CREATE FUNCTION pg_temp.originals_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'originals proof: %',label;END IF;END $$;
CREATE TEMP TABLE originals_notification_evidence(label text);
DO $proof$
DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 sid uuid:=gen_random_uuid(); parent uuid; child uuid; sub uuid; binding_i uuid; event_i uuid;
 lease_i uuid:=gen_random_uuid(); names text[]:=ARRAY['mcru81','Happach Gmail']; opponent uuid;
 i integer; response jsonb; notices jsonb; before_events integer; notice_id uuid; notice_revision bigint;
BEGIN
 names:=ARRAY['mcru81 proof '||b,'Happach Gmail proof '||c];
 INSERT INTO auth.users(id) VALUES(a),(b),(c);
 INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES(a,true,true),(b,true,true),(c,true,true)
 ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true;
 INSERT INTO public.profiles(id,username,is_active) VALUES(a,'Originals proof viewer '||a,true),(b,names[1],true),(c,names[2],true)
 ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,is_active=true;
 INSERT INTO auth.sessions(id,user_id) VALUES(sid,a);
 INSERT INTO private.push_defaults(user_id,enabled) VALUES(a,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true;
 INSERT INTO private.push_subscriptions(user_id,session_id,endpoint,p256dh,auth_secret)
 VALUES(a,sid,'https://web.push.apple.com/originals-proof-'||a,repeat('B',87),repeat('A',22)) RETURNING id,binding INTO sub,binding_i;
 FOR i IN 1..2 LOOP
  opponent:=CASE WHEN i=1 THEN b ELSE c END;
  parent:=gen_random_uuid();child:=gen_random_uuid();
  INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash,status,accepted_at)
  VALUES(parent,CASE WHEN i=1 THEN a ELSE opponent END,CASE WHEN i=1 THEN opponent ELSE a END,false,'[]','originals-proof','active',clock_timestamp());
  INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,actor,segment,available_at,last_call_at,expires_at)
  VALUES(child,parent,1,'run21',1,'{}',a,1,now(),now()+interval '24 hours',now()+interval '36 hours');
  PERFORM private.delayed_notify(parent);
  PERFORM private.push_sync(parent);
  SELECT count(*) INTO before_events FROM private.push_events WHERE match_id=parent AND user_id=a AND kind='turn';
  PERFORM private.push_sync(parent);
  PERFORM pg_temp.originals_assert(before_events=1 AND (SELECT count(*) FROM private.push_events WHERE match_id=parent AND user_id=a AND kind='turn')=1,'one availability cycle');
  SELECT id INTO event_i FROM private.push_events WHERE match_id=parent AND user_id=a AND kind='turn';
  UPDATE private.push_deliveries SET state='sending',lease=lease_i,lease_until=clock_timestamp()+interval '30 seconds'
  WHERE event_id=event_i AND subscription_id=sub;
  response:=public.async_push_authorize(event_i,sub,lease_i);
  PERFORM pg_temp.originals_assert(response#>>'{payload,opponentName}'=names[i],'recipient-specific push identity');
  PERFORM pg_temp.originals_assert(response#>>'{payload,matchId}'=parent::text,'push match identity');
  SELECT id,revision INTO notice_id,notice_revision FROM public.platform_notifications WHERE match_id=parent AND user_id=a AND kind='turn';
  PERFORM set_config('request.jwt.claim.sub',a::text,true);
  notices:=public.platform_notification_center();
  PERFORM pg_temp.originals_assert(EXISTS(SELECT FROM jsonb_array_elements(notices->'items') n WHERE n->>'id'=notice_id::text AND n#>>'{payload,opponentName}'=names[i]),'bell and push match');
  PERFORM pg_temp.originals_assert((SELECT revision FROM public.platform_notifications WHERE id=notice_id)=notice_revision,'read projection preserves revision');
  PERFORM pg_temp.originals_assert(private.async_opponent_name(parent,gen_random_uuid()) IS NULL,'outsider has no inferred name');
  UPDATE private.push_defaults SET quiet_enabled=true,quiet_start='00:00',quiet_end='00:00' WHERE user_id=a;
  PERFORM pg_temp.originals_assert(public.async_push_authorize(event_i,sub,lease_i) IS NULL,'quiet hours');
  UPDATE private.push_defaults SET quiet_enabled=false WHERE user_id=a;
  UPDATE private.push_deliveries SET state='sending',lease=lease_i,lease_until=clock_timestamp()+interval '30 seconds'
  WHERE event_id=event_i AND subscription_id=sub;
  INSERT INTO public.voice_presence_heartbeats(user_id,tab_id,status,interaction_age_ms) VALUES(a,'originals-proof','active',0)
  ON CONFLICT(user_id,tab_id) DO UPDATE SET status='active',interaction_age_ms=0;
  PERFORM pg_temp.originals_assert(public.async_push_authorize(event_i,sub,lease_i) IS NULL,'active-user suppression');
  PERFORM pg_temp.originals_assert((SELECT state='skipped' FROM private.push_deliveries WHERE event_id=event_i AND subscription_id=sub),'suppression survives retry');
  DELETE FROM public.voice_presence_heartbeats WHERE user_id=a AND tab_id='originals-proof';
  INSERT INTO originals_notification_evidence VALUES('opponent '||i||' push/bell identity, dedupe, quiet hours, presence, read revision');
 END LOOP;
END $proof$;
SELECT jsonb_agg(label) AS checks FROM originals_notification_evidence;
