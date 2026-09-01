CREATE OR REPLACE FUNCTION private.sync_game_timer_registry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_identity text;
  v_standard_postgame_delay_seconds integer;
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
    IF NEW.game_type IN ('holm','holm-game') THEN
      SELECT defaults.holm_presentation_ack_fallback_seconds
        INTO v_standard_postgame_delay_seconds
        FROM public.game_defaults defaults
       WHERE defaults.game_type = 'holm';

      IF v_standard_postgame_delay_seconds IS NULL THEN
        RAISE EXCEPTION
          'sync_game_timer_registry:missing_holm_postgame_fallback_default';
      END IF;
    ELSE
      v_standard_postgame_delay_seconds := 15;
    END IF;

    v_identity := NEW.current_game_uuid::text || ':' ||
      coalesce(NEW.total_hands, 0)::text;
    PERFORM private.register_game_timer(
      NEW.id, 'standard_postgame', v_identity, 'canonical_timers',
      NEW.game_over_at + make_interval(secs => v_standard_postgame_delay_seconds),
      NEW.current_game_uuid, NULL, NEW.total_hands, NULL, NEW.status,
      jsonb_build_object(
        'game_over_at', NEW.game_over_at,
        'fallback_seconds', v_standard_postgame_delay_seconds
      )
    );
  ELSE
    PERFORM private.cancel_game_timers(NEW.id, 'standard_postgame');
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.sync_game_timer_registry() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sync_game_timer_registry()
  FROM anon, authenticated;
