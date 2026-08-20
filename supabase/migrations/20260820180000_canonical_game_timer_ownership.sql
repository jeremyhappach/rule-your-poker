-- Canonical database ownership for lifecycle and gameplay timers.
--
-- Existing per-game functions remain the rule/settlement owners.  This
-- migration adds one exact-identity registry and routes every due action
-- through the already-serialized one-second recovery dispatcher.  The
-- cutover deliberately admits only future, currently-active legacy deadlines;
-- expired historical rows are not swept or rewritten.

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS timer_generation bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timer_paused_at timestamptz;

CREATE TABLE IF NOT EXISTS private.game_timer_cutover (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  cutover_at timestamptz NOT NULL,
  owner_version integer NOT NULL CHECK (owner_version > 0)
);

INSERT INTO private.game_timer_cutover(singleton, cutover_at, owner_version)
VALUES (true, clock_timestamp(), 2)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS private.game_timer_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  timer_kind text NOT NULL,
  identity_key text NOT NULL,
  owner_task text NOT NULL,
  dealer_game_id uuid,
  round_id uuid REFERENCES public.rounds(id) ON DELETE CASCADE,
  hand_number integer,
  actor_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  phase text,
  due_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'scheduled'
    CHECK (state IN ('scheduled','processing','completed','cancelled','failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (game_id, timer_kind, identity_key)
);

CREATE INDEX IF NOT EXISTS idx_game_timer_registry_due
  ON private.game_timer_registry(owner_task, due_at, id)
  WHERE state = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_game_timer_registry_game_active
  ON private.game_timer_registry(game_id, timer_kind, due_at)
  WHERE state IN ('scheduled','processing');

ALTER TABLE private.game_timer_cutover ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.game_timer_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.game_timer_cutover
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.game_timer_registry
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.register_game_timer(
  p_game_id uuid,
  p_timer_kind text,
  p_identity_key text,
  p_owner_task text,
  p_due_at timestamptz,
  p_dealer_game_id uuid DEFAULT NULL,
  p_round_id uuid DEFAULT NULL,
  p_hand_number integer DEFAULT NULL,
  p_actor_player_id uuid DEFAULT NULL,
  p_phase text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_game_id IS NULL OR p_timer_kind IS NULL OR p_identity_key IS NULL
     OR p_owner_task IS NULL OR p_due_at IS NULL THEN
    RAISE EXCEPTION 'register_game_timer:missing_identity';
  END IF;

  UPDATE private.game_timer_registry timer
     SET state = 'cancelled',
         completed_at = clock_timestamp(),
         updated_at = clock_timestamp()
   WHERE timer.game_id = p_game_id
     AND timer.timer_kind = p_timer_kind
     AND timer.identity_key <> p_identity_key
     AND timer.state IN ('scheduled','processing');

  INSERT INTO private.game_timer_registry(
    game_id, timer_kind, identity_key, owner_task, dealer_game_id,
    round_id, hand_number, actor_player_id, phase, due_at, state,
    metadata, completed_at, last_error, updated_at
  ) VALUES (
    p_game_id, p_timer_kind, p_identity_key, p_owner_task,
    p_dealer_game_id, p_round_id, p_hand_number, p_actor_player_id,
    p_phase, p_due_at, 'scheduled', coalesce(p_metadata, '{}'::jsonb),
    NULL, NULL, clock_timestamp()
  )
  ON CONFLICT (game_id, timer_kind, identity_key) DO UPDATE
    SET owner_task = EXCLUDED.owner_task,
        dealer_game_id = EXCLUDED.dealer_game_id,
        round_id = EXCLUDED.round_id,
        hand_number = EXCLUDED.hand_number,
        actor_player_id = EXCLUDED.actor_player_id,
        phase = EXCLUDED.phase,
        due_at = EXCLUDED.due_at,
        state = 'scheduled',
        metadata = EXCLUDED.metadata,
        completed_at = NULL,
        last_error = NULL,
        updated_at = clock_timestamp()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION private.cancel_game_timers(
  p_game_id uuid,
  p_timer_kind text,
  p_round_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE private.game_timer_registry timer
     SET state = 'cancelled',
         completed_at = clock_timestamp(),
         updated_at = clock_timestamp()
   WHERE timer.game_id = p_game_id
     AND timer.timer_kind = p_timer_kind
     AND (p_round_id IS NULL OR timer.round_id = p_round_id)
     AND timer.state IN ('scheduled','processing');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION private.before_game_timer_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.timer_generation := coalesce(OLD.timer_generation, 0) + 1;
    IF NEW.status = 'game_over'
       AND NEW.game_type IN ('holm','holm-game','horses','ship-captain-crew') THEN
      NEW.game_over_at := coalesce(NEW.game_over_at, clock_timestamp());
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.sync_game_timer_registry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_identity text;
BEGIN
  IF NEW.status = 'dealer_selection' AND (
       TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status
     ) THEN
    v_identity := NEW.timer_generation::text;
    PERFORM private.register_game_timer(
      NEW.id, 'dealer_selection_prepare', v_identity, 'canonical_timers',
      clock_timestamp(), NULL, NULL, NULL, NULL, NEW.status,
      jsonb_build_object('timer_generation', NEW.timer_generation)
    );
  ELSIF NEW.status <> 'dealer_selection' THEN
    PERFORM private.cancel_game_timers(NEW.id, 'dealer_selection_prepare');
    PERFORM private.cancel_game_timers(NEW.id, 'dealer_selection_complete');
  END IF;

  IF NEW.status IN ('dealer_selection','game_selection','configuring')
     AND NOT coalesce(NEW.config_complete, false)
     AND NEW.config_deadline IS NOT NULL THEN
    v_identity := NEW.timer_generation::text || ':' ||
      coalesce(NEW.dealer_position, 0)::text;
    PERFORM private.register_game_timer(
      NEW.id, 'config_timeout', v_identity, 'canonical_timers',
      NEW.config_deadline, NEW.current_game_uuid, NULL, NEW.total_hands,
      NULL, NEW.status,
      jsonb_build_object(
        'expected_deadline', NEW.config_deadline,
        'expected_dealer_position', NEW.dealer_position
      )
    );
  ELSE
    PERFORM private.cancel_game_timers(NEW.id, 'config_timeout');
  END IF;

  IF NEW.status = 'ante_decision'
     AND NEW.current_game_uuid IS NOT NULL
     AND NEW.ante_decision_deadline IS NOT NULL THEN
    v_identity := NEW.timer_generation::text || ':' || NEW.current_game_uuid::text;
    PERFORM private.register_game_timer(
      NEW.id, 'ante_phase', v_identity, 'canonical_timers',
      NEW.ante_decision_deadline, NEW.current_game_uuid, NULL,
      NEW.total_hands, NULL, NEW.status,
      jsonb_build_object('expected_deadline', NEW.ante_decision_deadline)
    );
  ELSE
    PERFORM private.cancel_game_timers(NEW.id, 'ante_phase');
  END IF;

  IF NEW.status = 'game_over'
     AND NEW.game_type IN ('holm','holm-game','horses','ship-captain-crew')
     AND NEW.current_game_uuid IS NOT NULL
     AND NEW.game_over_at IS NOT NULL THEN
    v_identity := NEW.current_game_uuid::text || ':' ||
      coalesce(NEW.total_hands, 0)::text;
    PERFORM private.register_game_timer(
      NEW.id, 'standard_postgame', v_identity, 'canonical_timers',
      NEW.game_over_at + interval '15 seconds', NEW.current_game_uuid,
      NULL, NEW.total_hands, NULL, NEW.status,
      jsonb_build_object('game_over_at', NEW.game_over_at)
    );
  ELSE
    PERFORM private.cancel_game_timers(NEW.id, 'standard_postgame');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS before_game_timer_boundary ON public.games;
CREATE TRIGGER before_game_timer_boundary
BEFORE UPDATE OF status ON public.games
FOR EACH ROW EXECUTE FUNCTION private.before_game_timer_boundary();

DROP TRIGGER IF EXISTS sync_game_timer_registry ON public.games;
CREATE TRIGGER sync_game_timer_registry
AFTER INSERT OR UPDATE OF status, config_deadline, config_complete,
  ante_decision_deadline, current_game_uuid, dealer_position, game_over_at,
  total_hands, is_paused
ON public.games
FOR EACH ROW EXECUTE FUNCTION private.sync_game_timer_registry();

CREATE OR REPLACE FUNCTION private.sync_round_timer_registry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_actor_id uuid;
  v_turn_deadline timestamptz;
  v_identity text;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = NEW.game_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT player.id INTO v_actor_id
    FROM public.players player
   WHERE player.game_id = NEW.game_id
     AND player.position = NEW.current_turn_position
   LIMIT 1;

  IF NEW.decision_deadline IS NOT NULL
     AND NEW.status = 'betting'
     AND v_game.status = 'in_progress'
     AND v_game.current_game_uuid IS NOT DISTINCT FROM NEW.dealer_game_id THEN
    IF v_game.game_type IN ('holm','holm-game') THEN
      PERFORM private.register_game_timer(
        NEW.game_id, 'holm_decision', NEW.id::text || ':' ||
          coalesce(v_actor_id::text,'none'), 'canonical_timers',
        NEW.decision_deadline, NEW.dealer_game_id, NEW.id, NEW.hand_number,
        v_actor_id, NEW.status,
        jsonb_build_object(
          'current_turn_position', NEW.current_turn_position,
          'expected_deadline', NEW.decision_deadline
        )
      );
    ELSIF v_game.game_type IN ('3-5-7','3-5-7-game','357') THEN
      PERFORM private.register_game_timer(
        NEW.game_id, 'three_five_seven_decision', NEW.id::text || ':' ||
          NEW.decision_deadline::text,
        'three_five_seven', NEW.decision_deadline, NEW.dealer_game_id,
        NEW.id, NEW.hand_number, NULL, NEW.status, '{}'::jsonb
      );
    ELSIF v_game.game_type = 'yahtzee' THEN
      PERFORM private.register_game_timer(
        NEW.game_id, 'yahtzee_turn', NEW.id::text || ':' ||
          coalesce(NEW.yahtzee_state->>'actionSequence',NEW.decision_deadline::text), 'yahtzee',
        NEW.decision_deadline, NEW.dealer_game_id, NEW.id, NEW.hand_number,
        v_actor_id, NEW.status, '{}'::jsonb
      );
    END IF;
  ELSE
    IF v_game.game_type IN ('holm','holm-game') THEN
      PERFORM private.cancel_game_timers(NEW.game_id, 'holm_decision', NEW.id);
    ELSIF v_game.game_type IN ('3-5-7','3-5-7-game','357') THEN
      PERFORM private.cancel_game_timers(NEW.game_id, 'three_five_seven_decision', NEW.id);
    ELSIF v_game.game_type = 'yahtzee' THEN
      PERFORM private.cancel_game_timers(NEW.game_id, 'yahtzee_turn', NEW.id);
    END IF;
  END IF;

  IF NEW.presentation_fallback_at IS NOT NULL THEN
    v_identity := NEW.id::text;
    PERFORM private.register_game_timer(
      NEW.game_id, 'presentation_fallback', v_identity,
      CASE
        WHEN v_game.game_type IN ('holm','holm-game') THEN 'holm'
        WHEN v_game.game_type = 'cribbage' THEN 'cribbage'
        WHEN v_game.game_type IN ('3-5-7','3-5-7-game','357') THEN 'three_five_seven'
        ELSE 'canonical_timers'
      END,
      NEW.presentation_fallback_at, NEW.dealer_game_id, NEW.id,
      NEW.hand_number, NULL, NEW.status, '{}'::jsonb
    );
  ELSE
    PERFORM private.cancel_game_timers(NEW.game_id, 'presentation_fallback', NEW.id);
  END IF;

  IF v_game.game_type IN ('horses','ship-captain-crew')
     AND NEW.horses_state IS NOT NULL THEN
    BEGIN
      v_turn_deadline := nullif(NEW.horses_state->>'turnDeadline','')::timestamptz;
    EXCEPTION WHEN invalid_text_representation THEN
      v_turn_deadline := NULL;
    END;
    BEGIN
      v_actor_id := nullif(NEW.horses_state->>'currentTurnPlayerId','')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_actor_id := NULL;
    END;

    IF NEW.horses_state->>'gamePhase' = 'playing'
       AND v_turn_deadline IS NOT NULL THEN
      PERFORM private.register_game_timer(
        NEW.game_id, 'horses_scc_turn', NEW.id::text || ':' ||
          coalesce(v_actor_id::text,'none'), 'canonical_timers',
        v_turn_deadline, NEW.dealer_game_id, NEW.id, NEW.hand_number,
        v_actor_id, NEW.status, '{}'::jsonb
      );
      PERFORM private.cancel_game_timers(NEW.game_id, 'horses_scc_terminal', NEW.id);
    ELSIF NEW.horses_state->>'gamePhase' = 'complete'
          AND v_game.status = 'in_progress' THEN
      PERFORM private.cancel_game_timers(NEW.game_id, 'horses_scc_turn', NEW.id);
      PERFORM private.register_game_timer(
        NEW.game_id, 'horses_scc_terminal', NEW.id::text,
        'canonical_timers', clock_timestamp() + interval '5 seconds',
        NEW.dealer_game_id, NEW.id, NEW.hand_number, NULL, NEW.status,
        '{}'::jsonb
      );
    ELSE
      PERFORM private.cancel_game_timers(NEW.game_id, 'horses_scc_turn', NEW.id);
      PERFORM private.cancel_game_timers(NEW.game_id, 'horses_scc_terminal', NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_round_timer_registry ON public.rounds;
CREATE TRIGGER sync_round_timer_registry
AFTER INSERT OR UPDATE OF status, decision_deadline, presentation_fallback_at,
  current_turn_position, horses_state, yahtzee_state
ON public.rounds
FOR EACH ROW EXECUTE FUNCTION private.sync_round_timer_registry();

CREATE OR REPLACE FUNCTION private.on_ante_decision_timer_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = NEW.game_id;
  IF FOUND AND v_game.status = 'ante_decision'
     AND v_game.current_game_uuid IS NOT NULL
     AND v_game.ante_decision_deadline IS NOT NULL THEN
    PERFORM private.register_game_timer(
      v_game.id, 'ante_phase',
      v_game.timer_generation::text || ':' || v_game.current_game_uuid::text,
      'canonical_timers', clock_timestamp(), v_game.current_game_uuid,
      NULL, v_game.total_hands, NEW.id, v_game.status,
      jsonb_build_object('expected_deadline', v_game.ante_decision_deadline)
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_ante_decision_timer_signal ON public.players;
CREATE TRIGGER on_ante_decision_timer_signal
AFTER UPDATE OF ante_decision ON public.players
FOR EACH ROW
WHEN (OLD.ante_decision IS DISTINCT FROM NEW.ante_decision)
EXECUTE FUNCTION private.on_ante_decision_timer_signal();

REVOKE ALL ON FUNCTION private.register_game_timer(
  uuid,text,text,text,timestamptz,uuid,uuid,integer,uuid,text,jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cancel_game_timers(uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.before_game_timer_boundary()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sync_game_timer_registry()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sync_round_timer_registry()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.on_ante_decision_timer_signal()
  FROM PUBLIC, anon, authenticated;

-- Session-level high-card selection is prepared by PostgreSQL.  Presentation
-- clients consume the stored cards but no host is required to shuffle, choose,
-- or advance the phase.
CREATE OR REPLACE FUNCTION private.prepare_session_dealer_selection(
  p_game_id uuid,
  p_timer_generation bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_allow_bot boolean := false;
  v_remaining uuid[];
  v_winners uuid[];
  v_player_id uuid;
  v_position integer;
  v_deck jsonb;
  v_card jsonb;
  v_cards jsonb := '[]'::jsonb;
  v_round integer := 0;
  v_deck_index integer := 0;
  v_rank_value integer;
  v_highest integer;
  v_prepared_at timestamptz := clock_timestamp();
  v_winner_position integer;
  v_state jsonb;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing_game'); END IF;
  IF v_game.status <> 'dealer_selection'
     OR v_game.timer_generation IS DISTINCT FROM p_timer_generation THEN
    RETURN jsonb_build_object('outcome','stale_identity','status',v_game.status);
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    RETURN jsonb_build_object('outcome','paused');
  END IF;

  IF coalesce((v_game.dealer_selection_state->>'isComplete')::boolean,false)
     AND (v_game.dealer_selection_state->>'winnerPosition') IS NOT NULL THEN
    RETURN jsonb_build_object(
      'outcome','already_prepared','state',v_game.dealer_selection_state
    );
  END IF;

  SELECT coalesce(defaults.allow_bot_dealers,false) INTO v_allow_bot
    FROM public.game_defaults defaults
   WHERE defaults.game_type = coalesce(v_game.game_type,'holm')
   LIMIT 1;
  v_allow_bot := coalesce(v_allow_bot,false);

  SELECT array_agg(player.id ORDER BY player.position)
    INTO v_remaining
    FROM public.players player
   WHERE player.game_id = p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (v_allow_bot OR NOT coalesce(player.is_bot,false));

  IF coalesce(cardinality(v_remaining),0) = 0 THEN
    SELECT array_agg(player.id ORDER BY player.position)
      INTO v_remaining
      FROM public.players player
     WHERE player.game_id = p_game_id
       AND NOT coalesce(player.sitting_out,false)
       AND player.position IS NOT NULL
       AND player.status NOT IN ('observer','left');
  END IF;

  IF coalesce(cardinality(v_remaining),0) = 0 THEN
    RETURN jsonb_build_object('outcome','no_eligible_players');
  END IF;

  SELECT jsonb_agg(
           jsonb_build_object('rank',rank,'suit',suit)
           ORDER BY random()
         )
    INTO v_deck
    FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) rank
    CROSS JOIN unnest(ARRAY['♠','♥','♦','♣']) suit;

  WHILE cardinality(v_remaining) > 1 LOOP
    v_round := v_round + 1;
    v_highest := 0;
    v_winners := ARRAY[]::uuid[];
    FOREACH v_player_id IN ARRAY v_remaining LOOP
      v_card := v_deck -> v_deck_index;
      v_deck_index := v_deck_index + 1;
      SELECT player.position INTO v_position
        FROM public.players player WHERE player.id = v_player_id;
      v_rank_value := CASE v_card->>'rank'
        WHEN 'A' THEN 14 WHEN 'K' THEN 13 WHEN 'Q' THEN 12 WHEN 'J' THEN 11
        ELSE (v_card->>'rank')::integer END;
      IF v_rank_value > v_highest THEN
        v_highest := v_rank_value;
        v_winners := ARRAY[v_player_id];
      ELSIF v_rank_value = v_highest THEN
        v_winners := array_append(v_winners,v_player_id);
      END IF;
      v_cards := v_cards || jsonb_build_array(jsonb_build_object(
        'playerId',v_player_id,'position',v_position,'card',v_card,
        'isRevealed',true,'isWinner',false,'isDimmed',false,
        'roundNumber',v_round
      ));
    END LOOP;

    SELECT coalesce(jsonb_agg(
      CASE WHEN (entry.value->>'roundNumber')::integer = v_round THEN
        entry.value || jsonb_build_object(
          'isWinner',(entry.value->>'playerId')::uuid = ANY(v_winners),
          'isDimmed',NOT ((entry.value->>'playerId')::uuid = ANY(v_winners))
        ) ELSE entry.value END
      ORDER BY entry.ordinality
    ),'[]'::jsonb) INTO v_cards
    FROM jsonb_array_elements(v_cards) WITH ORDINALITY AS entry(value,ordinality);

    v_remaining := v_winners;
  END LOOP;

  v_player_id := v_remaining[1];
  SELECT player.position INTO v_winner_position
    FROM public.players player WHERE player.id = v_player_id;

  IF jsonb_array_length(v_cards) = 0 THEN
    v_state := jsonb_build_object(
      'cards','[]'::jsonb,
      'announcement','Only eligible player wins the deal',
      'isComplete',true,
      'winnerPosition',v_winner_position,
      'preparedAt',v_prepared_at
    );
  ELSE
    v_state := jsonb_build_object(
      'cards',v_cards,
      'announcement','Seat ' || v_winner_position::text || ' wins the deal!',
      'isComplete',true,
      'winnerPosition',v_winner_position,
      'preparedAt',v_prepared_at
    );
  END IF;

  UPDATE public.games
     SET dealer_selection_state = v_state
   WHERE id = p_game_id;

  PERFORM private.register_game_timer(
    p_game_id, 'dealer_selection_complete', p_timer_generation::text,
    'canonical_timers', v_prepared_at + interval '3 seconds',
    NULL, NULL, NULL, v_player_id, 'dealer_selection',
    jsonb_build_object(
      'timer_generation',p_timer_generation,
      'winner_position',v_winner_position,
      'prepared_at',v_prepared_at
    )
  );

  RETURN jsonb_build_object('outcome','prepared','state',v_state);
END;
$function$;

CREATE OR REPLACE FUNCTION private.complete_session_dealer_selection(
  p_game_id uuid,
  p_timer_generation bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_winner_position integer;
  v_prepared_at timestamptz;
  v_deadline timestamptz;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing_game'); END IF;
  IF v_game.status <> 'dealer_selection'
     OR v_game.timer_generation IS DISTINCT FROM p_timer_generation THEN
    RETURN jsonb_build_object('outcome','stale_identity','status',v_game.status);
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    RETURN jsonb_build_object('outcome','paused');
  END IF;
  BEGIN
    v_winner_position := nullif(v_game.dealer_selection_state->>'winnerPosition','')::integer;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'complete_session_dealer_selection:malformed_winner';
  END;
  IF v_winner_position IS NULL THEN
    RETURN jsonb_build_object('outcome','not_prepared');
  END IF;
  BEGIN
    v_prepared_at:=nullif(v_game.dealer_selection_state->>'preparedAt','')::timestamptz;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'complete_session_dealer_selection:malformed_prepared_at';
  END;
  IF v_prepared_at IS NULL OR v_prepared_at+interval '3 seconds'>clock_timestamp() THEN
    RETURN jsonb_build_object(
      'outcome','presentation_pending','prepared_at',v_prepared_at
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.players player
     WHERE player.game_id = p_game_id
       AND player.position = v_winner_position
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN ('observer','left')
  ) THEN
    RETURN jsonb_build_object('outcome','winner_ineligible');
  END IF;

  v_deadline := clock_timestamp() + make_interval(
    secs => greatest(1,coalesce(v_game.game_setup_timer_seconds,30))
  );
  UPDATE public.games
     SET status = 'game_selection',
         dealer_position = v_winner_position,
         config_complete = false,
         config_deadline = v_deadline,
         current_game_uuid = NULL
   WHERE id = p_game_id;
  RETURN jsonb_build_object(
    'outcome','advanced','status','game_selection',
    'dealer_position',v_winner_position,'config_deadline',v_deadline
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.advance_session_dealer_selection(
  p_game_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
  IF NOT v_service AND (
    auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.players player
       WHERE player.game_id=p_game_id AND player.user_id=auth.uid()
    )
  ) THEN
    RETURN jsonb_build_object('outcome','not_authorized');
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing_game'); END IF;
  RETURN private.complete_session_dealer_selection(
    p_game_id,v_game.timer_generation
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.prepare_session_dealer_selection(uuid,bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.complete_session_dealer_selection(uuid,bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_session_dealer_selection(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.advance_session_dealer_selection(uuid)
  TO authenticated,service_role;

-- Exact setup timeout owner.  Authenticated callers may request an immediate
-- check, but only the database clock and locked row decide whether it fires.
CREATE OR REPLACE FUNCTION private.handle_config_deadline_timeout_exact(
  p_game_id uuid,
  p_expected_deadline timestamptz DEFAULT NULL,
  p_expected_dealer_position integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_dealer_id uuid;
  v_next_dealer_pos integer;
  v_allow_bot boolean := false;
  v_setup_seconds integer;
  v_new_deadline timestamptz;
  v_active_total integer;
  v_active_humans integer;
  v_outcome text;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','suppressed','reason','game-not-found');
  END IF;
  IF p_expected_deadline IS NOT NULL
     AND v_game.config_deadline IS DISTINCT FROM p_expected_deadline THEN
    RETURN jsonb_build_object('outcome','suppressed','reason','stale-deadline');
  END IF;
  IF p_expected_dealer_position IS NOT NULL
     AND v_game.dealer_position IS DISTINCT FROM p_expected_dealer_position THEN
    RETURN jsonb_build_object('outcome','suppressed','reason','stale-dealer');
  END IF;
  IF v_game.status NOT IN ('dealer_selection','configuring','game_selection')
     OR coalesce(v_game.config_complete,false)
     OR coalesce(v_game.is_paused,false)
     OR v_game.config_deadline IS NULL
     OR v_game.config_deadline > clock_timestamp() THEN
    RETURN jsonb_build_object(
      'outcome','suppressed','reason','game-advanced-or-not-expired',
      'status',v_game.status,'config_deadline',v_game.config_deadline
    );
  END IF;

  SELECT player.id INTO v_dealer_id FROM public.players player
   WHERE player.game_id = p_game_id
     AND player.position = v_game.dealer_position LIMIT 1;
  IF v_dealer_id IS NOT NULL THEN
    UPDATE public.players SET sitting_out=true,waiting=false
     WHERE id=v_dealer_id;
  END IF;

  SELECT coalesce(defaults.allow_bot_dealers,false) INTO v_allow_bot
    FROM public.game_defaults defaults
   WHERE defaults.game_type = coalesce(v_game.game_type,'holm') LIMIT 1;
  v_allow_bot := coalesce(v_allow_bot,false);
  v_setup_seconds := greatest(1,coalesce(nullif(v_game.game_setup_timer_seconds,0),30));

  SELECT count(*),
         count(*) FILTER (WHERE NOT coalesce(player.is_bot,false))
    INTO v_active_total,v_active_humans
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left');

  IF v_active_humans = 0 THEN
    v_outcome := private.resolve_postgame_participation(p_game_id,clock_timestamp());
    RETURN jsonb_build_object('outcome',CASE
      WHEN v_outcome='session-ended-with-results' THEN 'session_ended'
      ELSE 'waiting' END,'reason',v_outcome);
  END IF;

  SELECT player.position INTO v_next_dealer_pos
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (v_allow_bot OR NOT coalesce(player.is_bot,false))
     AND (v_dealer_id IS NULL OR player.id<>v_dealer_id)
   ORDER BY CASE WHEN player.position>coalesce(v_game.dealer_position,0) THEN 0 ELSE 1 END,
            player.position
   LIMIT 1;

  IF v_next_dealer_pos IS NOT NULL AND v_active_total>=2 THEN
    v_new_deadline:=clock_timestamp()+make_interval(secs=>v_setup_seconds);
    UPDATE public.games
       SET dealer_position=v_next_dealer_pos,
           config_deadline=v_new_deadline,
           config_complete=false,
           current_game_uuid=NULL
     WHERE id=p_game_id;
    RETURN jsonb_build_object(
      'outcome','rotated','new_dealer_position',v_next_dealer_pos,
      'new_config_deadline',v_new_deadline,'active_total',v_active_total
    );
  END IF;

  UPDATE public.games
     SET status='waiting',config_deadline=NULL,ante_decision_deadline=NULL,
         config_complete=false,awaiting_next_round=false,
         last_round_result=NULL,current_game_uuid=NULL
   WHERE id=p_game_id;
  RETURN jsonb_build_object('outcome','waiting','active_humans',v_active_humans);
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_config_deadline_timeout(_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
  IF NOT v_service AND (
    auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.players player
       WHERE player.game_id=_game_id AND player.user_id=auth.uid()
    )
  ) THEN
    RETURN jsonb_build_object('outcome','suppressed','reason','not-authorized');
  END IF;
  RETURN private.handle_config_deadline_timeout_exact(_game_id,NULL,NULL);
END;
$function$;

REVOKE ALL ON FUNCTION private.handle_config_deadline_timeout_exact(uuid,timestamptz,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_config_deadline_timeout(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_config_deadline_timeout(uuid)
  TO authenticated, service_role;

-- Dice first-hand bootstrap was the last ante continuation without a database
-- owner.  It uses the same clockwise seat order and canonical transfer RPC as
-- the browser implementation, but the game/round/ante commit is one
-- transaction and replay returns the existing round.
CREATE OR REPLACE FUNCTION private.start_horses_scc_initial_round(
  p_game_id uuid,
  p_expected_dealer_game_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_existing public.rounds%ROWTYPE;
  v_player_ids uuid[];
  v_first_position integer;
  v_first_player_id uuid;
  v_first_is_bot boolean;
  v_controller_user_id uuid;
  v_make_take boolean := false;
  v_turn_seconds integer := 60;
  v_bot_delay numeric := 2;
  v_due_at timestamptz;
  v_dice jsonb;
  v_player_states jsonb;
  v_state jsonb;
  v_transfers jsonb;
  v_round_id uuid;
  v_pot integer;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('horses','ship-captain-crew') THEN
    RAISE EXCEPTION 'start_horses_scc_initial_round:not_dice_game';
  END IF;
  IF v_game.status IS DISTINCT FROM 'ante_decision'
     OR v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
     OR coalesce(v_game.is_paused,false) THEN
    RETURN jsonb_build_object('outcome','stale_identity','status',v_game.status);
  END IF;

  SELECT * INTO v_existing FROM public.rounds round_row
   WHERE round_row.game_id=p_game_id
     AND round_row.dealer_game_id=p_expected_dealer_game_id
     AND round_row.hand_number=1
     AND round_row.round_number=1
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome','already_started','deduped',true,'round_id',v_existing.id
    );
  END IF;

  IF (SELECT count(*) FROM public.players player
       WHERE player.game_id=p_game_id
         AND NOT coalesce(player.sitting_out,false)
         AND player.status NOT IN ('observer','left')
         AND player.position IS NOT NULL
         AND player.ante_decision='ante_up') < 2 THEN
    RETURN jsonb_build_object('outcome','admission_incomplete');
  END IF;

  SELECT coalesce((setting.value->>'enabled')::boolean,false)
    INTO v_make_take
    FROM public.system_settings setting
   WHERE setting.key='make_it_take_it' LIMIT 1;
  v_make_take:=coalesce(v_make_take,false);

  IF v_make_take AND EXISTS (
    SELECT 1 FROM public.players player
     WHERE player.game_id=p_game_id AND player.position=v_game.dealer_position
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN ('observer','left')
       AND player.ante_decision='ante_up'
  ) THEN
    v_first_position:=v_game.dealer_position;
  ELSE
    SELECT coalesce(
      max(player.position) FILTER (WHERE player.position<v_game.dealer_position),
      max(player.position)
    ) INTO v_first_position
    FROM public.players player
    WHERE player.game_id=p_game_id
      AND NOT coalesce(player.sitting_out,false)
      AND player.status NOT IN ('observer','left')
      AND player.position IS NOT NULL
      AND player.ante_decision='ante_up';
  END IF;

  SELECT array_agg(player.id ORDER BY
           CASE WHEN player.position<=v_first_position THEN 0 ELSE 1 END,
           player.position DESC)
    INTO v_player_ids
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision='ante_up';

  v_first_player_id:=v_player_ids[1];
  SELECT player.is_bot INTO v_first_is_bot
    FROM public.players player WHERE player.id=v_first_player_id;
  SELECT player.user_id INTO v_controller_user_id
    FROM unnest(v_player_ids) WITH ORDINALITY ordered(player_id,ordinality)
    JOIN public.players player ON player.id=ordered.player_id
   WHERE NOT coalesce(player.is_bot,false)
   ORDER BY ordered.ordinality LIMIT 1;

  SELECT coalesce(defaults.decision_timer_seconds,60),
         coalesce(defaults.bot_decision_delay_seconds,2)
    INTO v_turn_seconds,v_bot_delay
    FROM public.game_defaults defaults
   WHERE defaults.game_type=v_game.game_type LIMIT 1;
  v_turn_seconds:=greatest(1,coalesce(v_turn_seconds,60));
  v_bot_delay:=greatest(0.1,coalesce(v_bot_delay,2));
  v_due_at:=clock_timestamp()+CASE WHEN coalesce(v_first_is_bot,false)
    THEN make_interval(secs=>v_bot_delay)
    ELSE make_interval(secs=>v_turn_seconds) END;

  v_dice:=CASE WHEN v_game.game_type='ship-captain-crew' THEN
    jsonb_build_array(
      jsonb_build_object('value',0,'isHeld',false,'isSCC',false),
      jsonb_build_object('value',0,'isHeld',false,'isSCC',false),
      jsonb_build_object('value',0,'isHeld',false,'isSCC',false),
      jsonb_build_object('value',0,'isHeld',false,'isSCC',false),
      jsonb_build_object('value',0,'isHeld',false,'isSCC',false)
    ) ELSE jsonb_build_array(
      jsonb_build_object('value',0,'isHeld',false),
      jsonb_build_object('value',0,'isHeld',false),
      jsonb_build_object('value',0,'isHeld',false),
      jsonb_build_object('value',0,'isHeld',false),
      jsonb_build_object('value',0,'isHeld',false)
    ) END;

  SELECT jsonb_object_agg(player_id::text,jsonb_build_object(
           'dice',v_dice,'rollsRemaining',3,'isComplete',false
         )) INTO v_player_states
    FROM unnest(v_player_ids) player_id;
  v_state:=jsonb_build_object(
    'currentTurnPlayerId',v_first_player_id,
    'playerStates',v_player_states,
    'gamePhase','playing',
    'turnOrder',to_jsonb(v_player_ids),
    'botControllerUserId',v_controller_user_id,
    'turnDeadline',v_due_at
  );

  IF coalesce(v_game.ante_amount,0)>0 THEN
    SELECT jsonb_agg(jsonb_build_object(
      'from',jsonb_build_object('kind','player','playerId',player_id),
      'to',jsonb_build_object('kind','pot'),
      'amount',v_game.ante_amount
    )) INTO v_transfers FROM unnest(v_player_ids) player_id;
    PERFORM public.settle_gameplay_chip_transfers(p_game_id,v_transfers,'ante');
  END IF;
  SELECT game_row.pot INTO v_pot FROM public.games game_row WHERE id=p_game_id;

  INSERT INTO public.rounds(
    game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot,
    horses_state,current_turn_position
  ) VALUES (
    p_game_id,p_expected_dealer_game_id,1,1,2,'betting',coalesce(v_pot,0),
    v_state,v_first_position
  ) RETURNING id INTO v_round_id;

  UPDATE public.games
     SET status='in_progress',current_round=1,total_hands=1,
         all_decisions_in=false,awaiting_next_round=false,
         last_round_result=NULL,game_over_at=NULL,is_first_hand=true,
         config_deadline=NULL,ante_decision_deadline=NULL
   WHERE id=p_game_id;

  RETURN jsonb_build_object(
    'outcome','started','deduped',false,'round_id',v_round_id,
    'dealer_game_id',p_expected_dealer_game_id,'hand_number',1
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.start_horses_scc_initial_round(uuid,uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.advance_ante_phase_exact(
  p_game_id uuid,
  p_expected_dealer_game_id uuid,
  p_expected_deadline timestamptz,
  p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_unresolved integer;
  v_anted integer;
  v_outcome text;
  v_start jsonb;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing_game'); END IF;
  IF v_game.status IS DISTINCT FROM 'ante_decision'
     OR v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
     OR v_game.ante_decision_deadline IS DISTINCT FROM p_expected_deadline THEN
    RETURN jsonb_build_object('outcome','stale_identity','status',v_game.status);
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    RETURN jsonb_build_object('outcome','paused');
  END IF;

  UPDATE public.players player
     SET ante_decision='ante_up',sitting_out=false
   WHERE player.game_id=p_game_id
     AND coalesce(player.is_bot,false)
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.ante_decision IS NULL;

  UPDATE public.players player
     SET sitting_out=true,waiting=false
   WHERE player.game_id=p_game_id
     AND player.ante_decision='sit_out'
     AND NOT coalesce(player.sitting_out,false);

  IF p_expected_deadline<=p_now THEN
    UPDATE public.players player
       SET ante_decision='sit_out',sitting_out=true,waiting=false
     WHERE player.game_id=p_game_id
       AND NOT coalesce(player.is_bot,false)
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN ('observer','left')
       AND player.ante_decision IS NULL;
  END IF;

  SELECT count(*) INTO v_unresolved
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision IS NULL;
  IF v_unresolved>0 THEN
    RETURN jsonb_build_object(
      'outcome','pending','unresolved',v_unresolved,
      'deadline',p_expected_deadline
    );
  END IF;

  UPDATE public.players player
     SET sitting_out_hands=CASE
           WHEN coalesce(player.sitting_out,false)
             THEN coalesce(player.sitting_out_hands,0)+1
           ELSE 0 END
   WHERE player.game_id=p_game_id
     AND player.status NOT IN ('observer','left');

  SELECT count(*) INTO v_anted
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision='ante_up';

  IF v_anted<2 THEN
    IF coalesce(v_game.real_money,false) THEN
      v_outcome:=private.resolve_postgame_participation(p_game_id,p_now);
    ELSE
      UPDATE public.games
         SET status='waiting',current_game_uuid=NULL,config_complete=false,
             config_deadline=NULL,ante_decision_deadline=NULL,
             awaiting_next_round=false,last_round_result=NULL
       WHERE id=p_game_id;
      v_outcome:='waiting-not-enough-players';
    END IF;
    RETURN jsonb_build_object('outcome','not_enough_players','reason',v_outcome);
  END IF;

  -- Existing start functions recognize service_role through auth.jwt().  A
  -- pg_cron transaction has no request JWT, so mint the trusted local claim
  -- only for this transaction before calling those exact owners.
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  CASE
    WHEN v_game.game_type IN ('3-5-7','3-5-7-game','357') THEN
      SELECT public.three_five_seven_begin_game(p_game_id) INTO v_start;
    WHEN v_game.game_type IN ('holm','holm-game') THEN
      SELECT public.start_holm_initial_hand(p_game_id,false) INTO v_start;
    WHEN v_game.game_type='cribbage' THEN
      SELECT public.cribbage_begin_dealer_selection(p_game_id) INTO v_start;
    WHEN v_game.game_type='gin-rummy' THEN
      SELECT public.start_gin_rummy_initial_hand(p_game_id) INTO v_start;
    WHEN v_game.game_type='yahtzee' THEN
      SELECT public.start_yahtzee_round(p_game_id,NULL) INTO v_start;
    WHEN v_game.game_type IN ('horses','ship-captain-crew') THEN
      SELECT private.start_horses_scc_initial_round(
        p_game_id,p_expected_dealer_game_id
      ) INTO v_start;
    ELSE
      RAISE EXCEPTION 'advance_ante_phase_exact:unsupported_game_type:%',v_game.game_type;
  END CASE;

  RETURN jsonb_build_object(
    'outcome','advanced','game_type',v_game.game_type,'start',v_start
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.advance_ante_phase(
  p_game_id uuid,
  p_expected_dealer_game_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
  IF NOT v_service AND (
    auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.players player
       WHERE player.game_id=p_game_id AND player.user_id=auth.uid()
    )
  ) THEN
    RETURN jsonb_build_object('outcome','not_authorized');
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id;
  IF NOT FOUND OR v_game.ante_decision_deadline IS NULL THEN
    RETURN jsonb_build_object('outcome','stale_identity');
  END IF;
  IF p_expected_dealer_game_id IS NOT NULL
     AND v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id THEN
    RETURN jsonb_build_object('outcome','stale_identity');
  END IF;
  RETURN private.advance_ante_phase_exact(
    p_game_id,v_game.current_game_uuid,v_game.ante_decision_deadline,
    clock_timestamp()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_ante_decision(
  p_game_id uuid,
  p_expected_dealer_game_id uuid,
  p_player_id uuid,
  p_decision text,
  p_auto_ante boolean DEFAULT NULL,
  p_auto_ante_runback boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
  v_phase jsonb;
BEGIN
  IF p_decision NOT IN ('ante_up','sit_out') THEN
    RAISE EXCEPTION 'submit_ante_decision:invalid_decision';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.status IS DISTINCT FROM 'ante_decision'
     OR v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
     OR v_game.ante_decision_deadline IS NULL THEN
    RETURN jsonb_build_object('outcome','stale_identity');
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    RETURN jsonb_build_object('outcome','paused');
  END IF;
  SELECT * INTO v_player FROM public.players
   WHERE id=p_player_id AND game_id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_player.status IN ('observer','left')
     OR coalesce(v_player.sitting_out,false) THEN
    RETURN jsonb_build_object('outcome','player_ineligible');
  END IF;
  IF NOT v_service AND (
    auth.uid() IS NULL OR v_player.user_id IS DISTINCT FROM auth.uid()
  ) THEN
    RETURN jsonb_build_object('outcome','not_authorized');
  END IF;
  IF v_game.ante_decision_deadline<=clock_timestamp() THEN
    v_phase:=private.advance_ante_phase_exact(
      p_game_id,p_expected_dealer_game_id,v_game.ante_decision_deadline,
      clock_timestamp()
    );
    RETURN jsonb_build_object('outcome','deadline_expired','phase',v_phase);
  END IF;
  IF v_player.ante_decision IS NOT NULL THEN
    RETURN jsonb_build_object(
      'outcome','already_decided','decision',v_player.ante_decision,'deduped',true
    );
  END IF;

  UPDATE public.players
     SET ante_decision=p_decision,
         sitting_out=(p_decision='sit_out'),
         waiting=CASE WHEN p_decision='sit_out' THEN false ELSE waiting END,
         auto_ante=coalesce(p_auto_ante,auto_ante),
         auto_ante_runback=coalesce(p_auto_ante_runback,auto_ante_runback)
   WHERE id=p_player_id;
  v_phase:=private.advance_ante_phase_exact(
    p_game_id,p_expected_dealer_game_id,v_game.ante_decision_deadline,
    clock_timestamp()
  );
  RETURN jsonb_build_object(
    'outcome','accepted','decision',p_decision,'deduped',false,'phase',v_phase
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.advance_ante_phase_exact(
  uuid,uuid,timestamptz,timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_ante_phase(uuid,uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_ante_decision(
  uuid,uuid,uuid,text,boolean,boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_ante_phase(uuid,uuid)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.submit_ante_decision(
  uuid,uuid,uuid,text,boolean,boolean
) TO authenticated,service_role;

CREATE TABLE IF NOT EXISTS private.standard_postgame_advances (
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  dealer_game_id uuid NOT NULL,
  hand_number integer NOT NULL,
  winner_player_id uuid,
  target_status text NOT NULL,
  dealer_position integer,
  config_deadline timestamptz,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (game_id,dealer_game_id,hand_number)
);
ALTER TABLE private.standard_postgame_advances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.standard_postgame_advances
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.advance_standard_postgame(
  p_game_id uuid,
  p_dealer_game_id uuid,
  p_hand_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_claim private.standard_postgame_advances%ROWTYPE;
  v_winner_id uuid;
  v_active integer;
  v_humans integer;
  v_allow_bots boolean:=false;
  v_make_take boolean:=false;
  v_positions integer[];
  v_index integer;
  v_next_position integer;
  v_target text;
  v_deadline timestamptz;
  v_result jsonb;
BEGIN
  IF p_game_id IS NULL OR p_dealer_game_id IS NULL OR p_hand_number<1 THEN
    RAISE EXCEPTION 'advance_standard_postgame:missing_identity';
  END IF;
  SELECT * INTO v_claim FROM private.standard_postgame_advances claim
   WHERE claim.game_id=p_game_id
     AND claim.dealer_game_id=p_dealer_game_id
     AND claim.hand_number=p_hand_number;
  IF FOUND THEN
    RETURN v_claim.result || jsonb_build_object(
      'outcome','already_advanced','deduped',true
    );
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing_game'); END IF;
  IF v_game.game_type NOT IN ('holm','holm-game','horses','ship-captain-crew')
     OR v_game.status IS DISTINCT FROM 'game_over'
     OR v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM p_hand_number THEN
    RETURN jsonb_build_object(
      'outcome','stale_identity','status',v_game.status,
      'current_dealer_game_id',v_game.current_game_uuid,
      'current_hand_number',v_game.total_hands
    );
  END IF;

  SELECT result.winner_player_id INTO v_winner_id
    FROM public.game_results result
   WHERE result.game_id=p_game_id
     AND result.dealer_game_id=p_dealer_game_id
     AND result.hand_number=p_hand_number
   ORDER BY result.created_at DESC,result.id DESC
   LIMIT 1;

  DELETE FROM public.players player
   WHERE player.game_id=p_game_id
     AND coalesce(player.is_bot,false)
     AND coalesce(player.stand_up_next_hand,false);
  UPDATE public.players player
     SET status=CASE WHEN coalesce(player.stand_up_next_hand,false)
                       THEN 'left' ELSE player.status END,
         sitting_out=CASE
           WHEN coalesce(player.stand_up_next_hand,false)
             OR coalesce(player.sit_out_next_hand,false) THEN true
           WHEN coalesce(player.waiting,false) THEN false
           ELSE player.sitting_out END,
         waiting=false,stand_up_next_hand=false,sit_out_next_hand=false,
         auto_fold=false,current_decision=NULL,decision_locked=false,
         pre_fold=false,pre_stay=false,ante_decision=NULL,legs=0
   WHERE player.game_id=p_game_id;

  SELECT count(*) FILTER (
           WHERE NOT coalesce(player.sitting_out,false)
             AND player.status NOT IN ('observer','left')
             AND player.position IS NOT NULL),
         count(*) FILTER (
           WHERE NOT coalesce(player.sitting_out,false)
             AND player.status NOT IN ('observer','left')
             AND player.position IS NOT NULL
             AND NOT coalesce(player.is_bot,false))
    INTO v_active,v_humans
    FROM public.players player WHERE player.game_id=p_game_id;

  IF coalesce(v_game.pending_session_end,false) OR v_humans=0 THEN
    v_target:='session_ended';
  ELSIF v_active<2 THEN
    v_target:='waiting';
  ELSE
    SELECT coalesce(defaults.allow_bot_dealers,false) INTO v_allow_bots
      FROM public.game_defaults defaults
     WHERE defaults.game_type=v_game.game_type LIMIT 1;
    SELECT coalesce((setting.value->>'enabled')::boolean,false)
      INTO v_make_take FROM public.system_settings setting
     WHERE setting.key='make_it_take_it' LIMIT 1;
    v_allow_bots:=coalesce(v_allow_bots,false);
    v_make_take:=coalesce(v_make_take,false);

    IF v_make_take AND v_winner_id IS NOT NULL THEN
      SELECT player.position INTO v_next_position
        FROM public.players player
       WHERE player.id=v_winner_id AND player.game_id=p_game_id
         AND NOT coalesce(player.is_bot,false)
         AND NOT coalesce(player.sitting_out,false)
         AND player.status NOT IN ('observer','left')
         AND player.position IS NOT NULL;
    END IF;
    IF v_next_position IS NULL THEN
      SELECT array_agg(player.position ORDER BY player.position)
        INTO v_positions FROM public.players player
       WHERE player.game_id=p_game_id
         AND NOT coalesce(player.sitting_out,false)
         AND player.status NOT IN ('observer','left')
         AND player.position IS NOT NULL
         AND (v_allow_bots OR NOT coalesce(player.is_bot,false));
      IF coalesce(cardinality(v_positions),0)=0 THEN
        v_target:='dealer_selection';
      ELSE
        v_index:=array_position(v_positions,coalesce(v_game.dealer_position,1));
        v_next_position:=CASE WHEN v_index IS NULL THEN v_positions[1]
          ELSE v_positions[(v_index%cardinality(v_positions))+1] END;
      END IF;
    END IF;
    IF v_target IS NULL THEN
      v_target:='game_selection';
      v_deadline:=clock_timestamp()+make_interval(
        secs=>greatest(1,coalesce(v_game.game_setup_timer_seconds,30))
      );
    END IF;
  END IF;

  UPDATE public.rounds SET status='completed',decision_deadline=NULL,
         current_turn_position=NULL
   WHERE game_id=p_game_id AND dealer_game_id=p_dealer_game_id
     AND status<>'completed';
  UPDATE public.games
     SET status=v_target,config_complete=false,config_deadline=v_deadline,
         ante_decision_deadline=NULL,last_round_result=NULL,current_round=NULL,
         awaiting_next_round=false,next_round_number=NULL,pot=0,
         all_decisions_in=false,all_decisions_in_round_id=NULL,
         game_over_at=NULL,buck_position=NULL,total_hands=0,
         is_first_hand=false,current_game_uuid=NULL,dealer_selection_state=NULL,
         dealer_position=CASE WHEN v_target='game_selection'
                              THEN v_next_position ELSE dealer_position END,
         pending_session_end=CASE WHEN v_target='session_ended'
                                  THEN false ELSE pending_session_end END,
         session_ended_at=CASE WHEN v_target='session_ended'
           THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END
   WHERE id=p_game_id;

  v_result:=jsonb_build_object(
    'outcome','advanced','deduped',false,'winner_player_id',v_winner_id,
    'status',v_target,'dealer_position',CASE WHEN v_target='game_selection'
      THEN v_next_position ELSE NULL END,'config_deadline',v_deadline
  );
  INSERT INTO private.standard_postgame_advances(
    game_id,dealer_game_id,hand_number,winner_player_id,target_status,
    dealer_position,config_deadline,result
  ) VALUES (
    p_game_id,p_dealer_game_id,p_hand_number,v_winner_id,v_target,
    CASE WHEN v_target='game_selection' THEN v_next_position END,
    v_deadline,v_result
  );
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION private.advance_standard_postgame(uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;

-- Pause/resume is one locked database operation.  Resume shifts every active
-- persisted deadline by the exact paused duration, including JSON-backed dice
-- clocks and presentation leases.  Gin and Cribbage human choices remain
-- untimed; only their existing server-owned presentation clocks are shifted.
CREATE OR REPLACE FUNCTION public.set_game_paused(
  p_game_id uuid,
  p_paused boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
  v_now timestamptz:=clock_timestamp();
  v_duration interval;
  v_remaining integer;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing_game'); END IF;
  IF NOT v_service AND (
    auth.uid() IS NULL OR (
      v_game.current_host IS DISTINCT FROM auth.uid()
      AND NOT public.has_role(auth.uid(),'admin'::public.app_role)
    )
  ) THEN
    RETURN jsonb_build_object('outcome','not_authorized');
  END IF;
  IF coalesce(v_game.is_paused,false)=p_paused THEN
    RETURN jsonb_build_object('outcome','already_set','is_paused',p_paused,'deduped',true);
  END IF;

  IF p_paused THEN
    SELECT greatest(0,ceil(extract(epoch FROM (min(timer.due_at)-v_now))))::integer
      INTO v_remaining FROM private.game_timer_registry timer
     WHERE timer.game_id=p_game_id AND timer.state='scheduled';
    UPDATE public.games SET is_paused=true,timer_paused_at=v_now,
           paused_time_remaining=v_remaining WHERE id=p_game_id;
    RETURN jsonb_build_object(
      'outcome','paused','is_paused',true,'paused_at',v_now,
      'remaining_seconds',v_remaining
    );
  END IF;

  IF v_game.timer_paused_at IS NULL THEN
    RAISE EXCEPTION 'set_game_paused:missing_pause_identity';
  END IF;
  v_duration:=v_now-v_game.timer_paused_at;

  UPDATE public.games
     SET config_deadline=CASE WHEN config_deadline IS NULL THEN NULL
                              ELSE config_deadline+v_duration END,
         ante_decision_deadline=CASE WHEN ante_decision_deadline IS NULL THEN NULL
                                     ELSE ante_decision_deadline+v_duration END,
         game_over_at=CASE WHEN status='game_over' AND game_over_at IS NOT NULL
                           THEN game_over_at+v_duration ELSE game_over_at END
   WHERE id=p_game_id;

  UPDATE public.rounds round_row
     SET decision_deadline=CASE WHEN round_row.decision_deadline IS NULL THEN NULL
                                ELSE round_row.decision_deadline+v_duration END,
         presentation_fallback_at=CASE
           WHEN round_row.presentation_fallback_at IS NULL THEN NULL
           ELSE round_row.presentation_fallback_at+v_duration END,
         horses_state=CASE
           WHEN nullif(round_row.horses_state->>'turnDeadline','') IS NULL
             THEN round_row.horses_state
           ELSE jsonb_set(round_row.horses_state,'{turnDeadline}',to_jsonb(
             nullif(round_row.horses_state->>'turnDeadline','')::timestamptz+v_duration
           ),true) END,
         yahtzee_state=CASE
           WHEN nullif(round_row.yahtzee_state->>'turnDeadline','') IS NULL
             THEN round_row.yahtzee_state
           ELSE jsonb_set(round_row.yahtzee_state,'{turnDeadline}',to_jsonb(
             nullif(round_row.yahtzee_state->>'turnDeadline','')::timestamptz+v_duration
           ),true) END
   WHERE round_row.game_id=p_game_id
     AND round_row.dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
     AND round_row.status<>'completed';

  UPDATE private.three_five_seven_round_resolutions resolution
     SET presentation_fallback_at=resolution.presentation_fallback_at+v_duration
   WHERE resolution.game_id=p_game_id
     AND resolution.dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
     AND resolution.presentation_fallback_at IS NOT NULL;

  UPDATE private.game_timer_registry timer
     SET due_at=timer.due_at+v_duration,updated_at=v_now
   WHERE timer.game_id=p_game_id
     AND timer.state='scheduled'
     AND timer.timer_kind IN ('dealer_selection_prepare','dealer_selection_complete');

  UPDATE public.games SET is_paused=false,timer_paused_at=NULL,
         paused_time_remaining=NULL WHERE id=p_game_id;
  RETURN jsonb_build_object(
    'outcome','resumed','is_paused',false,
    'paused_duration_seconds',extract(epoch FROM v_duration)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_game_paused(uuid,boolean)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_game_paused(uuid,boolean)
  TO authenticated,service_role;

-- Make the existing dice fallback honor configured bot think time for every
-- next actor.  The established settlement/roll logic remains otherwise
-- byte-for-byte unchanged.
DO $patch_horses_turn$
DECLARE
  v_sql text;
  v_original text;
BEGIN
  SELECT pg_get_functiondef(
    'private.advance_horses_scc_expired_turn(uuid,timestamptz)'::regprocedure
  ) INTO v_sql;
  v_original:=v_sql;
  v_sql:=replace(v_sql,
    '  v_timer_seconds integer;' || chr(10) ||
    '  v_next_deadline timestamptz;',
    '  v_timer_seconds integer;' || chr(10) ||
    '  v_bot_delay_seconds numeric;' || chr(10) ||
    '  v_next_deadline timestamptz;'
  );
  v_sql:=replace(v_sql,
    $old$    SELECT COALESCE(defaults.decision_timer_seconds, 60) INTO v_timer_seconds
      FROM public.game_defaults AS defaults WHERE defaults.game_type = v_game.game_type;
    v_next_deadline := CASE
      WHEN v_next_is_bot AND v_all_absent THEN p_now
      WHEN v_next_auto_fold THEN p_now
      ELSE p_now + make_interval(secs => COALESCE(v_timer_seconds, 60))
    END;$old$,
    $new$    SELECT COALESCE(defaults.decision_timer_seconds, 60),
           COALESCE(defaults.bot_decision_delay_seconds, 2)
      INTO v_timer_seconds, v_bot_delay_seconds
      FROM public.game_defaults AS defaults WHERE defaults.game_type = v_game.game_type;
    v_next_deadline := CASE
      WHEN v_next_auto_fold THEN p_now
      WHEN v_next_is_bot THEN p_now + make_interval(secs => GREATEST(0.1, COALESCE(v_bot_delay_seconds, 2)))
      ELSE p_now + make_interval(secs => GREATEST(1, COALESCE(v_timer_seconds, 60)))
    END;$new$
  );
  IF v_sql=v_original
     OR position('v_bot_delay_seconds numeric' IN v_sql)=0
     OR position('WHEN v_next_is_bot THEN p_now + make_interval' IN v_sql)=0 THEN
    RAISE EXCEPTION 'canonical_timer_cutover:horses_turn_patch_drift';
  END IF;
  EXECUTE v_sql;
END;
$patch_horses_turn$;

-- The old function name records its original all-clients-absent admission.
-- Canonical dispatch now calls it only after the persisted five-second tie
-- presentation lease, so remove that obsolete presence gate and keep the
-- replay-safe tie/result/round logic.
DO $patch_horses_tie$
DECLARE
  v_sql text;
  v_original text;
BEGIN
  SELECT pg_get_functiondef(
    'private.horses_scc_rollover_abandoned_round(uuid,timestamptz)'::regprocedure
  ) INTO v_sql;
  v_original:=v_sql;
  v_sql:=replace(v_sql,
    $old$  IF NOT private.horses_scc_all_humans_absent(v_game.id, p_now) THEN
    RETURN jsonb_build_object('status', 'humans_present');
  END IF;

$old$,
    ''
  );
  v_sql:=replace(v_sql,
    $old$    'turnDeadline', CASE WHEN v_first_is_bot OR v_first_auto_fold THEN p_now ELSE p_now + interval '60 seconds' END
$old$,
    $new$    'turnDeadline', CASE
      WHEN v_first_auto_fold THEN p_now
      WHEN v_first_is_bot THEN p_now + make_interval(secs => GREATEST(0.1, COALESCE((
        SELECT defaults.bot_decision_delay_seconds FROM public.game_defaults defaults
         WHERE defaults.game_type=v_game.game_type LIMIT 1
      ), 2)))
      ELSE p_now + make_interval(secs => GREATEST(1, COALESCE((
        SELECT defaults.decision_timer_seconds FROM public.game_defaults defaults
         WHERE defaults.game_type=v_game.game_type LIMIT 1
      ), 60)))
    END
$new$
  );
  IF v_sql=v_original
     OR position('''humans_present''' IN v_sql)>0
     OR position('WHEN v_first_is_bot THEN p_now + make_interval' IN v_sql)=0 THEN
    RAISE EXCEPTION 'canonical_timer_cutover:horses_tie_patch_drift';
  END IF;
  EXECUTE v_sql;
END;
$patch_horses_tie$;

CREATE OR REPLACE FUNCTION private.advance_due_canonical_game_timers(
  p_limit integer DEFAULT 64
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_timer private.game_timer_registry%ROWTYPE;
  v_result jsonb;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_decision text;
  v_fold_probability numeric;
  v_processed integer:=0;
  v_failed integer:=0;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  FOR v_timer IN
    SELECT timer.*
      FROM private.game_timer_registry timer
      JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE timer.owner_task='canonical_timers'
       AND timer.state='scheduled'
       AND timer.due_at<=clock_timestamp()
       AND NOT coalesce(game_row.is_paused,false)
     ORDER BY timer.due_at,timer.id
     LIMIT greatest(1,least(coalesce(p_limit,64),256))
     FOR UPDATE OF timer SKIP LOCKED
  LOOP
    UPDATE private.game_timer_registry
       SET state='processing',attempt_count=attempt_count+1,
           last_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_timer.id;
    BEGIN
      v_result:=NULL;
      CASE v_timer.timer_kind
        WHEN 'dealer_selection_prepare' THEN
          v_result:=private.prepare_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'dealer_selection_complete' THEN
          v_result:=private.complete_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'config_timeout' THEN
          v_result:=private.handle_config_deadline_timeout_exact(
            v_timer.game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            (v_timer.metadata->>'expected_dealer_position')::integer
          );
        WHEN 'ante_phase' THEN
          v_result:=private.advance_ante_phase_exact(
            v_timer.game_id,v_timer.dealer_game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            clock_timestamp()
          );
        WHEN 'holm_decision' THEN
          SELECT * INTO v_player FROM public.players
           WHERE id=v_timer.actor_player_id;
          IF NOT FOUND THEN
            v_result:=jsonb_build_object('outcome','stale_actor');
          ELSE
            IF coalesce(v_player.is_bot,false) THEN
              SELECT coalesce(defaults.bot_fold_probability,30)
                INTO v_fold_probability FROM public.game_defaults defaults
               WHERE defaults.game_type='holm' LIMIT 1;
              v_decision:=CASE WHEN random()*100<coalesce(v_fold_probability,30)
                               THEN 'fold' ELSE 'stay' END;
            ELSE
              v_decision:='fold';
            END IF;
            SELECT public.holm_apply_deadline_decision(
              v_timer.game_id,v_timer.round_id,v_player.id,v_decision,
              NOT coalesce(v_player.is_bot,false)
            ) INTO v_result;
          END IF;
        WHEN 'horses_scc_turn' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
        WHEN 'horses_scc_terminal' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
          IF v_result->>'status'='tie_waiting_for_client' THEN
            v_result:=private.horses_scc_rollover_abandoned_round(
              v_timer.round_id,clock_timestamp()
            );
          END IF;
        WHEN 'standard_postgame' THEN
          v_result:=private.advance_standard_postgame(
            v_timer.game_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        ELSE
          RAISE EXCEPTION 'advance_due_canonical_game_timers:unknown_kind:%',
            v_timer.timer_kind;
      END CASE;

      IF v_result->>'outcome' IN ('pending','paused','not_prepared','no_eligible_players') THEN
        SELECT * INTO v_game FROM public.games WHERE id=v_timer.game_id;
        UPDATE private.game_timer_registry
           SET state='scheduled',
               due_at=CASE WHEN v_result->>'outcome'='pending'
                 AND v_result->>'deadline' IS NOT NULL
                 THEN (v_result->>'deadline')::timestamptz
                 ELSE clock_timestamp()+interval '1 second' END,
               metadata=CASE WHEN v_timer.timer_kind='ante_phase'
                 AND v_game.ante_decision_deadline IS NOT NULL
                 THEN metadata || jsonb_build_object(
                   'expected_deadline',v_game.ante_decision_deadline
                 ) ELSE metadata END,
               updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      ELSE
        UPDATE private.game_timer_registry
           SET state='completed',completed_at=clock_timestamp(),
               metadata=metadata || jsonb_build_object(
                 'result',coalesce(v_result,'{}'::jsonb)
               ),updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      END IF;
      v_processed:=v_processed+1;
    EXCEPTION WHEN OTHERS THEN
      v_error:=SQLSTATE || ':' || SQLERRM;
      UPDATE private.game_timer_registry
         SET state='scheduled',due_at=clock_timestamp()+interval '5 seconds',
             last_error=v_error,updated_at=clock_timestamp()
       WHERE id=v_timer.id;
      v_failed:=v_failed+1;
    END;
  END LOOP;

  -- Client-created legacy dice rounds used NULL as a bot-delay sentinel.
  -- Convert only the exact active post-cutover actor to a database timestamp;
  -- no historical row is scanned or admitted.
  UPDATE public.rounds round_row
     SET horses_state=jsonb_set(round_row.horses_state,'{turnDeadline}',to_jsonb(
       clock_timestamp()+make_interval(secs=>greatest(0.1,coalesce(defaults.bot_decision_delay_seconds,2)))
     ),true)
    FROM public.games game_row
    JOIN public.game_defaults defaults
      ON defaults.game_type=game_row.game_type
    JOIN public.players actor
      ON actor.game_id=game_row.id AND actor.is_bot=true
   WHERE round_row.game_id=game_row.id
     AND game_row.game_type IN ('horses','ship-captain-crew')
     AND game_row.status='in_progress'
     AND NOT coalesce(game_row.is_paused,false)
     AND game_row.current_game_uuid IS NOT DISTINCT FROM round_row.dealer_game_id
     AND round_row.horses_state->>'gamePhase'='playing'
     AND nullif(round_row.horses_state->>'turnDeadline','') IS NULL
     AND actor.id::text=round_row.horses_state->>'currentTurnPlayerId'
     AND EXISTS (
       SELECT 1 FROM private.game_timer_cutover cutover
        WHERE cutover.singleton=true
          AND game_row.timer_generation>0
     );

  RETURN jsonb_build_object(
    'outcome',CASE WHEN v_failed=0 THEN 'completed' ELSE 'partial_failure' END,
    'processed',v_processed,'failed',v_failed
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.advance_due_canonical_game_timers(integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.advance_due_canonical_game_timers(integer)
  TO service_role;

-- Add the registry to the serialized dispatcher and move dice from the old
-- five-second lane to the common one-second gameplay cadence.
DO $patch_dispatcher$
DECLARE
  v_sql text;
  v_original text;
BEGIN
  SELECT pg_get_functiondef(
    'private.run_due_game_recovery_task(text)'::regprocedure
  ) INTO v_sql;
  v_original:=v_sql;
  v_sql:=replace(v_sql,
    $old$  CASE p_task_name
    WHEN 'holm' THEN$old$,
    $new$  CASE p_task_name
    WHEN 'canonical_timers' THEN
      PERFORM private.advance_due_canonical_game_timers();
    WHEN 'holm' THEN$new$
  );
  IF v_sql=v_original OR position('WHEN ''canonical_timers''' IN v_sql)=0 THEN
    RAISE EXCEPTION 'canonical_timer_cutover:task_dispatch_patch_drift';
  END IF;
  EXECUTE v_sql;

  SELECT pg_get_functiondef(
    'private.advance_due_game_state()'::regprocedure
  ) INTO v_sql;
  v_original:=v_sql;
  v_sql:=replace(v_sql,
    $old$  FOREACH v_task IN ARRAY ARRAY[
    'holm',
    'cribbage',$old$,
    $new$  FOREACH v_task IN ARRAY ARRAY[
    'canonical_timers',
    'holm',
    'cribbage',$new$
  );
  v_sql:=replace(v_sql,
    $old$    'three_five_seven'
  ]::text[]$old$,
    $new$    'three_five_seven',
    'horses_scc'
  ]::text[]$new$
  );
  v_sql:=replace(v_sql,
    $old$      'horses_scc',
      'session_abandonment'$old$,
    $new$      'session_abandonment'$new$
  );
  IF v_sql=v_original
     OR position('''canonical_timers''' IN v_sql)=0
     OR position('''three_five_seven'',' || chr(10) || '    ''horses_scc''' IN v_sql)=0 THEN
    RAISE EXCEPTION 'canonical_timer_cutover:main_dispatch_patch_drift';
  END IF;
  EXECUTE v_sql;
END;
$patch_dispatcher$;

-- Future-only cutover admission.  This is intentionally not an expired-row
-- sweep: every admitted source is exact, active, unpaused, and strictly newer
-- than the cutover instant.
DO $future_cutover$
DECLARE
  v_cutover timestamptz;
  v_game record;
  v_round record;
  v_due timestamptz;
  v_actor uuid;
BEGIN
  SELECT cutover.cutover_at INTO v_cutover
    FROM private.game_timer_cutover cutover WHERE cutover.singleton=true;

  FOR v_game IN
    SELECT game_row.* FROM public.games game_row
     WHERE NOT coalesce(game_row.is_paused,false)
       AND (
         (game_row.status IN ('dealer_selection','game_selection','configuring')
           AND NOT coalesce(game_row.config_complete,false)
           AND game_row.config_deadline>v_cutover)
         OR (game_row.status='ante_decision'
           AND game_row.current_game_uuid IS NOT NULL
           AND game_row.ante_decision_deadline>v_cutover)
       )
  LOOP
    IF v_game.config_deadline>v_cutover THEN
      PERFORM private.register_game_timer(
        v_game.id,'config_timeout',v_game.timer_generation::text || ':' ||
          coalesce(v_game.dealer_position,0)::text,'canonical_timers',
        v_game.config_deadline,v_game.current_game_uuid,NULL,v_game.total_hands,
        NULL,v_game.status,jsonb_build_object(
          'expected_deadline',v_game.config_deadline,
          'expected_dealer_position',v_game.dealer_position
        )
      );
    END IF;
    IF v_game.ante_decision_deadline>v_cutover THEN
      PERFORM private.register_game_timer(
        v_game.id,'ante_phase',v_game.timer_generation::text || ':' ||
          v_game.current_game_uuid::text,'canonical_timers',
        v_game.ante_decision_deadline,v_game.current_game_uuid,NULL,
        v_game.total_hands,NULL,v_game.status,jsonb_build_object(
          'expected_deadline',v_game.ante_decision_deadline
        )
      );
    END IF;
  END LOOP;

  FOR v_round IN
    SELECT round_row.*,game_row.game_type,game_row.status AS game_status,
           game_row.current_game_uuid
      FROM public.rounds round_row
      JOIN public.games game_row ON game_row.id=round_row.game_id
     WHERE game_row.status='in_progress'
       AND NOT coalesce(game_row.is_paused,false)
       AND game_row.current_game_uuid IS NOT DISTINCT FROM round_row.dealer_game_id
       AND (
         round_row.decision_deadline>v_cutover
         OR round_row.presentation_fallback_at>v_cutover
         OR CASE WHEN nullif(round_row.horses_state->>'turnDeadline','') IS NULL
              THEN false ELSE nullif(round_row.horses_state->>'turnDeadline','')::timestamptz>v_cutover END
       )
  LOOP
    SELECT player.id INTO v_actor FROM public.players player
     WHERE player.game_id=v_round.game_id
       AND player.position=v_round.current_turn_position LIMIT 1;
    IF v_round.decision_deadline>v_cutover THEN
      PERFORM private.register_game_timer(
        v_round.game_id,
        CASE WHEN v_round.game_type IN ('holm','holm-game') THEN 'holm_decision'
             WHEN v_round.game_type='yahtzee' THEN 'yahtzee_turn'
             ELSE 'three_five_seven_decision' END,
        v_round.id::text || ':' || coalesce(v_actor::text,v_round.decision_deadline::text),
        CASE WHEN v_round.game_type IN ('holm','holm-game') THEN 'canonical_timers'
             WHEN v_round.game_type='yahtzee' THEN 'yahtzee'
             ELSE 'three_five_seven' END,
        v_round.decision_deadline,v_round.dealer_game_id,v_round.id,
        v_round.hand_number,v_actor,v_round.status,
        jsonb_build_object('expected_deadline',v_round.decision_deadline)
      );
    END IF;
    IF v_round.presentation_fallback_at>v_cutover THEN
      PERFORM private.register_game_timer(
        v_round.game_id,'presentation_fallback',v_round.id::text,
        CASE WHEN v_round.game_type IN ('holm','holm-game') THEN 'holm'
             WHEN v_round.game_type='cribbage' THEN 'cribbage'
             ELSE 'three_five_seven' END,
        v_round.presentation_fallback_at,v_round.dealer_game_id,v_round.id,
        v_round.hand_number,NULL,v_round.status,'{}'::jsonb
      );
    END IF;
    BEGIN
      v_due:=nullif(v_round.horses_state->>'turnDeadline','')::timestamptz;
      v_actor:=nullif(v_round.horses_state->>'currentTurnPlayerId','')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_due:=NULL;v_actor:=NULL;
    END;
    IF v_due>v_cutover THEN
      PERFORM private.register_game_timer(
        v_round.game_id,'horses_scc_turn',v_round.id::text || ':' ||
          coalesce(v_actor::text,'none'),'canonical_timers',v_due,
        v_round.dealer_game_id,v_round.id,v_round.hand_number,v_actor,
        v_round.status,'{}'::jsonb
      );
    END IF;
  END LOOP;
END;
$future_cutover$;

COMMENT ON TABLE private.game_timer_registry IS
  'Exact-identity admission and observability registry for all database-owned gameplay, setup, ante, presentation, and postgame clocks.';
COMMENT ON FUNCTION private.advance_due_canonical_game_timers(integer) IS
  'Processes due canonical timer identities without a connected client; per-game functions retain rule and settlement ownership.';
COMMENT ON FUNCTION public.set_game_paused(uuid,boolean) IS
  'Atomically pauses or resumes every persisted timer for one game, preserving the exact remaining duration.';
