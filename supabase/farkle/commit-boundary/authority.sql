-- A single-use, transaction-bound handoff. Never exposed through PostgREST.
CREATE TABLE IF NOT EXISTS private.farkle_terminal_transfers_v2 (
 transaction_id bigint NOT NULL,
 game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
 dealer_game_id uuid NOT NULL,
 round_id uuid NOT NULL,
 result_id uuid NOT NULL,
 action_sequence bigint NOT NULL,
 opening_balances jsonb NOT NULL,
 closing_balances jsonb NOT NULL,
 PRIMARY KEY(transaction_id,game_id)
);
ALTER TABLE private.farkle_terminal_transfers_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.farkle_terminal_transfers_v2 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.farkle_begin_terminal_transfer_v2(
 p_game uuid,p_transaction bigint,p_opening jsonb,p_closing jsonb
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE t private.farkle_terminal_transfers_v2; r public.rounds; g public.games;
 d public.dealer_games; result public.game_results; live_balances jsonb;
 prior_claim text:=coalesce(current_setting('app.farkle_authority',true),'');
BEGIN
 IF pg_trigger_depth()<>1 OR p_transaction<>txid_current() THEN
  RAISE EXCEPTION 'farkle_transfer:deferred_context_required';
 END IF;
 SELECT * INTO t FROM private.farkle_terminal_transfers_v2
  WHERE transaction_id=p_transaction AND game_id=p_game FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'farkle_transfer:handoff_required'; END IF;
 SELECT * INTO g FROM public.games WHERE id=t.game_id;
 SELECT * INTO r FROM public.rounds WHERE id=t.round_id;
 SELECT * INTO d FROM public.dealer_games WHERE id=t.dealer_game_id;
 SELECT * INTO result FROM public.game_results WHERE id=t.result_id;
 SELECT jsonb_object_agg('player:'||p.id::text,p.chips) INTO live_balances
  FROM public.players p WHERE p.game_id=p_game AND p_opening ? ('player:'||p.id::text);
 IF g.game_type IS DISTINCT FROM 'farkle' OR g.current_game_uuid IS DISTINCT FROM d.id
  OR g.status NOT IN ('game_over','session_ended') OR d.session_id IS DISTINCT FROM g.id
  OR d.game_type IS DISTINCT FROM 'farkle' OR r.game_id IS DISTINCT FROM g.id
  OR r.dealer_game_id IS DISTINCT FROM d.id OR r.status IS DISTINCT FROM 'completed'
  OR r.farkle_state->>'gamePhase' IS DISTINCT FROM 'complete'
  OR r.farkle_state->'config' IS DISTINCT FROM d.config
  OR (r.farkle_state->>'actionSequence')::bigint IS DISTINCT FROM t.action_sequence
  OR result.dealer_game_id IS DISTINCT FROM d.id OR result.settlement_key IS DISTINCT FROM 'farkle_terminal'
  OR result.winner_player_id::text IS DISTINCT FROM r.farkle_state->>'winnerPlayerId'
  OR t.opening_balances IS DISTINCT FROM p_opening OR t.closing_balances IS DISTINCT FROM p_closing
  OR live_balances IS DISTINCT FROM p_closing
  OR NOT EXISTS(SELECT 1 FROM private.farkle_events e WHERE e.round_id=r.id
    AND e.sequence=t.action_sequence AND e.state_after=r.farkle_state AND e.config_hash=md5(d.config::text))
  OR NOT EXISTS(SELECT 1 FROM private.farkle_action_receipts a WHERE a.round_id=r.id
    AND a.response->>'action_sequence'=t.action_sequence::text AND a.response->'state'=r.farkle_state)
 THEN RAISE EXCEPTION 'farkle_transfer:terminal_identity_mismatch'; END IF;
 DELETE FROM private.farkle_terminal_transfers_v2 WHERE transaction_id=p_transaction AND game_id=p_game;
 PERFORM private.farkle_claim_v1(g.id,d.id,r.id,'action');
 RETURN prior_claim;
END $fn$;
REVOKE ALL ON FUNCTION private.farkle_begin_terminal_transfer_v2(uuid,bigint,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
