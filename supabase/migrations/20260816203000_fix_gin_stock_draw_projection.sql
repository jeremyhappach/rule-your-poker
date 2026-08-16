-- Keep stock-draw card identity private from Realtime and peer projections.
-- The initiating caller receives the real committed card through the existing
-- caller-specific RPC result; no browser becomes a hidden-state owner.

CREATE OR REPLACE FUNCTION private.gin_public_state(_state jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, private
AS $$
DECLARE
  v_state jsonb := _state;
  v_player_id text;
  v_reveal boolean := coalesce(_state->>'phase', '') IN (
    'knocking', 'laying_off', 'scoring', 'complete'
  );
BEGIN
  IF v_state IS NULL OR jsonb_typeof(v_state) <> 'object' THEN
    RETURN v_state;
  END IF;

  FOR v_player_id IN
    SELECT jsonb_object_keys(coalesce(v_state->'playerStates', '{}'::jsonb))
  LOOP
    IF NOT v_reveal THEN
      v_state := jsonb_set(
        v_state,
        ARRAY['playerStates', v_player_id, 'hand'],
        private.gin_mask_cards(v_state->'playerStates'->v_player_id->'hand'),
        true
      );
    END IF;
  END LOOP;

  v_state := jsonb_set(
    v_state,
    '{stockPile}',
    private.gin_mask_cards(v_state->'stockPile'),
    true
  );

  IF v_state #>> '{lastAction,type}' = 'draw_stock'
     AND jsonb_typeof(v_state #> '{lastAction,card}') = 'object' THEN
    v_state := jsonb_set(
      v_state,
      '{lastAction,card}',
      jsonb_build_object('rank', '?', 'suit', '?', 'value', 0, 'masked', true),
      false
    );
  END IF;
  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION private.gin_project_state(
  _state jsonb,
  _game_id uuid,
  _actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_state jsonb := private.gin_public_state(_state);
  v_player_id uuid;
BEGIN
  IF _actor_id IS NULL OR _state IS NULL THEN
    RETURN v_state;
  END IF;

  SELECT participant.id
    INTO v_player_id
    FROM public.players participant
   WHERE participant.game_id = _game_id
     AND participant.user_id = _actor_id
     AND participant.status <> 'left'
   ORDER BY participant.created_at, participant.id
   LIMIT 1;

  IF v_player_id IS NOT NULL AND _state->'playerStates' ? v_player_id::text THEN
    v_state := jsonb_set(
      v_state,
      ARRAY['playerStates', v_player_id::text, 'hand'],
      coalesce(_state->'playerStates'->v_player_id::text->'hand', '[]'::jsonb),
      true
    );
  END IF;

  IF v_player_id IS NOT NULL
     AND _state #>> '{lastAction,type}' = 'draw_stock'
     AND _state #>> '{lastAction,playerId}' = v_player_id::text
     AND jsonb_typeof(_state #> '{lastAction,card}') = 'object' THEN
    v_state := jsonb_set(
      v_state,
      '{lastAction,card}',
      _state #> '{lastAction,card}',
      false
    );
  END IF;
  RETURN v_state;
END;
$$;

REVOKE ALL ON FUNCTION private.gin_public_state(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.gin_project_state(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
