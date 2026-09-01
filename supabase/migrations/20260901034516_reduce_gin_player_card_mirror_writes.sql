-- Keep Gin's private state and redacted public receipt authoritative on every
-- action, but do not rewrite an unchanged player_cards hand mirror. This
-- avoids unnecessary trigger, index, and WAL work on the action path.

CREATE OR REPLACE FUNCTION private.gin_publish_state(_round_id uuid, _state jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_player_id text;
BEGIN
  INSERT INTO private.gin_rummy_round_states(round_id, state, version, updated_at)
  VALUES (_round_id, _state, 1, clock_timestamp())
  ON CONFLICT (round_id) DO UPDATE
    SET state = EXCLUDED.state,
        version = private.gin_rummy_round_states.version + 1,
        updated_at = clock_timestamp();

  PERFORM set_config('app.gin_rummy_authoritative_write', 'on', true);
  UPDATE public.rounds
     SET gin_rummy_state = private.gin_public_state(_state)
   WHERE id = _round_id;

  FOR v_player_id IN SELECT jsonb_object_keys(coalesce(_state->'playerStates', '{}'::jsonb)) LOOP
    INSERT INTO public.player_cards(player_id, round_id, cards)
    VALUES (v_player_id::uuid, _round_id, coalesce(_state->'playerStates'->v_player_id->'hand', '[]'::jsonb))
    ON CONFLICT (player_id, round_id) DO UPDATE
      SET cards = EXCLUDED.cards,
          source_version = public.player_cards.source_version + 1
      WHERE public.player_cards.cards IS DISTINCT FROM EXCLUDED.cards;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION private.gin_publish_state(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION private.gin_publish_state(uuid, jsonb) IS
  'Publishes authoritative Gin state and updates only player hand mirrors whose cards changed.';
