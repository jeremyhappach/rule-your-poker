CREATE FUNCTION pg_temp.flow_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'async_flow proof: %',label;END IF;END $$;
-- Verify the real incident without changing a gameplay row or financial posting.
DO $incident$
DECLARE h jsonb;who uuid;other uuid;e uuid;
BEGIN
 FOR who IN SELECT unnest(ARRAY['d7dc1928-3727-4351-b0ff-0e80c81c2953'::uuid,'ad62c2da-2956-4e82-857f-bc0eeef5e858'::uuid]) LOOP
  PERFORM set_config('request.jwt.claim.sub',who::text,true);SET LOCAL ROLE authenticated;
  h:=public.delayed_home('678aebe0-29ff-4a0e-a4f1-0282ea622afc');RESET ROLE;
  PERFORM pg_temp.flow_assert(h->>'status'='active' AND h->>'completed'='3' AND h->>'reviewsComplete'='false' AND h->'receipt'='null','incident remains active with three exact outcomes');
  PERFORM pg_temp.flow_assert(h#>>'{lineup,0,result,winner}'='ad62c2da-2956-4e82-857f-bc0eeef5e858' AND h#>>'{lineup,0,viewed}'='true','existing first result and ACK preserved');
  PERFORM pg_temp.flow_assert(h#>>'{lineup,2,viewed}'='false' AND h#>>'{lineup,2,reviewCount}'='1','missing third receipt is now an unseen final result');
 END LOOP;
 PERFORM pg_temp.flow_assert((SELECT count(*)=3 AND sum(organizer_delta)=15 FROM private.delayed_current_outcomes WHERE match_id='678aebe0-29ff-4a0e-a4f1-0282ea622afc'),'all saved authoritative outcomes contribute once');
 PERFORM pg_temp.flow_assert(NOT EXISTS(SELECT FROM flow_incident_before x JOIN private.delayed_children c ON c.id=x.id WHERE x.body IS DISTINCT FROM to_jsonb(c)),'incident gameplay preserved exactly');
 PERFORM pg_temp.flow_assert((SELECT body FROM flow_parent_before)=(SELECT to_jsonb(m) FROM private.delayed_matches m WHERE id='678aebe0-29ff-4a0e-a4f1-0282ea622afc'),'incident parent and turn unchanged');
 PERFORM pg_temp.flow_assert((SELECT body FROM flow_seen_before)=(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.event_id,s.viewer),'[]') FROM private.delayed_review_seen s JOIN private.delayed_review_events e ON e.id=s.event_id WHERE e.match_id='678aebe0-29ff-4a0e-a4f1-0282ea622afc'),'no historical or fabricated ACKs');
END $incident$;

-- Actual restore owner: one correction restores multiple children; an untouched
-- sibling completes under the older match-scoped writer. Later completion must
-- retain all three outcomes and settle exactly once in either money mode.
CREATE FUNCTION pg_temp.flow_legacy_window() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id::text=current_setting('flow.legacy_child',true) AND NEW.terminal AND NOT OLD.terminal THEN
  NEW.last_call_at:=NEW.available_at+interval '24 hours';NEW.expires_at:=NEW.available_at+interval '36 hours';
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER delayed_01_flow_legacy BEFORE UPDATE ON private.delayed_children
 FOR EACH ROW EXECUTE FUNCTION pg_temp.flow_legacy_window();
DO $restore$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];m uuid;ids uuid[];c private.delayed_children;
 real_i boolean;tie_i boolean;i int;req uuid;items jsonb;h jsonb;financial uuid;o private.delayed_outcomes;cmd jsonb;e uuid;count_i bigint;
BEGIN
 FOR i IN 1..3 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=users[i];
  UPDATE public.profiles SET is_active=true WHERE id=users[i];
 END LOOP;
 INSERT INTO public.user_roles(user_id,role) VALUES(users[1],'admin');
 FOREACH real_i IN ARRAY ARRAY[false,true] LOOP FOREACH tie_i IN ARRAY ARRAY[false,true] LOOP
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  m:=public.delayed_create(gen_random_uuid(),users[2],real_i,'[{"game":"quintzee","stake":7},{"game":"quintzee","stake":7},{"game":"quintzee","stake":7}]');
  PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
  PERFORM public.delayed_respond(m,gen_random_uuid(),(SELECT offer_hash FROM private.delayed_matches WHERE id=m),'accept');
  SELECT array_agg(id ORDER BY ordinal) INTO ids FROM private.delayed_children WHERE match_id=m;
  FOR i IN 2..3 LOOP
   SELECT * INTO c FROM private.delayed_children WHERE id=ids[i];
   PERFORM set_config('flow.legacy_child',c.id::text,true);
   PERFORM private.delayed_record_outcome(c.id,c.revision,'timeout_forfeit',users[2],jsonb_build_object('expiredAt',c.available_at+interval '36 hours'));
   PERFORM set_config('flow.legacy_child','',true);
  END LOOP;
  SELECT jsonb_agg(jsonb_build_object('id',ch.id,'revision',ch.revision,'outcomeHash',md5(to_jsonb(outcome)::text)) ORDER BY ch.ordinal)
   INTO items FROM private.delayed_children ch JOIN private.delayed_current_outcomes outcome ON outcome.child_id=ch.id WHERE ch.id=ANY(ids[2:3]);
  req:=gen_random_uuid();PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  h:=public.admin_restore_async_availability(req,m,(SELECT revision FROM private.delayed_matches WHERE id=m),items,'Rollback proof of restored sibling outcomes');
  PERFORM pg_temp.flow_assert(h->>'outcome'='restored','multi-child restoration owner');
  PERFORM pg_temp.flow_assert((SELECT count(*)=2 FROM private.delayed_effective_child_corrections WHERE child_id=ANY(ids)),'each restored sibling has correction identity');
  SELECT * INTO c FROM private.delayed_children WHERE id=ids[1];
  INSERT INTO private.delayed_reopened_outcomes(child_id,match_id,terminal_revision,segment,reason,winner,organizer_delta,opponent_delta,evidence,generation)
   VALUES(c.id,m,c.revision,c.segment,CASE WHEN tie_i THEN 'draw' ELSE 'normal' END,CASE WHEN NOT tie_i THEN users[1] END,CASE WHEN tie_i THEN 0 ELSE 7 END,CASE WHEN tie_i THEN 0 ELSE -7 END,'{"proof":"legacy match writer"}',1);
  UPDATE private.delayed_children SET terminal=true,revision=revision+1 WHERE id=c.id;
  FOR i IN 2..3 LOOP
   SELECT * INTO c FROM private.delayed_children WHERE id=ids[i];
   cmd:=jsonb_build_object('proof','restored completion','i',i);
   h:=private.delayed_record_outcome(c.id,c.revision,CASE WHEN tie_i THEN 'draw' ELSE 'normal' END,CASE WHEN NOT tie_i THEN users[1] END,cmd);
   PERFORM pg_temp.flow_assert(h=private.delayed_record_outcome(c.id,c.revision,CASE WHEN tie_i THEN 'draw' ELSE 'normal' END,CASE WHEN NOT tie_i THEN users[1] END,cmd),'duplicate and late outcome replay');
   PERFORM pg_temp.flow_assert((SELECT count(*)=1 FROM private.delayed_current_review_events WHERE child_id=c.id AND kind='child'),'replacement final receipt has unique correction key');
  END LOOP;
  PERFORM pg_temp.flow_assert((SELECT count(*)=3 FROM private.delayed_current_outcomes WHERE match_id=m),'all restored and untouched outcomes survive');
  SELECT game_id INTO STRICT financial FROM private.delayed_current_settlements WHERE match_id=m;
  PERFORM pg_temp.flow_assert((SELECT organizer_delta=CASE WHEN tie_i THEN 0 ELSE 21 END FROM private.delayed_current_settlements WHERE match_id=m),'correct full match settlement');
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.flow_assert((SELECT count(*)=2 AND bool_and(chips=CASE WHEN tie_i THEN 0 WHEN user_id=users[1] THEN 21 ELSE -21 END) FROM public.players WHERE game_id=financial),'canonical chip changes');
  PERFORM pg_temp.flow_assert((SELECT count(*)=2 FROM public.session_player_snapshots WHERE game_id=financial),'atomic final snapshots');
  PERFORM pg_temp.flow_assert((SELECT count(*)=CASE WHEN real_i THEN 2 ELSE 0 END AND coalesce(sum(amount),0)=0 FROM public.player_transactions WHERE source_game_id=financial),'balanced account postings');
  PERFORM pg_temp.flow_assert((SELECT count(*)=CASE WHEN tie_i THEN 0 ELSE 1 END AND coalesce(bool_and(unmatched_deltas='{}'),true) FROM public.gameplay_transfer_batches WHERE game_id=financial),'balanced transfer ledger');
  PERFORM private.delayed_finalize(m);
  PERFORM pg_temp.flow_assert((SELECT count(*)=1 FROM private.delayed_reopened_settlements WHERE match_id=m),'finalize replay is harmless');
  SELECT id INTO e FROM private.delayed_current_review_events WHERE child_id=ids[3] AND kind='child';
  PERFORM set_config('request.jwt.claim.sub',users[3]::text,true);
  BEGIN PERFORM public.delayed_review_ack(e);RAISE EXCEPTION 'outsider ACK accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  BEGIN PERFORM public.delayed_finale_ack(m);RAISE EXCEPTION 'early finale accepted';EXCEPTION WHEN SQLSTATE '55000' THEN IF SQLERRM<>'delayed:reviews_pending' THEN RAISE;END IF;END;
  FOR e IN SELECT id FROM private.delayed_current_review_events WHERE match_id=m AND kind='child' LOOP
   PERFORM public.delayed_review_ack(e);PERFORM public.delayed_review_ack(e);
  END LOOP;
  h:=public.delayed_home(m);
  PERFORM pg_temp.flow_assert(h->>'reviewsComplete'='true' AND h->>'status'='settled' AND h->'receipt'<>'null','last final ACK admits match finale');
  PERFORM public.delayed_finale_ack(m);PERFORM public.delayed_finale_ack(m);
  PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
  PERFORM pg_temp.flow_assert(public.delayed_home(m)->>'reviewsComplete'='false','other viewer retains own ACK obligations');
 END LOOP;END LOOP;
END $restore$;
SELECT 'PASS: exact incident, restoration siblings, legacy writer, winner/tie, both money modes, chips/ledger/snapshots, duplicate/late replay, authorization, final ACK/finale' AS flow_repair;
