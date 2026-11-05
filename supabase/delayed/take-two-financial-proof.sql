-- Execute inside BEGIN/ROLLBACK, after the candidate (or against installed code).
-- Synthetic identities only. No global recovery sweep or real customer changes.
CREATE FUNCTION pg_temp.ar_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'async_real proof: %',label;END IF;END $$;
CREATE TEMP TABLE ar_checks(label text);
CREATE FUNCTION pg_temp.ar_fail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.match_id::text=current_setting('ar.fail',true) THEN RAISE EXCEPTION 'ar:injected_after_accounts';END IF;RETURN NEW;END $$;
CREATE TRIGGER ar_failure BEFORE INSERT ON private.delayed_settlements FOR EACH ROW EXECUTE FUNCTION pg_temp.ar_fail();
DO $$
DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();bot uuid:=gen_random_uuid(); admin_i uuid:=gen_random_uuid();
 game text;kind text;money_i boolean;p uuid;next_p uuid;req uuid;accept_req uuid;c private.delayed_children;offer_i jsonb;hash_i text;
 answer jsonb;receipt jsonb;expected integer;due_i timestamptz;fingerprint jsonb;before_accounts bigint;inactive uuid;
BEGIN
 INSERT INTO auth.users(id) VALUES(admin_i),(a),(b),(outsider);
 UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=admin_i;
 UPDATE public.profiles SET is_active=true WHERE id=admin_i;
 INSERT INTO public.user_roles(user_id,role) VALUES(admin_i,'admin');
 PERFORM set_config('request.jwt.claim.sub',admin_i::text,true);
 PERFORM public.admin_set_account_access(a,true);
 PERFORM public.admin_set_account_access(b,true);
 PERFORM public.admin_set_account_access(outsider,true);
 INSERT INTO public.profiles(id,username,is_active) VALUES(a,'Async real proof '||a,true),(b,'Async real proof '||b,true),(outsider,'Async real proof '||outsider,true)
 ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,is_active=true;
 INSERT INTO public.profiles(id,username,is_active) VALUES(bot,'Async real bot '||bot,true);
 SELECT count(*) INTO before_accounts FROM public.player_transactions WHERE profile_id NOT IN(a,b,outsider,bot);
 PERFORM pg_temp.ar_assert((SELECT admission_enabled FROM private.delayed_release WHERE singleton),'ordinary admission open');
 PERFORM pg_temp.ar_assert(private.delayed_multi_enabled(),'five-game admission available');
 PERFORM private.delayed_words_check_health();
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 UPDATE private.delayed_release SET real_qualified=false;
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.delayed_create(gen_random_uuid(),b,true,'[{"game":"run21","stake":5}]');RAISE EXCEPTION 'ar:closed admitted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:real_money_closed' THEN RAISE;END IF;END;
 RESET ROLE;
 UPDATE private.delayed_release SET real_qualified=true;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.ar_assert((public.delayed_capabilities()->>'fake_money_only')::boolean=false AND jsonb_array_length(public.delayed_capabilities()->'games')>=5,'real five-game capability');
 RESET ROLE;
 -- Acceptance rechecks the current gate and both human identities.
 offer_i:='[{"game":"run21","stake":5}]';
 PERFORM set_config('request.jwt.claim.sub',a::text,true);SET LOCAL ROLE authenticated;
 p:=public.delayed_create(gen_random_uuid(),b,true,offer_i);RESET ROLE;
 SELECT offer_hash INTO hash_i FROM private.delayed_matches WHERE id=p;
 UPDATE private.delayed_release SET real_qualified=false;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.delayed_respond(p,gen_random_uuid(),hash_i,'accept');RAISE EXCEPTION 'ar:closed accept';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:real_money_closed' THEN RAISE;END IF;END;RESET ROLE;
 UPDATE private.delayed_release SET real_qualified=true;
 PERFORM set_config('request.jwt.claim.sub',admin_i::text,true);
 PERFORM public.admin_set_account_access(a,false);
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.delayed_respond(p,gen_random_uuid(),hash_i,'accept');RAISE EXCEPTION 'ar:inactive accept';EXCEPTION WHEN insufficient_privilege THEN NULL;END;RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub',admin_i::text,true);
 PERFORM public.admin_set_account_access(a,true);
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 UPDATE private.delayed_release SET admission_enabled=false;
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.delayed_respond(p,gen_random_uuid(),hash_i,'accept');RAISE EXCEPTION 'ar:admission closed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:admission_closed' THEN RAISE;END IF;END;RESET ROLE;
 UPDATE private.delayed_release SET admission_enabled=true;
 PERFORM pg_temp.ar_assert(NOT EXISTS(SELECT FROM public.games WHERE id=p),'rejected acceptance has no finance');
 FOREACH money_i IN ARRAY ARRAY[false,true] LOOP
 FOREACH game IN ARRAY ARRAY['ptown-words','run21','tri-towers','quintzee','boxdrop','take-two'] LOOP
  offer_i:=jsonb_build_array(jsonb_build_object('game',game,'stake',7));
  FOREACH kind IN ARRAY ARRAY['organizer_win','opponent_win','draw','forfeit','rollback'] LOOP
   SET CONSTRAINTS ALL DEFERRED;
   PERFORM set_config('request.jwt.claim.sub',a::text,true);req:=gen_random_uuid();
   SET LOCAL ROLE authenticated;
   p:=public.delayed_create(req,b,money_i,offer_i);
   PERFORM pg_temp.ar_assert(public.delayed_create(req,b,money_i,offer_i)=p,'create retry');
   BEGIN PERFORM public.delayed_create(req,b,NOT money_i,offer_i);RAISE EXCEPTION 'ar:changed retry';
   EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:request_conflict' THEN RAISE;END IF;END;
   RESET ROLE;
   SELECT offer_hash INTO hash_i FROM private.delayed_matches WHERE id=p;
   PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
   SET LOCAL ROLE authenticated;
   BEGIN PERFORM public.delayed_respond(p,gen_random_uuid(),hash_i,'accept');RAISE EXCEPTION 'ar:outsider accepted';
   EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   RESET ROLE;
   PERFORM set_config('request.jwt.claim.sub',b::text,true);accept_req:=gen_random_uuid();
   SET LOCAL ROLE authenticated;
   answer:=public.delayed_respond(p,accept_req,hash_i,'accept');
   PERFORM pg_temp.ar_assert(public.delayed_respond(p,accept_req,hash_i,'accept')=answer,'accept retry');
   RESET ROLE;
   SELECT * INTO c FROM private.delayed_children WHERE match_id=p;
   PERFORM pg_temp.ar_assert(c.stake=7 AND c.starter IN(a,b) AND c.expires_at=c.available_at+interval '36 hours' AND c.last_call_at=c.available_at+interval '24 hours','frozen stake and availability');
   PERFORM pg_temp.ar_assert(NOT EXISTS(SELECT FROM public.games WHERE id=p) AND NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=p),'no wager/funding at acceptance');
   BEGIN UPDATE private.delayed_children SET stake=8 WHERE id=c.id;RAISE EXCEPTION 'ar:stake mutated';
   EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:frozen_child' THEN RAISE;END IF;END;
   BEGIN UPDATE private.delayed_matches SET real_money=NOT money_i WHERE id=p;RAISE EXCEPTION 'ar:mode mutated';
   EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:frozen_offer' THEN RAISE;END IF;END;
   PERFORM set_config('request.jwt.claim.sub',a::text,true);
   SET LOCAL ROLE authenticated;
   IF money_i THEN BEGIN PERFORM public.delayed_remove(p,gen_random_uuid());RAISE EXCEPTION 'ar:real deleted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END IF;
   BEGIN PERFORM private.delayed_finalize(p);RAISE EXCEPTION 'ar:browser settled';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   BEGIN PERFORM public.delayed_commit(c.id,a,c.revision,'{}','action',0,true,gen_random_uuid(),'{}');RAISE EXCEPTION 'ar:browser state';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   IF game='ptown-words' THEN PERFORM public.delayed_words_snapshot(c.id);END IF;
   RESET ROLE;
   -- Suspend after admission, before server settlement/zero-client recovery.
   PERFORM set_config('request.jwt.claim.sub',admin_i::text,true);
   PERFORM public.admin_set_account_access(a,false);
   SET LOCAL ROLE service_role;
   BEGIN PERFORM public.delayed_load(c.id,a);RAISE EXCEPTION 'suspended service read admitted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   BEGIN PERFORM public.delayed_commit(c.id,a,c.revision,'{}','action',0,true,gen_random_uuid(),'{}');RAISE EXCEPTION 'suspended service command admitted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   RESET ROLE;
   expected:=CASE kind WHEN 'opponent_win' THEN -7 WHEN 'draw' THEN 0 ELSE 7 END;
   IF kind='forfeit' THEN
    due_i:=date_trunc('milliseconds',clock_timestamp())-interval '1 second';
    UPDATE private.delayed_children SET available_at=due_i-interval '36 hours',last_call_at=due_i-interval '12 hours',expires_at=due_i WHERE id=c.id RETURNING * INTO c;
    expected:=CASE WHEN c.actor=a THEN -7 ELSE 7 END;
    PERFORM pg_temp.ar_assert(NOT private.delayed_expire(c.id,c.segment-1,c.expires_at),'stale expiry rejected');
    IF game='ptown-words' THEN
     PERFORM pg_temp.ar_assert(private.delayed_expire(c.id,c.segment,c.expires_at),'Words zero-client expiry');
    ELSE
     SET LOCAL ROLE service_role;
     answer:=public.delayed_commit(c.id,NULL,c.revision,NULL,'tick',floor(extract(epoch FROM c.expires_at)*1000)::bigint,false);
     RESET ROLE;
     PERFORM pg_temp.ar_assert(answer->>'outcome'='committed','service zero-client expiry');
    END IF;
    PERFORM pg_temp.ar_assert(NOT private.delayed_expire(c.id,c.segment,c.expires_at),'duplicate expiry no effect');
   ELSE
    -- Trusted outcome/finance boundary; full game reducers are exercised separately.
    fingerprint:=jsonb_build_object('syntheticFinancialBoundary',true,'game',game,'case',kind);
    IF kind='rollback' THEN
     PERFORM set_config('ar.fail',p::text,true);
     BEGIN PERFORM private.delayed_record_outcome(c.id,c.revision,'normal',a,fingerprint);RAISE EXCEPTION 'ar:injection missing';
     EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ar:injected_after_accounts' THEN RAISE;END IF;END;
     PERFORM pg_temp.ar_assert(NOT EXISTS(SELECT FROM private.delayed_outcomes WHERE match_id=p) AND NOT EXISTS(SELECT FROM public.games WHERE id=p) AND NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=p) AND NOT EXISTS(SELECT FROM public.session_player_snapshots WHERE game_id=p),'all financial effects and outcome rolled back');
     PERFORM set_config('ar.fail','',true);
    END IF;
    answer:=private.delayed_record_outcome(c.id,c.revision,CASE WHEN kind='draw' THEN 'draw' ELSE 'normal' END,CASE WHEN kind='draw' THEN NULL WHEN expected>0 THEN a ELSE b END,fingerprint);
    PERFORM pg_temp.ar_assert(private.delayed_record_outcome(c.id,c.revision,CASE WHEN kind='draw' THEN 'draw' ELSE 'normal' END,CASE WHEN kind='draw' THEN NULL WHEN expected>0 THEN a ELSE b END,fingerprint)=answer,'outcome exact replay');
    BEGIN PERFORM private.delayed_record_outcome(c.id,c.revision,'normal',b,'{}');RAISE EXCEPTION 'ar:changed outcome';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:outcome_conflict' THEN RAISE;END IF;END;
   END IF;
   SET CONSTRAINTS ALL IMMEDIATE;
   receipt:=private.delayed_finalize(p);
   PERFORM pg_temp.ar_assert(private.delayed_finalize(p)=receipt,'settlement replay');
   PERFORM pg_temp.ar_assert((SELECT count(*)=1 AND min(organizer_delta)=expected AND min(opponent_delta)=-expected FROM private.delayed_settlements WHERE match_id=p),'one exact settlement');
   PERFORM pg_temp.ar_assert((SELECT count(*)=2 AND sum(chips)=0 AND bool_and(chips=CASE WHEN user_id=a THEN expected ELSE -expected END) FROM public.players WHERE game_id=p),'canonical chips exact');
   PERFORM pg_temp.ar_assert((SELECT count(*)=2 AND bool_and(chips=CASE WHEN user_id=a THEN expected ELSE -expected END) FROM public.session_player_snapshots WHERE game_id=p),'final snapshots exact');
   PERFORM pg_temp.ar_assert((SELECT CASE WHEN money_i THEN count(*)=2 AND sum(amount)=0 AND bool_and(amount=CASE WHEN profile_id=a THEN expected ELSE -expected END) ELSE count(*)=0 END FROM public.player_transactions WHERE source_game_id=p AND transaction_type='SessionResult'),'money-mode account postings');
   PERFORM pg_temp.ar_assert((SELECT count(*)=CASE WHEN expected=0 THEN 0 ELSE 1 END FROM public.gameplay_transfer_batches WHERE game_id=p) AND NOT EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE game_id=p AND unmatched_deltas<>'{}'::jsonb),'canonical balanced transfer '||game||' '||kind||' expected='||expected||' observed='||coalesce((SELECT jsonb_agg(to_jsonb(t))::text FROM public.gameplay_transfer_batches t WHERE game_id=p),'none'));
   PERFORM pg_temp.ar_assert((SELECT status='session_ended' AND real_money=money_i FROM public.games WHERE id=p) AND (SELECT status='settled' FROM private.delayed_matches WHERE id=p),'atomic terminal state');
   PERFORM set_config('request.jwt.claim.sub',admin_i::text,true);
   PERFORM public.admin_set_account_access(a,true);
   -- A new match is independent; a late old receipt cannot affect its identity.
   PERFORM set_config('request.jwt.claim.sub',a::text,true);SET LOCAL ROLE authenticated;
   next_p:=public.delayed_create(gen_random_uuid(),b,money_i,offer_i);RESET ROLE;
   PERFORM pg_temp.ar_assert(next_p<>p AND private.delayed_finalize(p)=receipt AND NOT EXISTS(SELECT FROM public.games WHERE id=next_p),'late replay and successor isolation');
   INSERT INTO ar_checks VALUES(money_i||' / '||game||' / '||kind||' / canonical chips/accounts/snapshots/retry/terminal PASS');
  END LOOP;
  -- Real Words must also traverse its actual public reducer and command receipts.
  IF game='ptown-words' THEN
   SELECT offer_hash INTO hash_i FROM private.delayed_matches WHERE id=next_p;
   PERFORM set_config('request.jwt.claim.sub',b::text,true);SET LOCAL ROLE authenticated;
   PERFORM public.delayed_respond(next_p,gen_random_uuid(),hash_i,'accept');RESET ROLE;
   FOR expected IN 1..4 LOOP
    SELECT * INTO c FROM private.delayed_children WHERE match_id=next_p;
    PERFORM set_config('request.jwt.claim.sub',c.actor::text,true);req:=gen_random_uuid();SET LOCAL ROLE authenticated;
    answer:=public.delayed_words_action(c.id,req,c.revision,'pass',NULL);
    PERFORM pg_temp.ar_assert(public.delayed_words_action(c.id,req,c.revision,'pass',NULL)=answer,'Words command retry');RESET ROLE;
   END LOOP;
   PERFORM pg_temp.ar_assert(EXISTS(SELECT FROM private.delayed_settlements WHERE match_id=next_p),'actual Words reducer settles real match');
  END IF;
 END LOOP;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.delayed_create(gen_random_uuid(),bot,true,'[{"game":"run21","stake":1}]');RAISE EXCEPTION 'ar:bot admitted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.delayed_create(gen_random_uuid(),a,true,'[{"game":"run21","stake":1}]');RAISE EXCEPTION 'ar:self admitted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:invalid_offer' THEN RAISE;END IF;END;
 FOREACH offer_i IN ARRAY ARRAY['[{"game":"run21","stake":0}]'::jsonb,'[{"game":"run21","stake":10000}]','[{"game":"run21","stake":1.5}]','[{"game":"unsupported","stake":5}]','[{"game":"run21","stake":5,"winner":"client"}]'] LOOP
  BEGIN PERFORM public.delayed_create(gen_random_uuid(),b,true,offer_i);RAISE EXCEPTION 'ar:bad stake admitted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:invalid_child' THEN RAISE;END IF;END;
 END LOOP;
 RESET ROLE;
 UPDATE public.profiles SET username='Async real proof Z recent '||b WHERE id=b;
 UPDATE public.profiles SET username='Async real proof A unplayed '||outsider WHERE id=outsider;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);SET LOCAL ROLE authenticated;
 PERFORM pg_temp.ar_assert(public.delayed_opponent_page('Async real proof ','recent')->'items'->0->>'id'=b::text,'recent opponent order uses played match');
 PERFORM pg_temp.ar_assert(public.delayed_opponent_page('Async real proof ','username')->'items'->0->>'id'=outsider::text,'alphabetical toggle order retained');RESET ROLE;
 PERFORM pg_temp.ar_assert((SELECT count(*) FROM public.player_transactions WHERE profile_id NOT IN(a,b,outsider,bot))=before_accounts,'no other player financial writes');
 PERFORM pg_temp.ar_assert(NOT has_table_privilege('authenticated','private.delayed_release','UPDATE'),'browser cannot enable real gate');
 INSERT INTO ar_checks VALUES('active humans, bot/self denial, stake validation, untrusted outcome/state denial, no customer writes PASS');
END $$;
DROP TRIGGER ar_failure ON private.delayed_settlements;
SELECT jsonb_agg(label ORDER BY label) AS checks FROM ar_checks;
