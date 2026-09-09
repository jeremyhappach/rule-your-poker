-- Observational 3-5-7 provenance. No decision/settlement RPC or public projection changes.
SET lock_timeout = '2s';

CREATE TABLE IF NOT EXISTS private.decision_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  round_id uuid REFERENCES public.rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  event_kind text NOT NULL CHECK (event_kind IN ('decision_committed','auto_fold_changed')),
  server_context jsonb NOT NULL,
  client_claim jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS decision_provenance_game_time_idx
  ON private.decision_provenance(game_id, recorded_at);
ALTER TABLE private.decision_provenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.decision_provenance FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE private.decision_provenance IS
  'Private diagnostic history; client_claim is untrusted input evidence, never gameplay authority. No cards or tokens. Cascades with synthetic session cleanup.';

CREATE OR REPLACE FUNCTION private.record_357_decision_provenance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private
SET lock_timeout = '25ms'
AS $function$
DECLARE
  v_scope record;
  v_path text := nullif(current_setting('request.path',true),'');
  v_actor uuid := auth.uid();
  v_recovery boolean := coalesce(current_setting('app.three_five_seven_recovery',true),'')='on';
  v_headers jsonb; v_input jsonb; v_raw text;
  v_client jsonb := '{"source":"unknown"}'::jsonb;
  v_producer text := 'unknown';
  v_decision boolean := NEW.decision_locked IS TRUE AND NEW.current_decision IN ('stay','fold')
    AND (OLD.decision_locked IS DISTINCT FROM NEW.decision_locked OR OLD.current_decision IS DISTINCT FROM NEW.current_decision);
BEGIN
  SELECT g.game_type, g.current_game_uuid AS dealer_game_id, g.total_hands AS hand_number,
    g.current_round AS round_number, r.id AS round_id, r.decision_deadline
    INTO v_scope
    FROM public.games g LEFT JOIN public.rounds r
      ON r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid
      AND r.hand_number=g.total_hands AND r.round_number=g.current_round
    WHERE g.id=NEW.game_id;
  IF NOT FOUND OR v_scope.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN RETURN NEW; END IF;

  IF v_decision AND v_path='/rpc/three_five_seven_submit_decision' AND v_actor=NEW.user_id AND NOT NEW.is_bot THEN
    v_producer := 'authenticated_decision_rpc';
    -- Validate and whitelist optional input; malformed metadata cannot reject gameplay.
    BEGIN
      v_headers := nullif(current_setting('request.headers',true),'')::jsonb;
      v_raw := v_headers->>'x-client-info';
      v_raw := CASE WHEN left(v_raw,17)='ptown-decision/1 ' THEN substring(v_raw FROM 18) ELSE NULL END;
      IF octet_length(v_raw)<=1400 THEN
        v_input := v_raw::jsonb;
        IF v_input->>'version'='1' AND v_input->>'gameId'=NEW.game_id::text
          AND v_input->>'dealerGameId'=v_scope.dealer_game_id::text
          AND v_input->>'roundId'=v_scope.round_id::text AND v_input->>'playerId'=NEW.id::text
          AND v_input->>'decision'=NEW.current_decision
          AND v_input->>'requestId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
          v_client := jsonb_strip_nulls(jsonb_build_object(
            'source',CASE WHEN v_input->>'source' IN ('button','auto_fold') THEN v_input->>'source' ELSE 'unknown' END,
            'request_id',v_input->>'requestId', 'build',left(v_input->>'build',40),
            'activated_at_ms',CASE WHEN jsonb_typeof(v_input->'activatedAt')='number' THEN v_input->'activatedAt' END,
            'trusted',CASE WHEN jsonb_typeof(v_input->'trusted')='boolean' THEN v_input->'trusted' END,
            'modality',CASE WHEN v_input->>'modality' IN ('mouse','touch','pen','keyboard_or_assistive','unknown') THEN v_input->>'modality' END
          ));
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN v_client := '{"source":"unknown","metadata_invalid":true}'::jsonb;
    END;
  ELSIF v_decision AND NEW.is_bot AND v_recovery THEN
    v_producer := 'server_bot_recovery';
  ELSIF v_decision AND NEW.current_decision='fold'
    AND (v_path='/rpc/three_five_seven_expire_round' OR v_recovery)
    AND v_scope.decision_deadline<=clock_timestamp() THEN
    v_producer := 'server_deadline';
  ELSIF NOT v_decision AND v_path='/rpc/set_automatic_play' AND v_actor=NEW.user_id THEN
    v_producer := 'authenticated_preference_rpc';
  END IF;

  INSERT INTO private.decision_provenance(game_id,round_id,player_id,event_kind,server_context,client_claim)
  VALUES(NEW.game_id,v_scope.round_id,NEW.id,
    CASE WHEN v_decision THEN 'decision_committed' ELSE 'auto_fold_changed' END,
    jsonb_build_object('producer',v_producer,'actor_user_id',v_actor,
      'request_path',v_path,'recovery_context',v_recovery,'is_bot',NEW.is_bot,
      'dealer_game_id',v_scope.dealer_game_id,'hand_number',v_scope.hand_number,'round_number',v_scope.round_number,
      'decision',NEW.current_decision,'decision_deadline',v_scope.decision_deadline,
      'auto_fold_before',OLD.auto_fold,'auto_fold',NEW.auto_fold), v_client);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'decision_provenance_unavailable sqlstate=%',SQLSTATE;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.record_357_decision_provenance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_record_357_decision_provenance ON public.players;
CREATE TRIGGER zz_record_357_decision_provenance
AFTER UPDATE OF decision_locked, current_decision, auto_fold ON public.players
FOR EACH ROW WHEN (
  (NEW.decision_locked IS TRUE AND NEW.current_decision IN ('stay','fold')
    AND (OLD.decision_locked IS DISTINCT FROM NEW.decision_locked OR OLD.current_decision IS DISTINCT FROM NEW.current_decision))
  OR OLD.auto_fold IS DISTINCT FROM NEW.auto_fold
)
EXECUTE FUNCTION private.record_357_decision_provenance();
RESET lock_timeout;
