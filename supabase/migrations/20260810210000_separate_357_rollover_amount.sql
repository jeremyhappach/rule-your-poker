-- 3-5-7 collects an opening ante once, then a distinct per-player rollover
-- when Round 3 advances to the next hand's Round 1.

ALTER TABLE public.game_defaults
  ADD COLUMN IF NOT EXISTS rollover_amount integer NOT NULL DEFAULT 1;

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS rollover_amount integer NOT NULL DEFAULT 1;

ALTER TABLE public.game_defaults
  DROP CONSTRAINT IF EXISTS game_defaults_rollover_amount_positive;

ALTER TABLE public.game_defaults
  ADD CONSTRAINT game_defaults_rollover_amount_positive
  CHECK (rollover_amount >= 1);

ALTER TABLE public.games
  DROP CONSTRAINT IF EXISTS games_rollover_amount_positive;

ALTER TABLE public.games
  ADD CONSTRAINT games_rollover_amount_positive
  CHECK (rollover_amount >= 1);

UPDATE public.game_defaults
   SET rollover_amount = 1
 WHERE game_type = '3-5-7';

-- Keep the proven locked transition implementation private. The public wrapper
-- below owns the new rule: it derives rollover from the persisted game config,
-- never from a browser argument.
DO $migration$
BEGIN
  IF to_regprocedure(
    'public.advance_357_round(uuid,uuid,integer,integer,timestamp with time zone,integer,jsonb)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.advance_357_round_legacy(uuid,uuid,integer,integer,timestamp with time zone,integer,jsonb)'
  ) IS NULL THEN
    EXECUTE
      'ALTER FUNCTION public.advance_357_round(uuid,uuid,integer,integer,timestamp with time zone,integer,jsonb) '
      || 'RENAME TO advance_357_round_legacy';
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.advance_357_round(
  _game_id uuid,
  _dealer_game_id uuid,
  _next_round_number integer,
  _next_hand_number integer,
  _decision_deadline timestamp with time zone,
  _forced_hand_by_player jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_rollover_amount integer;
  v_result jsonb;
  v_eligible_count integer;
  v_hand_number integer;
BEGIN
  SELECT * INTO v_game
    FROM public.games
   WHERE id = _game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'advance_357_round:game_not_found';
  END IF;

  IF v_game.game_type NOT IN ('3-5-7', '3-5-7-game', '357') THEN
    RAISE EXCEPTION 'advance_357_round:not_357:%', v_game.game_type;
  END IF;

  v_rollover_amount := COALESCE(v_game.rollover_amount, 1);
  IF v_rollover_amount < 1 THEN
    RAISE EXCEPTION 'advance_357_round:invalid_rollover_amount';
  END IF;

  SELECT public.advance_357_round_legacy(
    _game_id,
    _dealer_game_id,
    _next_round_number,
    _next_hand_number,
    _decision_deadline,
    CASE WHEN _next_round_number = 1 THEN v_rollover_amount ELSE 0 END,
    _forced_hand_by_player
  ) INTO v_result;

  -- The initial Round 1 has its own startRound path. Every Round 1 admitted
  -- here is the R3 -> next-hand rollover, so its durable audit must not claim
  -- that players anted again.
  IF _next_round_number = 1
     AND COALESCE(v_result->>'status', '') IN (
       'advanced',
       'repaired_and_advanced',
       'advanced_instant_win',
       'repaired_and_advanced_instant_win'
     ) THEN
    v_hand_number := COALESCE((v_result->>'hand_number')::integer, _next_hand_number);

    SELECT count(*) INTO v_eligible_count
      FROM public.players
     WHERE game_id = _game_id
       AND status NOT IN ('left', 'observer')
       AND sitting_out = false;

    UPDATE public.game_results
       SET winner_username = v_eligible_count::text || ' players rolled over $' || v_rollover_amount::text,
           winning_hand_description = 'Rollover'
     WHERE game_id = _game_id
       AND dealer_game_id = _dealer_game_id
       AND hand_number = v_hand_number
       AND winning_hand_description = 'Ante'
       AND game_type = '357';

    v_result := (v_result - 'ante_charged')
      || jsonb_build_object(
        'rollover_charged', v_eligible_count * v_rollover_amount,
        'rollover_amount', v_rollover_amount
      );
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.advance_357_round_legacy(
  uuid, uuid, integer, integer, timestamp with time zone, integer, jsonb
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.advance_357_round(
  uuid, uuid, integer, integer, timestamp with time zone, jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.advance_357_round(
  uuid, uuid, integer, integer, timestamp with time zone, jsonb
) TO authenticated, service_role;

COMMENT ON FUNCTION public.advance_357_round(
  uuid, uuid, integer, integer, timestamp with time zone, jsonb
) IS
  'Atomically advances 3-5-7. R3 to next-hand R1 derives and collects the persisted rollover_amount; the opening ante is outside this RPC.';
