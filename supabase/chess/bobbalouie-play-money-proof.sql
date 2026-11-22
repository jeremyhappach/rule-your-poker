-- Exact target proof; run after bobbalouie-play-money-correction.sql in BEGIN/ROLLBACK.
CREATE OR REPLACE FUNCTION pg_temp.bob_assert(ok boolean,label text) RETURNS void
LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'bob_proof:%',label; END IF; END $$;
CREATE TEMP TABLE bob_checks(label text) ON COMMIT DROP;
CREATE TEMP TABLE bob_baseline ON COMMIT DROP AS SELECT
 (SELECT to_jsonb(m) FROM private.delayed_matches m WHERE id='0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15') parent,
 (SELECT to_jsonb(c) FROM private.delayed_children c WHERE id='b1795d0c-51a3-47b8-a6b8-1e324b3f34d8') child,
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.player_transactions t WHERE source_game_id='0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15') ledger,
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.gameplay_transfer_batches t WHERE game_id='0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15') transfers,
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.players t WHERE game_id='0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15') players,
 pg_temp.bob_preserved() preserved;

SELECT set_config('request.jwt.claim.sub','201d2c6b-a58e-4b6a-a21d-8cda3360c860',true);
SELECT set_config('request.jwt.claims','{"sub":"201d2c6b-a58e-4b6a-a21d-8cda3360c860","role":"authenticated"}',true);
DO $$BEGIN
 BEGIN PERFORM pg_temp.restore_bob_play_money(); RAISE EXCEPTION 'bob_proof:unauthorized_accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.bob_assert((SELECT to_jsonb(m) FROM private.delayed_matches m WHERE id='0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15')=(SELECT parent FROM bob_baseline),'unauthorized_preserves_parent');
END $$;
INSERT INTO bob_checks VALUES('non-admin rejection');

SELECT set_config('request.jwt.claim.sub','d7dc1928-3727-4351-b0ff-0e80c81c2953',true);
SELECT set_config('request.jwt.claims','{"sub":"d7dc1928-3727-4351-b0ff-0e80c81c2953","role":"authenticated"}',true);
CREATE OR REPLACE FUNCTION pg_temp.bob_fault() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF OLD.id='0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15' AND OLD.real_money AND NOT NEW.real_money
 THEN RAISE EXCEPTION 'bob_proof:injected_after_reversals'; END IF; RETURN NEW; END $$;
CREATE TRIGGER bob_proof_fault BEFORE UPDATE OF real_money ON private.delayed_matches FOR EACH ROW EXECUTE FUNCTION pg_temp.bob_fault();
DO $$BEGIN
 BEGIN PERFORM pg_temp.restore_bob_play_money(); RAISE EXCEPTION 'bob_proof:fault_not_reached';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'bob_proof:injected_after_reversals' THEN RAISE; END IF; END;
 PERFORM pg_temp.bob_assert((SELECT to_jsonb(m) FROM private.delayed_matches m WHERE id='0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15')=(SELECT parent FROM bob_baseline),'fault_parent');
 PERFORM pg_temp.bob_assert((SELECT to_jsonb(c) FROM private.delayed_children c WHERE id='b1795d0c-51a3-47b8-a6b8-1e324b3f34d8')=(SELECT child FROM bob_baseline),'fault_board');
 PERFORM pg_temp.bob_assert((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.player_transactions t WHERE source_game_id='0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15')=(SELECT ledger FROM bob_baseline),'fault_ledger');
 PERFORM pg_temp.bob_assert((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.gameplay_transfer_batches t WHERE game_id='0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15')=(SELECT transfers FROM bob_baseline),'fault_transfers');
 PERFORM pg_temp.bob_assert((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.players t WHERE game_id='0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15')=(SELECT players FROM bob_baseline),'fault_canonical_chips');
 PERFORM pg_temp.bob_assert(NOT EXISTS(SELECT FROM private.delayed_corrections WHERE id='5a61e531-b2b0-46ac-8876-7f043d9a3d38'),'fault_no_audit');
 PERFORM pg_temp.bob_assert(md5(pg_get_functiondef('private.delayed_terms_guard()'::regprocedure))='6313bed360158a4e583737a3bdd99a30','fault_guard_restored');
END $$;
DROP TRIGGER bob_proof_fault ON private.delayed_matches;
INSERT INTO bob_checks VALUES('injected failure rolls back reversals, chip transfers, board, money mode and guard');

CREATE TEMP TABLE bob_actual_report(data jsonb) ON COMMIT DROP;
INSERT INTO bob_actual_report SELECT pg_temp.restore_bob_play_money();
DO $check$
DECLARE c private.delayed_children;answer jsonb;old_request private.chess_requests;before_c jsonb;who uuid;
BEGIN
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id='b1795d0c-51a3-47b8-a6b8-1e324b3f34d8';
 before_c:=to_jsonb(c);
 PERFORM pg_temp.bob_assert((SELECT data#>>'{walletsAfter,d7dc1928-3727-4351-b0ff-0e80c81c2953}'='-79.00' AND data#>>'{walletsAfter,201d2c6b-a58e-4b6a-a21d-8cda3360c860}'='0.00' FROM bob_actual_report),'exact_current_wallets');
 answer:=pg_temp.restore_bob_play_money();
 PERFORM pg_temp.bob_assert(answer->>'outcome'='already_corrected','duplicate_correction');
 PERFORM private.chess_sync('async',c.id);
 PERFORM pg_temp.bob_assert((SELECT to_jsonb(t) FROM private.delayed_children t WHERE id=c.id)=before_c,'zero_client_preserves_unopened_turn');
 PERFORM pg_temp.bob_assert(NOT private.delayed_expire(c.id,10,'2026-11-22T22:36:32.766Z'::timestamptz),'old_expiry_fenced');
 answer:=public.chess_commit('async',c.id,c.actor,22,c.state,gen_random_uuid(),'{"revision":22,"intent":{"type":"open"}}');
 PERFORM pg_temp.bob_assert(answer->>'outcome'='stale','stale_action_fenced');
 SELECT * INTO STRICT old_request FROM private.chess_requests WHERE mode='async' AND match_id=c.id
  AND actor=c.actor AND fingerprint#>>'{intent,type}'='open' ORDER BY (fingerprint->>'revision')::bigint DESC LIMIT 1;
 answer:=public.chess_commit('async',c.id,c.actor,(old_request.fingerprint->>'revision')::bigint,c.state,old_request.request_id,old_request.fingerprint);
 PERFORM pg_temp.bob_assert(answer->>'outcome'='duplicate','old_open_replay');
 PERFORM pg_temp.bob_assert((SELECT to_jsonb(t) FROM private.delayed_children t WHERE id=c.id)=before_c,'old_open_does_not_restart_clock');
 BEGIN UPDATE private.delayed_matches SET real_money=true WHERE id=c.match_id;
  RAISE EXCEPTION 'bob_proof:frozen_guard_missing';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:frozen_offer' THEN RAISE; END IF; END;
 FOREACH who IN ARRAY ARRAY['d7dc1928-3727-4351-b0ff-0e80c81c2953','201d2c6b-a58e-4b6a-a21d-8cda3360c860']::uuid[] LOOP
  PERFORM set_config('request.jwt.claim.sub',who::text,true);
  answer:=public.delayed_home(c.match_id);
  PERFORM pg_temp.bob_assert(answer->>'status'='active' AND answer->>'realMoney'='false' AND answer->>'net'='0','both_players_play_money_home');
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub','d7dc1928-3727-4351-b0ff-0e80c81c2953',true);
END $check$;
INSERT INTO bob_checks VALUES('exact linked reversals and preserved nine-move board'),('duplicate and stale requests fenced; ordinary money-mode guard restored'),('both participants see active play-money match');

DO $future$
DECLARE expected int;winner uuid;loser uuid;c private.delayed_children;m private.delayed_matches;
 state_i jsonb;answer jsonb;receipt jsonb;financial uuid;tx_count bigint;delta numeric;who uuid;
BEGIN
 FOR expected IN -1..1 LOOP
  BEGIN
   SELECT * INTO c FROM private.delayed_children WHERE id='b1795d0c-51a3-47b8-a6b8-1e324b3f34d8';
   SELECT * INTO m FROM private.delayed_matches WHERE id=c.match_id;
   SELECT count(*) INTO tx_count FROM public.player_transactions;
   winner:=CASE WHEN expected=1 THEN m.organizer WHEN expected=-1 THEN m.opponent END;
   loser:=CASE WHEN expected=1 THEN m.opponent ELSE m.organizer END;
   IF expected=0 THEN
    -- Trusted outcome boundary only: financial tie proof, not a fabricated
    -- permanent game or a claim that this nine-move position is already drawn.
    PERFORM private.delayed_record_outcome(c.id,c.revision,'draw',NULL,'{"qualification":"play-money future draw"}');
   ELSE
    state_i:=c.state||jsonb_build_object('phase','complete','reason','resignation','winnerIds',jsonb_build_array(winner),
     'scores',jsonb_build_object(m.organizer::text,CASE WHEN winner=m.organizer THEN 1 ELSE 0 END,m.opponent::text,CASE WHEN winner=m.opponent THEN 1 ELSE 0 END));
    answer:=public.chess_commit('async',c.id,loser,c.revision,state_i,gen_random_uuid(),jsonb_build_object('revision',c.revision,'intent',jsonb_build_object('type','resign')));
    PERFORM pg_temp.bob_assert(answer->>'outcome'='committed','authorized_future_forfeit');
   END IF;
   receipt:=private.delayed_finalize(m.id);
   financial:=(receipt->>'game_id')::uuid;
   SET CONSTRAINTS ALL IMMEDIATE;
   SET CONSTRAINTS ALL DEFERRED;
   PERFORM pg_temp.bob_assert(receipt=private.delayed_finalize(m.id),'future_settlement_replay');
   PERFORM pg_temp.bob_assert((receipt->>'organizer_delta')::int=expected*5 AND (receipt->>'opponent_delta')::int=-expected*5,'future_exact_stake');
   PERFORM pg_temp.bob_assert(financial<>m.id AND (SELECT NOT real_money AND status='session_ended' FROM public.games WHERE id=financial),'future_generation_nonfinancial');
   PERFORM pg_temp.bob_assert((SELECT count(*) FROM public.player_transactions)=tx_count AND NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=financial),'future_no_wallet_writes');
   PERFORM pg_temp.bob_assert((SELECT count(*)=2 AND sum(chips)=0 AND bool_and(chips=CASE WHEN user_id=m.organizer THEN expected*5 ELSE -expected*5 END) FROM public.players WHERE game_id=financial),'future_canonical_chips');
   PERFORM pg_temp.bob_assert((SELECT count(*)=2 AND bool_and(chips=CASE WHEN user_id=m.organizer THEN expected*5 ELSE -expected*5 END) FROM public.session_player_snapshots WHERE game_id=financial),'future_final_snapshots');
   PERFORM pg_temp.bob_assert((SELECT count(*)=CASE WHEN expected=0 THEN 0 ELSE 1 END AND coalesce(bool_and(unmatched_deltas='{}'),true) FROM public.gameplay_transfer_batches WHERE game_id=financial),'future_balanced_transfers');
   answer:=pg_temp.restore_bob_play_money();
   PERFORM pg_temp.bob_assert(answer->>'outcome'='already_corrected' AND receipt=private.delayed_finalize(m.id),'late_correction_preserves_successor');
   INSERT INTO private.delayed_review_seen(event_id,viewer)
    SELECT e.id,u FROM private.delayed_current_review_events e CROSS JOIN unnest(ARRAY[m.organizer,m.opponent])u WHERE e.match_id=m.id ON CONFLICT DO NOTHING;
   FOREACH who IN ARRAY ARRAY[m.opponent,m.organizer] LOOP
    PERFORM set_config('request.jwt.claim.sub',who::text,true);
    PERFORM public.delayed_finale_ack(m.id);
    PERFORM public.delayed_finale_ack(m.id);
   END LOOP;
   PERFORM pg_temp.bob_assert((SELECT count(*)=2 FROM private.delayed_current_finale_seen WHERE match_id=m.id),'future_finale_continuation');
   SET CONSTRAINTS ALL IMMEDIATE;
   RAISE EXCEPTION 'bob_proof:rollback_future' USING ERRCODE='P9901';
  EXCEPTION WHEN SQLSTATE 'P9901' THEN NULL;
  END;
  INSERT INTO bob_checks VALUES('future outcome '||expected||': fake settlement, canonical chips, balanced transfers, snapshots, replay and continuation');
 END LOOP;
END $future$;
SELECT set_config('request.jwt.claim.sub','d7dc1928-3727-4351-b0ff-0e80c81c2953',true);
SELECT jsonb_build_object('checks',(SELECT jsonb_agg(label) FROM bob_checks),'correction',(SELECT data FROM bob_actual_report)) AS proof;
