-- Exact owner-approved data correction. No persistent schema or RPC changes.
-- The original financial game/result/ledger remain immutable real-money history.
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION pg_temp.bob_preserved() RETURNS jsonb
LANGUAGE plpgsql AS $fingerprint$
DECLARE item record; digest_i text; result jsonb:='{}';
BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('public.player_transactions','source_game_id IS DISTINCT FROM ''0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15''::uuid'),
  ('public.gameplay_transfer_batches','game_id <> ''0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15''::uuid'),
  ('public.gameplay_transfer_pending_changes','true'),
  ('public.players','game_id <> ''0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15''::uuid'),
  ('public.games','id <> ''0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15''::uuid'),
  ('public.game_results','true'),
  ('public.session_player_snapshots','true'),
  ('private.delayed_outcomes','true'),
  ('private.delayed_settlements','true'),
  ('private.delayed_requests','true'),
  ('private.chess_requests','true'),
  ('private.delayed_matches','id <> ''0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15''::uuid'),
  ('private.delayed_children','id <> ''b1795d0c-51a3-47b8-a6b8-1e324b3f34d8''::uuid')
 ) t(table_i,predicate) LOOP
  EXECUTE format($query$SELECT md5(coalesce(string_agg(h,'' ORDER BY h),'')) FROM
   (SELECT md5(to_jsonb(t)::text) h FROM %s t WHERE %s) rows$query$,item.table_i,item.predicate) INTO digest_i;
  result:=result||jsonb_build_object(item.table_i,digest_i);
 END LOOP;
 RETURN result;
END $fingerprint$;

CREATE OR REPLACE FUNCTION pg_temp.restore_bob_play_money() RETURNS jsonb
LANGUAGE plpgsql AS $restore$
DECLARE m private.delayed_matches;c private.delayed_children;prior private.delayed_corrections;
 response jsonb;before_i jsonb;original_entries jsonb;original_batches jsonb;guard_def text;
 balances_before jsonb;balances_after jsonb;
 correction_id uuid:='5a61e531-b2b0-46ac-8876-7f043d9a3d38';
 reason_i text:=$reason$Jeremy approved correcting the unintended $5 real-money Hap/Bobbalouie Chess match to play money on 2026-11-22; reverse the real-money timeout settlement and preserve the saved nine-move board with Bobbalouie to move. Original financial records remain immutable.$reason$;
BEGIN
 IF auth.uid() IS DISTINCT FROM 'd7dc1928-3727-4351-b0ff-0e80c81c2953'::uuid
  OR NOT public.has_role(auth.uid(),'admin'::public.app_role)
 THEN RAISE EXCEPTION 'bob_play_money:not_authorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id='0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15' FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id='b1795d0c-51a3-47b8-a6b8-1e324b3f34d8' FOR UPDATE;
 SELECT * INTO prior FROM private.delayed_corrections WHERE id=correction_id;
 IF FOUND THEN
  IF prior.match_id<>m.id OR prior.child_id<>c.id OR prior.actor IS DISTINCT FROM auth.uid()
   OR prior.reason IS DISTINCT FROM reason_i OR m.real_money
   OR prior.before_parent->>'real_money' IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'bob_play_money:replay_conflict'; END IF;
  RETURN jsonb_build_object('outcome','already_corrected','correction',correction_id,
   'match',m.id,'child',c.id,'realMoney',false,'reversalIds',prior.reversal_ids);
 END IF;
 IF to_jsonb(m) IS DISTINCT FROM $parent${"id":"0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15","offer":[{"game":"chess","stake":5,"config":{"turnMs":300000,"version":"ptown-chess/1","timeBankMs":180000,"timeBankUses":2,"availabilityMs":129600000}}],"status":"settled","opponent":"201d2c6b-a58e-4b6a-a21d-8cda3360c860","revision":24,"organizer":"d7dc1928-3727-4351-b0ff-0e80c81c2953","created_at":"2026-11-22T20:08:44.750235+00:00","expires_at":"2026-11-25T20:08:44.750235+00:00","offer_hash":"46ee61beea25d428f8af7fd1b4314970","real_money":true,"settled_at":"2026-11-22T22:36:33.814939+00:00","accepted_at":"2026-11-22T20:09:04.43755+00:00","policy_version":"delayed/1"}$parent$::jsonb
  OR to_jsonb(c) IS DISTINCT FROM $child${"id":"b1795d0c-51a3-47b8-a6b8-1e324b3f34d8","actor":"201d2c6b-a58e-4b6a-a21d-8cda3360c860","stake":5,"state":{"fen":"rn1qkbnr/ppp1p2p/3p1p2/6p1/2B1P1b1/N4P2/PPPP2PP/R1B1K1NR b KQkq - 0 5","mode":"async","turn":10,"banks":{"201d2c6b-a58e-4b6a-a21d-8cda3360c860":[],"d7dc1928-3727-4351-b0ff-0e80c81c2953":[]},"moves":[{"at":1795378166216,"to":"e4","fen":"rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1","ply":1,"from":"e2","color":"w","piece":"p"},{"at":1795378208259,"to":"f6","fen":"rnbqkbnr/ppppp1pp/5p2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2","ply":2,"from":"f7","color":"b","piece":"p"},{"at":1795378314500,"to":"a3","fen":"rnbqkbnr/ppppp1pp/5p2/8/4P3/N7/PPPP1PPP/R1BQKBNR b KQkq - 1 2","ply":3,"from":"b1","color":"w","piece":"n"},{"at":1795379042522,"to":"g5","fen":"rnbqkbnr/ppppp2p/5p2/6p1/4P3/N7/PPPP1PPP/R1BQKBNR w KQkq - 0 3","ply":4,"from":"g7","color":"b","piece":"p"},{"at":1795379278751,"to":"g4","fen":"rnbqkbnr/ppppp2p/5p2/6p1/4P1Q1/N7/PPPP1PPP/R1B1KBNR b KQkq - 1 3","ply":5,"from":"d1","color":"w","piece":"q"},{"at":1795381281428,"to":"d6","fen":"rnbqkbnr/ppp1p2p/3p1p2/6p1/4P1Q1/N7/PPPP1PPP/R1B1KBNR w KQkq - 0 4","ply":6,"from":"d7","color":"b","piece":"p"},{"at":1795381525873,"to":"c4","fen":"rnbqkbnr/ppp1p2p/3p1p2/6p1/2B1P1Q1/N7/PPPP1PPP/R1B1K1NR b KQkq - 1 4","ply":7,"from":"f1","color":"w","piece":"b"},{"at":1795382545618,"to":"g4","fen":"rn1qkbnr/ppp1p2p/3p1p2/6p1/2B1P1b1/N7/PPPP1PPP/R1B1K1NR w KQkq - 0 5","ply":8,"from":"c8","color":"b","piece":"b","capture":{"color":"w","piece":"q","square":"g4"}},{"at":1795382623594,"to":"f3","fen":"rn1qkbnr/ppp1p2p/3p1p2/6p1/2B1P1b1/N4P2/PPPP2PP/R1B1K1NR b KQkq - 0 5","ply":9,"from":"f2","color":"w","piece":"p"}],"phase":"complete","rules":{"turnMs":300000,"version":"ptown-chess/1","timeBankMs":180000,"timeBankUses":2,"availabilityMs":129600000},"opened":true,"reason":"timeout","scores":{"201d2c6b-a58e-4b6a-a21d-8cda3360c860":0,"d7dc1928-3727-4351-b0ff-0e80c81c2953":1},"players":[{"id":"d7dc1928-3727-4351-b0ff-0e80c81c2953","name":"Hap","seat":1,"isBot":false,"userId":"d7dc1928-3727-4351-b0ff-0e80c81c2953"},{"id":"201d2c6b-a58e-4b6a-a21d-8cda3360c860","name":"Bobbalouie","seat":2,"isBot":false,"userId":"201d2c6b-a58e-4b6a-a21d-8cda3360c860"}],"captured":{"b":[],"w":[{"id":"b1795d0c-51a3-47b8-a6b8-1e324b3f34d8:8","type":"q"}]},"deadline":1795386992766,"identity":{"roundId":"b1795d0c-51a3-47b8-a6b8-1e324b3f34d8","sessionId":"0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15","dealerGameId":"b1795d0c-51a3-47b8-a6b8-1e324b3f34d8"},"positions":["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -||","rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -||","rnbqkbnr/ppppp1pp/5p2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -||","rnbqkbnr/ppppp1pp/5p2/8/4P3/N7/PPPP1PPP/R1BQKBNR b KQkq -||","rnbqkbnr/ppppp2p/5p2/6p1/4P3/N7/PPPP1PPP/R1BQKBNR w KQkq -||","rnbqkbnr/ppppp2p/5p2/6p1/4P1Q1/N7/PPPP1PPP/R1B1KBNR b KQkq -||","rnbqkbnr/ppp1p2p/3p1p2/6p1/4P1Q1/N7/PPPP1PPP/R1B1KBNR w KQkq -||","rnbqkbnr/ppp1p2p/3p1p2/6p1/2B1P1Q1/N7/PPPP1PPP/R1B1K1NR b KQkq -||","rn1qkbnr/ppp1p2p/3p1p2/6p1/2B1P1b1/N7/PPPP1PPP/R1B1K1NR w KQkq -|q|","rn1qkbnr/ppp1p2p/3p1p2/6p1/2B1P1b1/N4P2/PPPP2PP/R1B1K1NR b KQkq -|q|"],"turnIndex":1,"winnerIds":["d7dc1928-3727-4351-b0ff-0e80c81c2953"],"initialFen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","backgroundId":"peoria-theater-18d28958df02","clockDuration":300000},"config":{"turnMs":300000,"version":"ptown-chess/1","timeBankMs":180000,"timeBankUses":2,"availabilityMs":129600000},"ordinal":1,"segment":10,"starter":"d7dc1928-3727-4351-b0ff-0e80c81c2953","match_id":"0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15","revision":22,"terminal":true,"game_type":"chess","expires_at":"2026-11-25T21:23:43.661+00:00","started_at":"2026-11-22T22:31:32.842+00:00","available_at":"2026-11-22T21:23:43.661+00:00","last_call_at":"2026-11-24T21:23:43.661+00:00","gameplay_due_at":"2026-11-22T22:36:32.766+00:00"}$child$::jsonb
 THEN RAISE EXCEPTION 'bob_play_money:target_changed'; END IF;
 SELECT pg_get_functiondef('private.delayed_terms_guard()'::regprocedure) INTO guard_def;
 IF md5(guard_def)<>'6313bed360158a4e583737a3bdd99a30'
  OR md5(pg_get_functiondef('public.admin_correct_chess_timeout(uuid,uuid,bigint,text,text)'::regprocedure))<>'712a21d6e8a56c05cda7fcf04e4c8ac4'
  OR md5(pg_get_functiondef('private.delayed_finalize(uuid)'::regprocedure))<>'76da498eb3eefede95a02f3296c0c1e7'
 THEN RAISE EXCEPTION 'bob_play_money:authority_changed'; END IF;
 before_i:=pg_temp.bob_preserved();
 SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) INTO original_entries FROM public.player_transactions t WHERE source_game_id=m.id;
 SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) INTO original_batches FROM public.gameplay_transfer_batches t WHERE game_id=m.id;
 SELECT jsonb_object_agg(profile_id::text,balance::text) INTO balances_before FROM (
  SELECT profile_id,sum(amount) balance FROM public.player_transactions WHERE profile_id IN(m.organizer,m.opponent) GROUP BY profile_id
 ) totals;

 -- Existing admin authority owns linked ledger reversals, balanced inverse
 -- chip transfer, immutable correction generation and exact Chess restoration.
 response:=public.admin_correct_chess_timeout(correction_id,c.id,22,
  '5bdda8f52dc85bff0bbcc02987be706e',reason_i);
 -- This narrowly scoped exception admits only true -> false for this parent,
 -- in this correction transaction, preserving every other frozen field.
 EXECUTE $guard$CREATE OR REPLACE FUNCTION private.delayed_terms_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_TABLE_NAME='delayed_matches' THEN
  -- Transaction-local exception for the single owner-approved correction.
  -- Restored to the original definition before this transaction can commit.
  IF OLD.id='0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15'::uuid
   AND OLD.real_money AND NOT NEW.real_money AND NEW.revision=OLD.revision+1
   AND (to_jsonb(NEW)-ARRAY['real_money','revision'])=(to_jsonb(OLD)-ARRAY['real_money','revision'])
   AND EXISTS(SELECT FROM private.delayed_corrections x
    WHERE x.id='5a61e531-b2b0-46ac-8876-7f043d9a3d38'::uuid AND x.match_id=OLD.id
     AND x.transaction_id=txid_current() AND x.executor_role=session_user
     AND x.actor=auth.uid() AND x.before_parent->>'real_money'='true'
     AND x.reason=$reason$Jeremy approved correcting the unintended $5 real-money Hap/Bobbalouie Chess match to play money on 2026-11-22; reverse the real-money timeout settlement and preserve the saved nine-move board with Bobbalouie to move. Original financial records remain immutable.$reason$)
  THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','accepted_at','settled_at','revision']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['status','accepted_at','settled_at','revision']) THEN RAISE EXCEPTION 'delayed:frozen_offer'; END IF;
 ELSE
  IF (NEW.id,NEW.match_id,NEW.ordinal,NEW.game_type,NEW.stake,NEW.config) IS DISTINCT FROM
     (OLD.id,OLD.match_id,OLD.ordinal,OLD.game_type,OLD.stake,OLD.config) OR
     (OLD.starter IS NOT NULL AND NEW.starter IS DISTINCT FROM OLD.starter) OR
     (OLD.terminal AND NEW IS DISTINCT FROM OLD AND NOT EXISTS(SELECT FROM private.delayed_corrections x WHERE x.child_id=OLD.id AND x.transaction_id=txid_current() AND x.executor_role=session_user AND x.before_child=to_jsonb(OLD) AND x.restored_child=to_jsonb(NEW)) AND NOT EXISTS(SELECT FROM private.delayed_timeout_restored_children r JOIN private.delayed_corrections x ON x.id=r.correction_id WHERE r.child_id=OLD.id AND x.transaction_id=txid_current() AND x.executor_role=session_user AND r.before_child=to_jsonb(OLD) AND r.restored_child=to_jsonb(NEW))) THEN RAISE EXCEPTION 'delayed:frozen_child'; END IF;
 END IF;
 RETURN NEW;
END $function$
$guard$;
 UPDATE private.delayed_matches SET real_money=false,revision=revision+1
 WHERE id=m.id AND real_money AND status='active';
 IF NOT FOUND THEN RAISE EXCEPTION 'bob_play_money:mode_not_corrected'; END IF;
 EXECUTE guard_def;
 -- Flush the canonical deferred chip journal before checking its receipt.
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
 IF pg_get_functiondef('private.delayed_terms_guard()'::regprocedure)<>guard_def
 THEN RAISE EXCEPTION 'bob_play_money:guard_not_restored'; END IF;

 IF (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.player_transactions t WHERE source_game_id=m.id AND transaction_type='SessionResult') IS DISTINCT FROM original_entries
  OR (SELECT count(*) FROM public.player_transactions WHERE source_game_id=m.id)<>4
  OR NOT (SELECT count(*)=2 AND sum(amount)=0 AND bool_and(
   transaction_type='Reversal' AND actor_id=auth.uid() AND notes=reason_i AND
   (profile_id=m.organizer AND amount=-5 AND reversal_of='28d1e2f5-5966-42da-87f8-8a4746047510'::uuid
    OR profile_id=m.opponent AND amount=5 AND reversal_of='8990e706-c2e7-4362-9b16-bef321ec252f'::uuid))
   FROM public.player_transactions WHERE source_game_id=m.id AND transaction_type='Reversal')
  OR NOT (SELECT count(*)=2 AND bool_and(chips=0) FROM public.players WHERE game_id=m.id)
  OR NOT (SELECT count(*)=2 AND bool_and(unmatched_deltas='{}') FROM public.gameplay_transfer_batches WHERE game_id=m.id)
  OR EXISTS(SELECT FROM jsonb_array_elements(original_batches) old
   WHERE NOT EXISTS(SELECT FROM public.gameplay_transfer_batches t WHERE to_jsonb(t)=old))
  OR NOT (SELECT real_money AND status='session_ended' FROM public.games WHERE id=m.id)
 THEN RAISE EXCEPTION 'bob_play_money:financial_postcondition'; END IF;
 IF NOT (SELECT NOT real_money AND status='active' AND settled_at IS NULL FROM private.delayed_matches WHERE id=m.id)
  OR NOT (SELECT NOT terminal AND actor=c.actor AND state->>'fen'=c.state->>'fen'
    AND state->'moves'=c.state->'moves' AND state->'captured'=c.state->'captured'
    AND state->'positions'=c.state->'positions' AND state->'banks'=c.state->'banks'
    AND state->'turn'=c.state->'turn' AND state->>'phase'='playing' AND state->>'opened'='false'
    AND started_at IS NULL AND gameplay_due_at IS NULL AND revision=c.revision+1 AND segment=c.segment+1
    FROM private.delayed_children WHERE id=c.id)
  OR EXISTS(SELECT FROM private.delayed_current_outcomes WHERE child_id=c.id)
  OR EXISTS(SELECT FROM private.delayed_current_settlements WHERE match_id=m.id)
  OR pg_temp.bob_preserved() IS DISTINCT FROM before_i
 THEN RAISE EXCEPTION 'bob_play_money:restoration_postcondition'; END IF;
 SELECT jsonb_object_agg(profile_id::text,balance::text) INTO balances_after FROM (
  SELECT profile_id,sum(amount) balance FROM public.player_transactions WHERE profile_id IN(m.organizer,m.opponent) GROUP BY profile_id
 ) totals;
 IF (balances_after->>m.organizer::text)::numeric<>(balances_before->>m.organizer::text)::numeric-5
  OR (balances_after->>m.opponent::text)::numeric<>(balances_before->>m.opponent::text)::numeric+5
 THEN RAISE EXCEPTION 'bob_play_money:wallet_delta'; END IF;
 RETURN response||jsonb_build_object('realMoney',false,'preservedMoves',jsonb_array_length(c.state->'moves'),
  'walletsBefore',balances_before,'walletsAfter',balances_after,'preservedFingerprints',before_i);
END $restore$;

SELECT set_config('request.jwt.claim.sub','d7dc1928-3727-4351-b0ff-0e80c81c2953',true);
SELECT set_config('request.jwt.claims','{"sub":"d7dc1928-3727-4351-b0ff-0e80c81c2953","role":"authenticated"}',true);
SELECT pg_temp.restore_bob_play_money() AS approved_correction;

