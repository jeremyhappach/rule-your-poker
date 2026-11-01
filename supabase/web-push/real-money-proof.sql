-- Requires baseline-proof fixtures; all operations stay inside caller BEGIN/ROLLBACK.
-- No global claim/recovery calls: production customers and their deliveries remain untouched.
CREATE TEMP TABLE rmp_checks(label text);
DO $$
DECLARE x rmp_context; money boolean; game text; m uuid; c uuid; c2 uuid; e private.push_events; s private.push_subscriptions;
 job jsonb; lease_i uuid; before_finance jsonb; after_finance jsonb; epoch_i bigint; count_i bigint;
BEGIN
 SELECT * INTO x FROM rmp_context;
 SELECT * INTO s FROM private.push_subscriptions WHERE id=x.subscription;
 PERFORM pg_temp.rmp_assert((SELECT keys=ARRAY[x.old_child::text||':1'] FROM private.push_episodes WHERE match_id=x.old_match AND user_id=x.a),'existing real turn baselined');
 UPDATE private.delayed_children SET revision=revision+1 WHERE id=x.old_child;
 PERFORM pg_temp.rmp_assert((SELECT count(*) FROM private.push_events WHERE match_id=x.old_match)=(SELECT events FROM rmp_baseline),'deployment/retry/unrelated update does not replay old turn');
 INSERT INTO rmp_checks VALUES('confirmed regression; idempotent deployment baselines existing turns without replay');
 SELECT jsonb_build_object('games',(SELECT count(*) FROM public.games),'players',(SELECT count(*) FROM public.players),
  'accounts',(SELECT count(*) FROM public.player_transactions),'transfers',(SELECT count(*) FROM public.gameplay_transfer_batches),
  'settlements',(SELECT count(*) FROM private.delayed_settlements),'outcomes',(SELECT count(*) FROM private.delayed_outcomes)) INTO before_finance;
 FOREACH money IN ARRAY ARRAY[false,true] LOOP
  -- Invitation choice is independent from match turn preferences.
  m:=gen_random_uuid();
  INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash) VALUES(m,x.b,x.a,money,'{}','push-invitation-proof');
  SELECT * INTO e FROM private.push_events WHERE match_id=m AND kind='invite';
  PERFORM pg_temp.rmp_assert(e.id IS NOT NULL AND private.push_eligible(e,s),'eligible invitation in both modes');
  UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m;
  PERFORM pg_temp.rmp_assert((SELECT count(*)=1 FROM private.push_events WHERE match_id=m),'invitation dedupe');
  UPDATE private.push_defaults SET invitations_enabled=false WHERE user_id=x.a;
  PERFORM pg_temp.rmp_assert(NOT private.push_eligible(e,s),'invitation opt-out');
  UPDATE private.push_defaults SET invitations_enabled=true WHERE user_id=x.a;
  UPDATE private.delayed_matches SET status='declined' WHERE id=m;
  PERFORM pg_temp.rmp_assert(NOT private.push_eligible(e,s),'stale invitation');
  FOREACH game IN ARRAY ARRAY['ptown-words','run21','tri-towers','quintzee','boxdrop'] LOOP
   m:=gen_random_uuid();c:=gen_random_uuid();c2:=gen_random_uuid();
   INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash,status,accepted_at)
    VALUES(m,x.b,x.a,money,'{}','push-turn-proof','active',now());
   INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,actor,segment,available_at,last_call_at,expires_at)
    VALUES(c,m,1,game,1,'{}',x.a,1,now(),now()+interval '24 hours',now()+interval '36 hours');
   SELECT * INTO e FROM private.push_events WHERE match_id=m AND kind='turn';
   PERFORM pg_temp.rmp_assert(e.id IS NOT NULL AND private.push_eligible(e,s),'five-game eligible turn '||game||' real='||money);
   PERFORM pg_temp.rmp_assert(NOT private.push_eligible((SELECT z FROM private.push_events z WHERE match_id=m AND kind='last_call'),s),'no early last call');
   UPDATE private.delayed_children SET revision=revision+1 WHERE id=c;
   PERFORM pg_temp.rmp_assert((SELECT count(*)=2 FROM private.push_events WHERE match_id=m),'same segment does not duplicate');
   INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,actor,segment,available_at,last_call_at,expires_at)
    VALUES(c2,m,2,game,1,'{}',x.a,1,now(),now()+interval '24 hours',now()+interval '36 hours');
   PERFORM pg_temp.rmp_assert((SELECT count(*)=4 FROM private.push_events WHERE match_id=m),'second child while first waits generates its own event');
   SELECT * INTO e FROM private.push_events WHERE match_id=m AND kind='turn' ORDER BY epoch DESC LIMIT 1;
   PERFORM pg_temp.rmp_assert(e.keys=ARRAY[c2::text||':1'],'fresh keys exclude already waiting child');
   lease_i:=gen_random_uuid();
   UPDATE private.push_deliveries SET state='sending',lease=lease_i,lease_until=now()+interval '90 seconds' WHERE event_id=e.id AND subscription_id=s.id;
   SET LOCAL ROLE service_role;
   job:=public.async_push_authorize(e.id,s.id,lease_i);
   RESET ROLE;
   PERFORM pg_temp.rmp_assert(job IS NOT NULL AND (job->'payload')-ARRAY['eventId','matchId','tableId','binding','kind','expiresAt']='{}'::jsonb,'generic payload only');
   UPDATE private.push_match_preferences SET enabled=false WHERE match_id=m AND user_id=x.a;
   PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NULL,'match opt-out rechecked');
   UPDATE private.push_match_preferences SET enabled=true WHERE match_id=m AND user_id=x.a;
   INSERT INTO private.delayed_incidents(match_id,reason) VALUES(m,'rollback push hold');
   PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NULL,'incident rechecked');
   DELETE FROM private.delayed_incidents WHERE match_id=m;
   UPDATE private.push_subscriptions SET disabled=true WHERE id=s.id;
   PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NULL,'disabled device rechecked');
   UPDATE private.push_subscriptions SET disabled=false,binding=gen_random_uuid() WHERE id=s.id;
   PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NULL,'device rebinding rechecked');
   UPDATE private.push_subscriptions SET binding=s.binding WHERE id=s.id;
   UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=x.sid;
   PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NULL,'expired auth session rechecked');
   UPDATE auth.sessions SET not_after=NULL WHERE id=x.sid;
   INSERT INTO private.push_presence(subscription_id,match_id,until_at) VALUES(s.id,m,now()+interval '1 minute');
   PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NULL,'foreground match suppressed');
   DELETE FROM private.push_presence WHERE subscription_id=s.id;
   UPDATE private.push_defaults SET quiet_enabled=true,quiet_start='00:00',quiet_end='00:00' WHERE user_id=x.a;
   PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NULL,'quiet hours rechecked');
   UPDATE private.push_defaults SET quiet_enabled=false WHERE user_id=x.a;
   UPDATE private.push_deliveries SET state='sending',lease=lease_i,lease_until=now()+interval '90 seconds' WHERE event_id=e.id AND subscription_id=s.id;
   UPDATE private.delayed_children SET gameplay_due_at=now()-interval '1 second' WHERE id=c2;
   PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NULL,'earlier gameplay deadline');
   UPDATE private.delayed_children SET gameplay_due_at=NULL,segment=segment+1,available_at=now()-interval '25 hours',last_call_at=now()-interval '1 hour',expires_at=now()+interval '11 hours' WHERE id=c2;
   PERFORM pg_temp.rmp_assert(public.async_push_authorize(e.id,s.id,lease_i) IS NULL,'stale segment');
   SELECT * INTO e FROM private.push_events WHERE match_id=m AND kind='last_call' ORDER BY epoch DESC LIMIT 1;
   PERFORM pg_temp.rmp_assert(private.push_eligible(e,s),'real/play last call');
   UPDATE private.delayed_children SET actor=x.b WHERE id=c2;
   PERFORM pg_temp.rmp_assert(NOT private.push_eligible(e,s),'actionability rechecked');
   UPDATE private.delayed_matches SET status='settled' WHERE id=m;
   PERFORM pg_temp.rmp_assert(NOT private.push_eligible(e,s),'terminal suppressed');
   INSERT INTO rmp_checks VALUES(game||' real='||money||': generation, child identity, deadline, holds, quiet, auth/device/binding, foreground, opt-out, last-call, stale/terminal, privacy');
  END LOOP;
 END LOOP;
 SET CONSTRAINTS ALL DEFERRED;
 UPDATE private.delayed_children SET segment=segment+1 WHERE match_id=x.old_match;
 INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,actor,segment,available_at,last_call_at,expires_at)
  VALUES(gen_random_uuid(),x.old_match,2,'tri-towers',1,'{}',x.a,1,now(),now()+interval '24 hours',now()+interval '36 hours');
 SELECT count(*) INTO count_i FROM private.push_events WHERE match_id=x.old_match;
 SET CONSTRAINTS ALL IMMEDIATE;
 PERFORM pg_temp.rmp_assert((SELECT count(*) FROM private.push_events WHERE match_id=x.old_match)=count_i+2,'simultaneous real children produce one turn/last-call pair');
 PERFORM pg_temp.rmp_assert((SELECT cardinality(keys)=2 FROM private.push_events WHERE match_id=x.old_match AND kind='turn' ORDER BY epoch DESC LIMIT 1),'simultaneous keys preserved');
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN
  PERFORM public.delayed_home(x.old_match);
  RAISE EXCEPTION 'push proof: outsider deep-link admitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RESET ROLE;
 INSERT INTO rmp_checks VALUES('simultaneous real child coalescing and unauthorized match deep-link rejection');
 FOR game IN SELECT unnest(ARRAY['anon','authenticated','service_role']) LOOP
  PERFORM pg_temp.rmp_assert(NOT has_function_privilege(game,'private.push_sync(uuid)','EXECUTE'),'private sync ACL');
  PERFORM pg_temp.rmp_assert(NOT has_function_privilege(game,'private.push_invited()','EXECUTE'),'private invite ACL');
 END LOOP;
 PERFORM pg_temp.rmp_assert(NOT has_function_privilege('authenticated','public.async_push_claim()','EXECUTE'),'worker service-only');
 SELECT jsonb_build_object('games',(SELECT count(*) FROM public.games),'players',(SELECT count(*) FROM public.players),
  'accounts',(SELECT count(*) FROM public.player_transactions),'transfers',(SELECT count(*) FROM public.gameplay_transfer_batches),
  'settlements',(SELECT count(*) FROM private.delayed_settlements),'outcomes',(SELECT count(*) FROM private.delayed_outcomes)) INTO after_finance;
 PERFORM pg_temp.rmp_assert(before_finance=after_finance,'notification fixtures create no gameplay/financial records');
 INSERT INTO rmp_checks VALUES('private permissions and zero gameplay/settlement/account/transfer writes');
END $$;
SELECT jsonb_agg(label) checks FROM rmp_checks;
