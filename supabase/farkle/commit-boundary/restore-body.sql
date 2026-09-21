DO $guard$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.farkle_settle_v1(uuid)'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('a5963592039a14b110b251a2305652a9','e4b72f5ee9376b4791e83be0db15ab9f') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']::text[] AND p.proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false) THEN RAISE EXCEPTION 'farkle_transfer:definition_or_metadata_drift'; END IF; END $guard$;
DO $guard$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='finalize_gameplay_transfer_batch()'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('5459fd01314cee7fe3fff421ce5e11b4','5d1c8703caee40ce7392d4eb6de1aaf9') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=public']::text[] AND p.proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false) THEN RAISE EXCEPTION 'farkle_transfer:definition_or_metadata_drift'; END IF; END $guard$;
-- Lock gameplay before taking exclusive creation ownership; wait out in-flight actions.
SELECT id FROM public.games WHERE game_type='farkle' ORDER BY id FOR UPDATE;
SELECT pg_advisory_xact_lock(19092026,1);
UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
DO $quiesce$ BEGIN
 IF EXISTS(SELECT 1 FROM public.games WHERE game_type='farkle' AND status IN ('ante_decision','in_progress','game_over'))
 OR EXISTS(SELECT 1 FROM private.farkle_terminal_transfers_v2) THEN
 RAISE EXCEPTION 'farkle_transfer:active_games_require_compatible_recovery'; END IF;
END $quiesce$;
CREATE OR REPLACE FUNCTION private.farkle_settle_v1(round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); r public.rounds; g public.games; d public.dealer_games; existing public.game_results; s jsonb;
 winner uuid; count_players integer; stake integer; gain integer; changes jsonb; winner_name text; result_id uuid; disposition text;
BEGIN
 SELECT * INTO r FROM public.rounds WHERE id=round_id FOR UPDATE;
 SELECT * INTO g FROM public.games WHERE id=r.game_id FOR UPDATE;
 SELECT * INTO d FROM public.dealer_games WHERE id=r.dealer_game_id AND session_id=r.game_id AND game_type='farkle';
 s:=r.farkle_state; winner:=(s->>'winnerPlayerId')::uuid;
 IF NOT FOUND OR s->>'gamePhase' IS DISTINCT FROM 'complete' OR winner IS NULL OR s->'config' IS DISTINCT FROM d.config
 THEN RAISE EXCEPTION 'farkle:not_settleable'; END IF;
 stake:=(d.config->>'ante_amount')::integer; count_players:=jsonb_array_length(s->'turnOrder'); gain:=stake*(count_players-1);
 SELECT jsonb_object_agg(value,CASE WHEN value::uuid=winner THEN gain ELSE -stake END) INTO changes FROM jsonb_array_elements_text(s->'turnOrder');
 SELECT * INTO existing FROM public.game_results WHERE dealer_game_id=d.id AND hand_number=r.hand_number AND settlement_key='farkle_terminal';
 IF FOUND THEN
  IF existing.winner_player_id IS DISTINCT FROM winner OR existing.player_chip_changes IS DISTINCT FROM changes OR r.status<>'completed'
  THEN RAISE EXCEPTION 'farkle:inconsistent_settlement'; END IF;
  PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','already_settled','result_id',existing.id,'winner_player_id',winner);
 END IF;
 IF g.current_game_uuid IS DISTINCT FROM d.id OR g.game_type<>'farkle' OR g.status<>'in_progress' OR g.is_paused
 OR g.current_round<>r.round_number OR g.total_hands<>r.hand_number OR g.pot<>0
 THEN RAISE EXCEPTION 'farkle:stale_settlement'; END IF;
 PERFORM private.farkle_claim_v1(g.id,d.id,r.id,'action');
 PERFORM 1 FROM public.players WHERE game_id=g.id AND s->'playerStates' ? id::text ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM public.players WHERE game_id=g.id AND s->'playerStates' ? id::text)<>count_players THEN RAISE EXCEPTION 'farkle:roster_changed'; END IF;
 SELECT coalesce(pr.username,CASE WHEN p.is_bot THEN 'Bot' ELSE 'Player '||p.position END) INTO winner_name
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.id=winner AND p.game_id=g.id;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(g.id,d.id,r.hand_number,'farkle_terminal','farkle',winner,winner_name,'Score: '||(s->'playerStates'->winner::text->>'banked'),gain,changes,false) RETURNING id INTO result_id;
 UPDATE public.players SET chips=chips+(changes->>id::text)::integer WHERE game_id=g.id AND changes ? id::text;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=r.id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,d.id,p.id,p.user_id,coalesce(pr.username,CASE WHEN p.is_bot THEN 'Bot' ELSE 'Player '||p.position END),p.chips,p.is_bot,r.hand_number
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=excluded.chips,user_id=excluded.user_id,username=excluded.username,is_bot=excluded.is_bot,created_at=excluded.created_at;
 disposition:=CASE WHEN g.pending_session_end THEN 'session_ended' ELSE 'game_over' END;
 UPDATE public.games SET status=disposition,pot=0,awaiting_next_round=false,last_round_result=winner_name||' wins!',game_over_at=clock_timestamp(),
  session_ended_at=CASE WHEN g.pending_session_end THEN clock_timestamp() ELSE session_ended_at END,
  pending_session_end=CASE WHEN g.pending_session_end THEN false ELSE pending_session_end END WHERE id=g.id;
 PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','settled','result_id',result_id,'winner_player_id',winner,'amount_per_loser',stake,'total_winner_gain',gain,'terminal_disposition',disposition);
END $function$
;
CREATE OR REPLACE FUNCTION public.finalize_gameplay_transfer_batch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction_id bigint := txid_current();
  v_game_id uuid;
  v_dealer_game_id uuid;
  v_cursor bigint;
  v_opening jsonb;
  v_closing jsonb;
  v_transfers jsonb;
  v_unmatched jsonb;
  v_reason text;
  v_stage_reason text;
  v_has_pot boolean;
  v_split_normal_357_terminal boolean;
  v_split_holm_showdown boolean;
  v_split_projection boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.gameplay_transfer_pending_changes
     WHERE transaction_id = v_transaction_id
  ) THEN
    RETURN NULL;
  END IF;

  FOR v_game_id IN
    SELECT DISTINCT game_id
      FROM public.gameplay_transfer_pending_changes
     WHERE transaction_id = v_transaction_id
     ORDER BY game_id
  LOOP
    -- Normal 3-5-7 and multi-player Holm each publish two semantic financial
    -- stages in a single settlement transaction. Other games retain their
    -- existing one-batch net projection.
    SELECT
      g.game_type IN ('3-5-7', '3-5-7-game', '357')
      AND bool_or(change.reason = 'leg')
      AND bool_or(change.reason = 'sweep')
      AND bool_or(change.reason = 'transfer')
      INTO v_split_normal_357_terminal
      FROM public.games g
      JOIN public.gameplay_transfer_pending_changes change
        ON change.game_id = g.id
       AND change.transaction_id = v_transaction_id
     WHERE g.id = v_game_id
     GROUP BY g.game_type;
    v_split_normal_357_terminal := COALESCE(v_split_normal_357_terminal, false);

    SELECT
      g.game_type IN ('holm', 'holm-game')
      AND bool_or(change.reason = 'win')
      AND bool_or(change.reason = 'transfer')
      INTO v_split_holm_showdown
      FROM public.games g
      JOIN public.gameplay_transfer_pending_changes change
        ON change.game_id = g.id
       AND change.transaction_id = v_transaction_id
     WHERE g.id = v_game_id
     GROUP BY g.game_type;
    v_split_holm_showdown := COALESCE(v_split_holm_showdown, false);
    v_split_projection := v_split_normal_357_terminal OR v_split_holm_showdown;

    FOR v_stage_reason IN
      SELECT stage_reason
        FROM (
          SELECT NULL::text AS stage_reason, 0 AS stage_order
           WHERE NOT v_split_projection
          UNION ALL
          SELECT 'leg', 1
           WHERE v_split_normal_357_terminal
          UNION ALL
          SELECT 'sweep', 2
           WHERE v_split_normal_357_terminal
          UNION ALL
          SELECT 'win', 1
           WHERE v_split_holm_showdown
          UNION ALL
          SELECT 'transfer', CASE WHEN v_split_normal_357_terminal THEN 3 ELSE 2 END
           WHERE v_split_normal_357_terminal OR v_split_holm_showdown
        ) stages
       ORDER BY stage_order
    LOOP
      SELECT COALESCE(jsonb_object_agg(endpoint_key, opening_balance), '{}'::jsonb)
        INTO v_opening
        FROM (
          SELECT DISTINCT ON (endpoint_key) endpoint_key, opening_balance
            FROM public.gameplay_transfer_pending_changes
           WHERE transaction_id = v_transaction_id
             AND game_id = v_game_id
             AND (NOT v_split_projection OR reason = v_stage_reason)
           ORDER BY endpoint_key, id
        ) opening_values;

      SELECT COALESCE(jsonb_object_agg(endpoint_key, closing_balance), '{}'::jsonb)
        INTO v_closing
        FROM (
          SELECT DISTINCT ON (endpoint_key) endpoint_key, closing_balance
            FROM public.gameplay_transfer_pending_changes
           WHERE transaction_id = v_transaction_id
             AND game_id = v_game_id
             AND (NOT v_split_projection OR reason = v_stage_reason)
           ORDER BY endpoint_key, id DESC
        ) closing_values;

      IF v_split_projection THEN
        v_reason := v_stage_reason;
      ELSE
        SELECT CASE WHEN count(DISTINCT reason) = 1 THEN min(reason) ELSE 'transfer' END
          INTO v_reason
          FROM public.gameplay_transfer_pending_changes
         WHERE transaction_id = v_transaction_id
           AND game_id = v_game_id;
      END IF;

      -- Cursors advance once per ordered presentation batch and only lock the
      -- affected game. The final raw player/pot rows carry the last cursor;
      -- the client keeps the predecessor owned until its queued successor
      -- starts, so no stale absolute row can leak between stages.
      UPDATE public.games
         SET chip_transfer_cursor = chip_transfer_cursor + 1
       WHERE id = v_game_id
       RETURNING current_game_uuid, chip_transfer_cursor
        INTO v_dealer_game_id, v_cursor;

      IF v_cursor IS NULL THEN
        RAISE EXCEPTION 'gameplay_transfer_batch:game_not_found:%', v_game_id;
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_opening) AS endpoint(key) WHERE key = 'pot'
      ) INTO v_has_pot;

      IF v_has_pot THEN
        UPDATE public.games
           SET pot_transfer_cursor = v_cursor
         WHERE id = v_game_id;
      END IF;

      UPDATE public.players p
         SET chip_transfer_cursor = v_cursor
       WHERE p.game_id = v_game_id
         AND ('player:' || p.id::text) IN (
           SELECT key FROM jsonb_object_keys(v_opening) AS endpoint(key)
         );

      WITH deltas AS (
        SELECT key AS endpoint_key,
               COALESCE((v_closing ->> key)::integer, 0)
                 - COALESCE((v_opening ->> key)::integer, 0) AS delta
          FROM jsonb_object_keys(v_opening) AS endpoint(key)
      ), sources AS (
        SELECT endpoint_key,
               -delta AS amount,
               COALESCE(sum(-delta) OVER (ORDER BY endpoint_key ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS start_at,
               sum(-delta) OVER (ORDER BY endpoint_key) AS end_at
          FROM deltas
         WHERE delta < 0
      ), sinks AS (
        SELECT endpoint_key,
               delta AS amount,
               COALESCE(sum(delta) OVER (ORDER BY endpoint_key ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS start_at,
               sum(delta) OVER (ORDER BY endpoint_key) AS end_at
          FROM deltas
         WHERE delta > 0
      ), pairs AS (
        SELECT s.endpoint_key AS from_key,
               t.endpoint_key AS to_key,
               LEAST(s.end_at, t.end_at) - GREATEST(s.start_at, t.start_at) AS amount
        FROM sources s
        JOIN sinks t
          ON s.start_at < t.end_at
         AND t.start_at < s.end_at
      ), numbered_pairs AS (
        SELECT from_key, to_key, amount,
               row_number() OVER (ORDER BY from_key, to_key) AS sequence
        FROM pairs
       WHERE amount > 0
      )
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', v_game_id::text || ':' || v_cursor::text || ':' || sequence::text,
          'amount', amount,
          'from', CASE WHEN from_key = 'pot'
            THEN jsonb_build_object('kind', 'pot')
            ELSE jsonb_build_object('kind', 'player', 'playerId', substring(from_key from 8)) END,
          'to', CASE WHEN to_key = 'pot'
            THEN jsonb_build_object('kind', 'pot')
            ELSE jsonb_build_object('kind', 'player', 'playerId', substring(to_key from 8)) END
        ) ORDER BY sequence
      ), '[]'::jsonb)
        INTO v_transfers
        FROM numbered_pairs;

      WITH deltas AS (
        SELECT key AS endpoint_key,
               COALESCE((v_closing ->> key)::integer, 0)
                 - COALESCE((v_opening ->> key)::integer, 0) AS delta
          FROM jsonb_object_keys(v_opening) AS endpoint(key)
      ), totals AS (
        SELECT COALESCE(sum(-delta) FILTER (WHERE delta < 0), 0) AS sources,
               COALESCE(sum(delta) FILTER (WHERE delta > 0), 0) AS sinks
          FROM deltas
      )
      SELECT COALESCE(jsonb_object_agg(endpoint_key, delta), '{}'::jsonb)
        INTO v_unmatched
        FROM deltas, totals
       WHERE (totals.sources <> totals.sinks) AND delta <> 0;

      INSERT INTO public.gameplay_transfer_batches (
        game_id, dealer_game_id, cursor, reason, transfers,
        opening_balances, closing_balances, unmatched_deltas
      ) VALUES (
        v_game_id, v_dealer_game_id, v_cursor, COALESCE(v_reason, 'transfer'),
        v_transfers, v_opening, v_closing, v_unmatched
      );
    END LOOP;

    DELETE FROM public.gameplay_transfer_pending_changes
     WHERE transaction_id = v_transaction_id
       AND game_id = v_game_id;
  END LOOP;

  RETURN NULL;
END;
$function$
;
DO $guard$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.farkle_settle_v1(uuid)'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('a5963592039a14b110b251a2305652a9') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']::text[] AND p.proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false) THEN RAISE EXCEPTION 'farkle_transfer:definition_or_metadata_drift'; END IF; END $guard$;
DO $guard$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='finalize_gameplay_transfer_batch()'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('5459fd01314cee7fe3fff421ce5e11b4') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=public']::text[] AND p.proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false) THEN RAISE EXCEPTION 'farkle_transfer:definition_or_metadata_drift'; END IF; END $guard$;
