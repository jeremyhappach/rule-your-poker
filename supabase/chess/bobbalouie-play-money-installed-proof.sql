-- Run after bobbalouie-play-money-correction.sql inside BEGIN/ROLLBACK.

CREATE OR REPLACE FUNCTION pg_temp.bob_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'bob_installed:%',label; END IF; END $$;
CREATE TEMP TABLE bob_checks(label text) ON COMMIT DROP;
SELECT set_config('request.jwt.claim.sub','d7dc1928-3727-4351-b0ff-0e80c81c2953',true);
SELECT set_config('request.jwt.claims','{"sub":"d7dc1928-3727-4351-b0ff-0e80c81c2953","role":"authenticated"}',true);
SELECT pg_temp.bob_assert(pg_temp.restore_bob_play_money()->>'outcome'='already_corrected','installed_idempotent');
SELECT pg_temp.bob_assert((SELECT NOT m.real_money AND m.status='active' AND m.revision=26 AND NOT c.terminal AND c.revision=23 AND c.segment=11 AND c.actor=m.opponent AND c.state->>'phase'='playing' AND c.state->>'opened'='false' AND c.started_at IS NULL AND c.gameplay_due_at IS NULL AND c.state->'moves'=x.before_child#>'{state,moves}' AND c.state->>'fen'=x.before_child#>>'{state,fen}' FROM private.delayed_matches m JOIN private.delayed_children c ON c.match_id=m.id JOIN private.delayed_corrections x ON x.child_id=c.id WHERE x.id='5a61e531-b2b0-46ac-8876-7f043d9a3d38'),'restored_saved_position');
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

SELECT jsonb_build_object(
 'checks',(SELECT jsonb_agg(label) FROM bob_checks),
 'migration',(SELECT version FROM supabase_migrations.schema_migrations WHERE name='restore_bobbalouie_chess_as_play_money'),
 'match',(SELECT jsonb_build_object('id',id,'status',status,'realMoney',real_money,'revision',revision) FROM private.delayed_matches WHERE id='0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15'),
 'child',(SELECT jsonb_build_object('id',id,'actor',actor,'revision',revision,'segment',segment,'terminal',terminal,'moves',jsonb_array_length(state->'moves'),'fen',state->>'fen','opened',state->'opened','expiresAt',expires_at,'gameplayDueAt',gameplay_due_at) FROM private.delayed_children WHERE id='b1795d0c-51a3-47b8-a6b8-1e324b3f34d8'),
 'correction',(SELECT to_jsonb(x)-ARRAY['before_parent','before_child','restored_child','original_outcome','original_settlement'] FROM private.delayed_corrections x WHERE id='5a61e531-b2b0-46ac-8876-7f043d9a3d38'),
 'entries',(SELECT jsonb_agg(jsonb_build_object('id',id,'profileId',profile_id,'amount',amount,'type',transaction_type,'reversalOf',reversal_of,'actor',actor_id,'notes',notes) ORDER BY created_at,id) FROM public.player_transactions WHERE source_game_id='0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15'),
 'chips',(SELECT jsonb_object_agg(user_id::text,chips) FROM public.players WHERE game_id='0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15'),
 'wallets',(SELECT jsonb_object_agg(profile_id::text,balance) FROM (SELECT profile_id,sum(amount) balance FROM public.player_transactions WHERE profile_id IN('d7dc1928-3727-4351-b0ff-0e80c81c2953','201d2c6b-a58e-4b6a-a21d-8cda3360c860') GROUP BY profile_id) q),
 'transfers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY cursor) FROM public.gameplay_transfer_batches t WHERE game_id='0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15'),
 'currentOutcomes',(SELECT count(*) FROM private.delayed_current_outcomes WHERE child_id='b1795d0c-51a3-47b8-a6b8-1e324b3f34d8'),
 'currentSettlements',(SELECT count(*) FROM private.delayed_current_settlements WHERE match_id='0c2059c0-0d44-4e22-a2c5-d4b1eadd9f15'),
 'guardMd5',md5(pg_get_functiondef('private.delayed_terms_guard()'::regprocedure))
) as installed;

