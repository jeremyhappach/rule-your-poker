-- Synthetic fixtures only. Caller must BEGIN/ROLLBACK. Never call the global worker here.
CREATE TEMP TABLE cycle_checks(label text);
DO $$
DECLARE x rmp_context; money boolean; m uuid; c uuid; c2 uuid; e private.push_events;
 s private.push_subscriptions; lease_i uuid; job jsonb; first_epoch bigint; started timestamptz; elapsed numeric;
BEGIN
 SELECT * INTO x FROM rmp_context;
 SELECT * INTO s FROM private.push_subscriptions WHERE id=x.subscription;
 FOREACH money IN ARRAY ARRAY[false,true] LOOP
  m:=gen_random_uuid();c:=gen_random_uuid();c2:=gen_random_uuid();
  INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash,status,accepted_at)
   VALUES(m,x.b,x.a,money,'{}','cycle-proof','active',now());
  INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,actor,segment,available_at,last_call_at,expires_at)
   VALUES(c,m,1,'run21',1,'{}',x.a,1,now(),now()+interval '24 hours',now()+interval '36 hours');
  SELECT * INTO e FROM private.push_events WHERE match_id=m AND user_id=x.a AND kind='turn';
  first_epoch:=e.epoch;
  PERFORM pg_temp.rmp_assert(e.id IS NOT NULL AND private.push_eligible(e,s),'first availability event');
  -- A later committed child, regardless of minutes between transactions.
  INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,actor,segment,available_at,last_call_at,expires_at)
   VALUES(c2,m,2,'ptown-words',1,'{}',x.a,1,now(),now()+interval '24 hours',now()+interval '36 hours');
  PERFORM pg_temp.rmp_assert((SELECT count(*)=1 FROM private.push_events WHERE match_id=m AND user_id=x.a AND kind='turn'),'continuous availability has one turn event');
  PERFORM pg_temp.rmp_assert((SELECT count(*)=2 FROM private.push_events WHERE match_id=m AND user_id=x.a AND kind='last_call'),'independent child reminders retained');
  UPDATE private.delayed_children SET actor=x.b WHERE id=c;
  PERFORM pg_temp.rmp_assert(private.push_eligible(e,s),'original child clears but cycle remains eligible');
  lease_i:=gen_random_uuid();
  UPDATE private.push_deliveries SET state='sending',lease=lease_i,lease_until=now()+interval '90 seconds' WHERE event_id=e.id;
  PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NOT NULL,'dispatch follows remaining child');
  UPDATE private.delayed_children SET actor=x.b WHERE id=c2;
  PERFORM pg_temp.rmp_assert(NOT private.push_eligible(e,s),'all cleared invalidates old cycle');
  UPDATE private.delayed_children SET actor=x.a,segment=2 WHERE id=c2;
  PERFORM pg_temp.rmp_assert((SELECT count(*)=2 FROM private.push_events WHERE match_id=m AND user_id=x.a AND kind='turn'),'new cycle rearms');
  PERFORM pg_temp.rmp_assert(NOT private.push_eligible(e,s),'late retry cannot cross cycle');
  SELECT * INTO e FROM private.push_events WHERE match_id=m AND user_id=x.a AND kind='turn' ORDER BY epoch DESC LIMIT 1;
  PERFORM pg_temp.rmp_assert(e.epoch>first_epoch AND private.push_eligible(e,s),'new cycle authoritative');
  UPDATE private.delayed_children SET available_at=now()-interval '25 hours',last_call_at=now()-interval '1 hour',expires_at=now()+interval '11 hours' WHERE id=c2;
  PERFORM pg_temp.rmp_assert(private.push_eligible((SELECT p FROM private.push_events p WHERE match_id=m AND user_id=x.a AND kind='last_call' ORDER BY epoch DESC LIMIT 1),s),'24 hour reminder separate');
  INSERT INTO cycle_checks VALUES('money='||money||': later child, continuous cycle, remaining child, clear/rearm, stale replay, Last Call');
 END LOOP;
 PERFORM pg_temp.rmp_assert((SELECT count(DISTINCT match_id)>=2 FROM private.push_events WHERE user_id=x.a AND kind='turn'),'independent matches');
 lease_i:=gen_random_uuid();
 UPDATE private.push_deliveries SET state='sending',lease=lease_i,lease_until=now()+interval '90 seconds' WHERE event_id=e.id;
 INSERT INTO public.voice_presence_heartbeats(user_id,tab_id,status,interaction_age_ms) VALUES(x.a,'cycle-phone','active',0);
 PERFORM pg_temp.rmp_assert(private.push_user_active(x.a),'active foreground phone');
 -- Activity at generation does not consume event: hidden before dispatch is eligible.
 UPDATE public.voice_presence_heartbeats SET status='hidden' WHERE user_id=x.a AND tab_id='cycle-phone';
 PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NOT NULL,'hidden immediately allows dispatch');
 UPDATE public.voice_presence_heartbeats SET status='leaving' WHERE user_id=x.a AND tab_id='cycle-phone';
 PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NOT NULL,'exit immediately allows return push');
 UPDATE public.voice_presence_heartbeats SET status='active',interaction_age_ms=60000 WHERE user_id=x.a AND tab_id='cycle-phone';
 PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NOT NULL,'idle foreground fails open');
 UPDATE public.voice_presence_heartbeats SET interaction_age_ms=NULL WHERE user_id=x.a AND tab_id='cycle-phone';
 PERFORM pg_temp.rmp_assert(NOT private.push_user_active(x.a),'unknown interaction fails open');
 INSERT INTO public.voice_presence_heartbeats(user_id,tab_id,status,interaction_age_ms) VALUES(x.b,'cycle-other-account','active',0);
 PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NOT NULL,'separate account does not suppress');
 INSERT INTO public.voice_presence_heartbeats(user_id,tab_id,status,interaction_age_ms) VALUES(x.a,'cycle-laptop','active',0);
 PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NULL,'active laptop suppresses phone');
 PERFORM pg_temp.rmp_assert((SELECT bool_and(state='skipped') FROM private.push_deliveries WHERE event_id=e.id),'suppression permanent even if receipt lost');
 UPDATE public.voice_presence_heartbeats SET status='leaving' WHERE user_id=x.a;
 PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NULL,'no catchup after departure');
 UPDATE private.delayed_children SET actor=x.b WHERE match_id=m;
 UPDATE private.delayed_children SET actor=x.a,segment=segment+1 WHERE id=c2;
 SELECT * INTO e FROM private.push_events WHERE match_id=m AND user_id=x.a AND kind='turn' ORDER BY epoch DESC LIMIT 1;
 lease_i:=gen_random_uuid();
 UPDATE private.push_deliveries SET state='sending',lease=lease_i,lease_until=now()+interval '90 seconds' WHERE event_id=e.id;
 PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NOT NULL,'later genuine cycle can deliver');
 INSERT INTO cycle_checks VALUES('foreground, hidden, exit, idle, unknown, cross-device/account, permanent suppression and later cycle');
 UPDATE private.push_defaults SET quiet_enabled=true,quiet_start='00:00',quiet_end='00:00' WHERE user_id=x.a;
 INSERT INTO public.voice_presence_heartbeats(user_id,tab_id,status,interaction_age_ms) VALUES(x.a,'cycle-quiet','active',0);
 PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NULL,'quiet hours defer');
 PERFORM pg_temp.rmp_assert((SELECT state='pending' FROM private.push_deliveries WHERE event_id=e.id AND subscription_id=s.id),'quiet deferral precedes presence suppression');
 UPDATE private.push_defaults SET quiet_enabled=false WHERE user_id=x.a;
 UPDATE public.voice_presence_heartbeats SET status='hidden' WHERE user_id=x.a;
 UPDATE private.push_deliveries SET state='sending',lease=lease_i,lease_until=now()+interval '90 seconds' WHERE event_id=e.id;
 PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NOT NULL,'leaving during quiet hours allows later eligible delivery');
 UPDATE private.push_match_preferences SET enabled=false WHERE match_id=m AND user_id=x.a;
 PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NULL,'opt out preserved');
 UPDATE private.push_match_preferences SET enabled=true WHERE match_id=m AND user_id=x.a;
 PERFORM pg_temp.rmp_assert(public.async_push_receipt(e.id,s.id,lease_i,'retry'),'retry accepted');
 PERFORM pg_temp.rmp_assert(NOT public.async_push_receipt(e.id,s.id,lease_i,'sent'),'duplicate receipt inert');
 INSERT INTO cycle_checks VALUES('quiet-hour ordering, opt-out, retry and duplicate receipts');
 UPDATE public.voice_presence_heartbeats SET status='active',interaction_age_ms=0 WHERE user_id=x.a AND tab_id='cycle-phone';
 PERFORM pg_temp.rmp_assert(private.push_user_active(x.a),'fresh heartbeat suppresses');
 PERFORM pg_sleep(10.05);
 PERFORM pg_temp.rmp_assert(NOT private.push_user_active(x.a),'abrupt termination expires in ten seconds');
 INSERT INTO cycle_checks VALUES('abrupt termination: ten-second server-stamped freshness');
 started:=clock_timestamp();
 FOR i IN 1..500 LOOP PERFORM private.push_user_active(x.a); END LOOP;
 elapsed:=extract(epoch FROM clock_timestamp()-started)*1000/500;
 INSERT INTO cycle_checks VALUES('presence lookup average ms='||round(elapsed,4));
 PERFORM pg_temp.rmp_assert(position('push_user_active' in pg_get_functiondef('private.push_sync(uuid)'::regprocedure))=0,'no presence lookup in gameplay transaction');
 PERFORM pg_temp.rmp_assert(NOT has_function_privilege('authenticated','private.push_user_active(uuid)','EXECUTE'),'presence helper private');
 PERFORM pg_temp.rmp_assert(NOT has_function_privilege('authenticated','public.async_push_claim()','EXECUTE'),'worker service-only');
 INSERT INTO cycle_checks VALUES('gameplay isolation and private permissions');
END $$;
SELECT jsonb_agg(label) checks FROM cycle_checks;
