-- 3-5-7 clients must hydrate the published game pointer, exact round,
-- decision roster, and viewer-visible cards from one PostgreSQL snapshot.
-- Realtime only requests this frame; it never supplies transition authority.

CREATE OR REPLACE FUNCTION public.three_five_seven_current_frame(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_round public.rounds%ROWTYPE;
  v_players jsonb := '[]'::jsonb;
  v_cards jsonb := '[]'::jsonb;
  v_viewer public.players%ROWTYPE;
  v_is_privileged boolean := false;
  v_viewer_cards_required boolean := false;
  v_viewer_cards_present boolean := false;
BEGIN
  IF p_game_id IS NULL THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:missing_game_id';
  END IF;
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:not_in_session';
  END IF;

  SELECT * INTO v_game
    FROM public.games game_row
   WHERE game_row.id = p_game_id;
  IF NOT FOUND OR v_game.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:not_357_game';
  END IF;

  IF v_game.current_game_uuid IS NOT NULL
     AND v_game.total_hands IS NOT NULL
     AND v_game.current_round IS NOT NULL THEN
    SELECT * INTO v_round
      FROM public.rounds round_row
     WHERE round_row.game_id = p_game_id
       AND round_row.dealer_game_id = v_game.current_game_uuid
       AND round_row.hand_number = v_game.total_hands
       AND round_row.round_number = v_game.current_round;
  END IF;

  IF v_game.status IN ('in_progress','game_over')
     AND v_game.current_game_uuid IS NOT NULL
     AND v_game.total_hands IS NOT NULL
     AND v_game.current_round IS NOT NULL
     AND v_round.id IS NULL THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:exact_round_missing';
  END IF;

  SELECT participant.* INTO v_viewer
    FROM public.players participant
   WHERE participant.game_id = p_game_id
     AND participant.user_id = auth.uid()
     AND participant.status <> 'left'
   ORDER BY participant.created_at, participant.id
   LIMIT 1;

  v_is_privileged := coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::public.app_role));

  SELECT coalesce(
    jsonb_agg(
      to_jsonb(participant)
      || jsonb_build_object(
        'profiles', CASE
          WHEN profile.id IS NULL THEN NULL
          ELSE jsonb_build_object('username', profile.username)
        END
      )
      ORDER BY participant.position, participant.id
    ),
    '[]'::jsonb
  ) INTO v_players
    FROM public.players participant
    LEFT JOIN public.profiles profile ON profile.id = participant.user_id
   WHERE participant.game_id = p_game_id
     AND participant.status <> 'left';

  IF v_round.id IS NOT NULL THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object('player_id', cards.player_id, 'cards', cards.cards)
        ORDER BY cards.player_id
      ),
      '[]'::jsonb
    ) INTO v_cards
      FROM public.player_cards cards
      JOIN public.players owner
        ON owner.id = cards.player_id
       AND owner.game_id = p_game_id
     WHERE cards.round_id = v_round.id
       AND (
         coalesce(cards.is_public, false)
         OR owner.user_id = auth.uid()
         OR v_is_privileged
       );

    v_viewer_cards_required := v_viewer.id IS NOT NULL
      AND v_viewer.status NOT IN ('left','observer')
      AND NOT coalesce(v_viewer.sitting_out, false)
      AND NOT coalesce(v_viewer.is_bot, false);
    v_viewer_cards_present := v_viewer.id IS NOT NULL AND EXISTS (
      SELECT 1
        FROM public.player_cards cards
       WHERE cards.round_id = v_round.id
         AND cards.player_id = v_viewer.id
    );

    IF v_viewer_cards_required AND NOT v_viewer_cards_present THEN
      RAISE EXCEPTION 'three_five_seven_current_frame:viewer_cards_missing';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'game', to_jsonb(v_game),
    'round', CASE WHEN v_round.id IS NULL THEN NULL ELSE to_jsonb(v_round) END,
    'players', v_players,
    'player_cards', v_cards,
    'viewer_player_id', v_viewer.id,
    'viewer_cards_required', v_viewer_cards_required,
    'viewer_cards_present', v_viewer_cards_present,
    'identity', jsonb_build_object(
      'dealer_game_id', v_game.current_game_uuid,
      'hand_number', v_game.total_hands,
      'round_number', v_game.current_round,
      'round_id', v_round.id,
      'chip_transfer_cursor', coalesce(v_game.chip_transfer_cursor, 0)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.three_five_seven_current_frame(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.three_five_seven_current_frame(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.three_five_seven_current_frame(uuid) IS
  'Returns one exact MVCC snapshot of the 3-5-7 game pointer, current round, decision roster, and caller-visible cards. Realtime is only a refetch signal.';
