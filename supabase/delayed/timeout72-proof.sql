CREATE FUNCTION pg_temp.check72(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'timeout72 proof: %',label;END IF;END$$;

-- Actual frozen incident rows: rehearse reversal/restoration, replay and preservation inside rollback.
CREATE TEMP TABLE restore72_plan AS
 SELECT m.id,m.revision,gen_random_uuid() request,jsonb_agg(jsonb_build_object('id',c.id,'revision',c.revision,'outcomeHash',md5(to_jsonb(o)::text)) ORDER BY c.id) children
 FROM private.delayed_matches m JOIN private.delayed_children c ON c.match_id=m.id JOIN private.delayed_current_outcomes o ON o.child_id=c.id
 WHERE c.id IN('a8d4272a-0b66-4f22-b712-cbad9aa89aa5','181f8754-2425-4802-b918-ca9c599b41a5','f749e475-e29d-48e1-be9f-10499d51caf3','38318206-7bd4-497d-8744-44af80c17a00','8664c23c-2f3f-4d13-9415-46a431e964be')
 GROUP BY m.id,m.revision;
CREATE TEMP TABLE restore72_siblings AS SELECT c.id,to_jsonb(c) body FROM private.delayed_children c
 WHERE c.match_id IN(SELECT id FROM restore72_plan) AND NOT EXISTS(SELECT FROM restore72_plan p,jsonb_array_elements(p.children) j WHERE j->>'id'=c.id::text);
CREATE FUNCTION pg_temp.fail72() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected72_after_financial_writes';END$$;
CREATE TRIGGER fail72 BEFORE INSERT ON private.delayed_timeout_restored_children FOR EACH ROW EXECUTE FUNCTION pg_temp.fail72();
DO $$DECLARE p record;n int;balances jsonb;BEGIN
 SELECT q.* INTO p FROM restore72_plan q JOIN private.delayed_matches m ON m.id=q.id WHERE m.status='settled' ORDER BY q.id LIMIT 1;
 SELECT count(*) INTO n FROM public.player_transactions;
 SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) INTO balances FROM public.players x WHERE x.game_id=p.id;
 PERFORM set_config('request.jwt.claim.sub','d7dc1928-3727-4351-b0ff-0e80c81c2953',true);
 BEGIN
  PERFORM public.admin_restore_async_availability(p.request,p.id,p.revision,p.children,'Owner-approved 72-hour availability restoration');
  RAISE EXCEPTION 'failure injection did not fire';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'injected72_after_financial_writes' THEN RAISE;END IF;END;
 PERFORM pg_temp.check72(n=(SELECT count(*) FROM public.player_transactions),'financial failure rolled back postings');
 PERFORM pg_temp.check72(balances=(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.players x WHERE x.game_id=p.id),'financial failure rolled back chips');
 PERFORM pg_temp.check72(NOT EXISTS(SELECT FROM private.delayed_corrections WHERE id=p.request),'financial failure rolled back audit');
END $$;
DROP TRIGGER fail72 ON private.delayed_timeout_restored_children;
DO $$DECLARE p record;r jsonb;n int;before_n int;who uuid:='d7dc1928-3727-4351-b0ff-0e80c81c2953';BEGIN
 PERFORM pg_temp.check72((SELECT sum(jsonb_array_length(children))=5 FROM restore72_plan),'exact five targets');
 PERFORM set_config('request.jwt.claim.sub',NULL,true);
 BEGIN PERFORM public.admin_restore_async_availability(gen_random_uuid(),NULL,1,'[]','Unauthorized restoration proof');RAISE EXCEPTION 'unauthorized accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub',who::text,true);
 FOR p IN SELECT * FROM restore72_plan ORDER BY id LOOP
  SELECT count(*) INTO before_n FROM public.player_transactions;
  r:=public.admin_restore_async_availability(p.request,p.id,p.revision,p.children,'Owner-approved 72-hour availability restoration');
  PERFORM pg_temp.check72(r->>'outcome'='restored','restoration accepted');
  SELECT count(*) INTO n FROM public.player_transactions;
  r:=public.admin_restore_async_availability(p.request,p.id,p.revision,p.children,'Owner-approved 72-hour availability restoration');
  PERFORM pg_temp.check72(r->>'outcome'='already_restored' AND n=(SELECT count(*) FROM public.player_transactions),'duplicate does not reverse again');
  PERFORM pg_temp.check72((SELECT status='active' AND settled_at IS NULL FROM private.delayed_matches WHERE id=p.id),'parent reopened');
  PERFORM pg_temp.check72(NOT EXISTS(SELECT FROM private.delayed_current_settlements WHERE match_id=p.id),'old settlement excluded from current');
  PERFORM pg_temp.check72(EXISTS(SELECT FROM private.push_events WHERE match_id=p.id AND kind='turn' AND created_at>transaction_timestamp()),'renewed turn push queued');
 END LOOP;
 PERFORM pg_temp.check72(NOT EXISTS(SELECT FROM restore72_siblings s JOIN private.delayed_children c ON c.id=s.id WHERE to_jsonb(c) IS DISTINCT FROM s.body),'completed and active siblings preserved');
 PERFORM pg_temp.check72((SELECT count(*)=5 FROM private.delayed_timeout_restored_children WHERE correction_id IN(SELECT request FROM restore72_plan)),'all five audited');
 FOR p IN SELECT r.*,c.* FROM private.delayed_timeout_restored_children r JOIN private.delayed_children c ON c.id=r.child_id WHERE r.correction_id IN(SELECT request FROM restore72_plan) LOOP
  PERFORM pg_temp.check72(NOT p.terminal AND p.started_at IS NULL AND p.gameplay_due_at IS NULL AND p.expires_at=p.available_at+interval '72 hours' AND p.last_call_at=p.available_at+interval '48 hours','full restored window');
  PERFORM pg_temp.check72(NOT private.delayed_expire(p.id,(p.before_child->>'segment')::bigint,(p.before_child->>'expires_at')::timestamptz),'late expiry rejected');
  PERFORM pg_temp.check72(p.state->'board' IS NOT DISTINCT FROM p.before_child#>'{state,board}' AND p.state->'moves' IS NOT DISTINCT FROM p.before_child#>'{state,moves}','historical board and moves preserved');
 END LOOP;
END $$;

-- Rehearse future settlement for both reopened formerly-settled parents.
-- These simulated completions are rollback-only; the actual restoration never invents a result.
DO $$DECLARE p record;c private.delayed_children;s private.delayed_settlements;n int;BEGIN
 FOR p IN SELECT d.* FROM private.delayed_corrections d JOIN restore72_plan x ON x.request=d.id WHERE d.before_parent->>'status'='settled' LOOP
  SELECT count(*) INTO n FROM private.delayed_outcomes WHERE match_id=p.match_id;
  FOR c IN SELECT x.* FROM private.delayed_children x JOIN private.delayed_timeout_restored_children a ON a.child_id=x.id WHERE a.correction_id=p.id LOOP
   PERFORM private.delayed_record_outcome(c.id,c.revision,'normal',(p.before_parent->>'opponent')::uuid,jsonb_build_object('rollbackOnly',true));
  END LOOP;
  SELECT * INTO STRICT s FROM private.delayed_current_settlements WHERE match_id=p.match_id;
  PERFORM pg_temp.check72(s.game_id=p.financial_game_id AND (SELECT status='settled' FROM private.delayed_matches WHERE id=p.match_id),'reopened parent settles into new financial generation');
  PERFORM pg_temp.check72(n=(SELECT count(*) FROM private.delayed_outcomes WHERE match_id=p.match_id),'original outcomes immutable');
  PERFORM pg_temp.check72((SELECT count(*)=2 AND sum(chips)=0 FROM public.players WHERE game_id=s.game_id),'reopened settlement canonical chips');
  PERFORM pg_temp.check72((SELECT count(*)=2 AND sum(amount)=0 FROM public.player_transactions WHERE source_game_id=s.game_id),'reopened balanced account posting');
  PERFORM private.delayed_finalize(p.match_id);
  PERFORM pg_temp.check72((SELECT count(*)=1 FROM private.delayed_reopened_settlements WHERE match_id=p.match_id AND generation=p.generation),'reopened finalize replay');
 END LOOP;
END $$;

-- Normal server-owned continuations and canonical money paths in both money modes.
DO $$DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();m uuid;c private.delayed_children;oldc private.delayed_children;s jsonb;v jsonb;real_i boolean;tie_i boolean;game_i text;expected int;winner uuid;original_count int;original_body jsonb;before_revision bigint;
BEGIN
 INSERT INTO auth.users(id) VALUES(a),(b);
 UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id IN(a,b);
 UPDATE public.profiles SET is_active=true WHERE id IN(a,b);
 FOREACH real_i IN ARRAY ARRAY[false,true] LOOP FOREACH tie_i IN ARRAY ARRAY[false,true] LOOP FOREACH game_i IN ARRAY ARRAY['ptown-words','quintzee'] LOOP
  SET CONSTRAINTS ALL DEFERRED;
  PERFORM set_config('request.jwt.claim.sub',a::text,true);
  m:=public.delayed_create(gen_random_uuid(),b,real_i,jsonb_build_array(jsonb_build_object('game',game_i,'stake',7)));
  PERFORM set_config('request.jwt.claim.sub',b::text,true);
  PERFORM public.delayed_respond(m,gen_random_uuid(),(SELECT offer_hash FROM private.delayed_matches WHERE id=m),'accept');
  SELECT * INTO c FROM private.delayed_children WHERE match_id=m;
  PERFORM pg_temp.check72(c.expires_at=c.available_at+interval '72 hours' AND c.last_call_at=c.available_at+interval '48 hours','admission window');
  winner:=c.actor;
  FOR i IN 1..4 LOOP
   UPDATE private.delayed_children SET available_at=clock_timestamp()-interval '73 hours' WHERE id=c.id;
   SELECT * INTO c FROM private.delayed_children WHERE id=c.id;oldc:=c;original_body:=c.state;
   PERFORM pg_temp.check72(NOT private.delayed_expire(c.id,c.segment-1,c.expires_at),'stale segment');
   IF game_i='ptown-words' AND i=4 THEN
    UPDATE private.delayed_children SET state=state||jsonb_build_object('scores',jsonb_build_object(a::text,CASE WHEN tie_i THEN 0 ELSE 10 END,b::text,0),'racks',jsonb_build_object(a::text,'[]'::jsonb,b::text,'[]'::jsonb)) WHERE id=c.id;
   ELSIF game_i='quintzee' AND i=2 AND NOT tie_i THEN
    UPDATE private.delayed_children SET state=jsonb_set(state,ARRAY['totals',a::text],'1000') WHERE id=c.id;
   END IF;
   PERFORM pg_temp.check72(private.delayed_expire(c.id,c.segment,c.expires_at),'expiry resolved');
   PERFORM pg_temp.check72(NOT private.delayed_expire(c.id,c.segment,c.expires_at),'duplicate expiry');
   SELECT * INTO c FROM private.delayed_children WHERE id=c.id;
   PERFORM pg_temp.check72(c.segment=oldc.segment+1 AND c.revision>oldc.revision,'one exact turn advance');
   IF i<4 THEN PERFORM pg_temp.check72(NOT c.terminal AND NOT EXISTS(SELECT FROM private.delayed_current_outcomes WHERE child_id=c.id),'no early terminal');END IF;
   IF game_i='ptown-words' THEN
    PERFORM pg_temp.check72(c.state#>>'{moves,-1,action}'='pass' AND c.state->'board' IS NOT DISTINCT FROM original_body->'board','timeout pass preserves board');
   ELSE PERFORM pg_temp.check72(c.state#>>'{attempts,-1,score}'='0','missed round zero');END IF;
  END LOOP;
  expected:=CASE WHEN tie_i THEN 0 ELSE 7 END;
  PERFORM pg_temp.check72(c.terminal AND (SELECT count(*)=1 AND min(organizer_delta)=expected FROM private.delayed_current_outcomes WHERE child_id=c.id),'winner/tie outcome');
  PERFORM pg_temp.check72((SELECT count(*)=1 AND min(organizer_delta)=expected FROM private.delayed_current_settlements WHERE match_id=m),'one settlement');
  PERFORM pg_temp.check72((SELECT count(*)=2 AND sum(chips)=0 AND bool_and(chips=CASE WHEN user_id=a THEN expected ELSE -expected END) FROM public.players WHERE game_id=m),'canonical chip balances');
  PERFORM pg_temp.check72((SELECT count(*)=2 AND bool_and(chips=CASE WHEN user_id=a THEN expected ELSE -expected END) FROM public.session_player_snapshots WHERE game_id=m),'final snapshots');
  PERFORM pg_temp.check72((SELECT status='session_ended' FROM public.games WHERE id=m),'canonical terminal');
  PERFORM private.delayed_finalize(m);
  SET CONSTRAINTS ALL IMMEDIATE;
  PERFORM pg_temp.check72((SELECT count(*)=CASE WHEN real_i THEN 2 ELSE 0 END AND coalesce(sum(amount),0)=0 FROM public.player_transactions WHERE source_game_id=m),'balanced account posting');
  PERFORM pg_temp.check72((SELECT count(*)=CASE WHEN tie_i THEN 0 ELSE 1 END FROM public.gameplay_transfer_batches WHERE game_id=m),'one financial transfer');
 END LOOP;END LOOP;END LOOP;
END $$;
SELECT 'PASS: restoration, replay, stale expiry, ownership, Words/Quintzee continuation, winner/tie, canonical chips/ledger/snapshots and terminal in both money modes' result;
