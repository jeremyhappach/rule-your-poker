-- 1) Schema additions to public.rounds
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS pending_turn_position integer,
  ADD COLUMN IF NOT EXISTS presentation_generation integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS presentation_fallback_at timestamptz;

COMMENT ON COLUMN public.rounds.pending_turn_position IS
  'Server-elected actor for the upcoming actionability commit. Populated at deal creation for Holm; cleared atomically by activate_holm_round_after_deal_presentation. Never written by clients.';
COMMENT ON COLUMN public.rounds.presentation_generation IS
  'One-time token gating exactly one presentation-complete promotion per round. Bumped by activate_holm_round_after_deal_presentation on success.';
COMMENT ON COLUMN public.rounds.presentation_fallback_at IS
  'Server time after which the deadline-enforcement path may safely auto-promote a still-dealing Holm round. Fallback only; normal flow is host acknowledgement.';

-- Helpful index for the fallback sweep
CREATE INDEX IF NOT EXISTS idx_rounds_presentation_fallback
  ON public.rounds (presentation_fallback_at)
  WHERE status = 'dealing' AND presentation_fallback_at IS NOT NULL;

-- 2) Promotion RPC
CREATE OR REPLACE FUNCTION public.activate_holm_round_after_deal_presentation(
  _round_id uuid,
  _hand_context_id uuid,
  _presentation_generation integer,
  _from_fallback boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _round         public.rounds%ROWTYPE;
  _game          public.games%ROWTYPE;
  _timer_seconds integer;
  _deadline      timestamptz;
  _is_host       boolean := false;
  _caller        uuid := auth.uid();
BEGIN
  -- HCI for Holm == round.id
  IF _round_id IS NULL OR _hand_context_id IS NULL OR _round_id <> _hand_context_id THEN
    RETURN jsonb_build_object('outcome','rejected','reason','hci-mismatch');
  END IF;

  SELECT * INTO _round FROM public.rounds WHERE id = _round_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','rejected','reason','round-not-found');
  END IF;

  SELECT * INTO _game FROM public.games WHERE id = _round.game_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','rejected','reason','game-not-found');
  END IF;

  -- Only Holm rounds use this promotion path.
  IF COALESCE(_game.game_type, '') <> 'holm-game' THEN
    RETURN jsonb_build_object('outcome','rejected','reason','wrong-game-type');
  END IF;

  -- Idempotent success: already promoted on this exact generation lineage.
  --   - Successful promotion bumps generation by +1 and clears pending.
  --   - So a repeat request with the OLD generation against an already-betting
  --     round with no pending actor and matching turn is a no-op success.
  IF _round.status = 'betting'
     AND _round.pending_turn_position IS NULL
     AND _round.presentation_generation = _presentation_generation + 1
  THEN
    RETURN jsonb_build_object(
      'outcome','already_active',
      'round_id', _round.id,
      'current_turn_position', _round.current_turn_position,
      'decision_deadline', _round.decision_deadline,
      'presentation_generation', _round.presentation_generation
    );
  END IF;

  -- Token / status / pending guards.
  IF _round.status <> 'dealing' THEN
    RETURN jsonb_build_object('outcome','rejected','reason','stale-status','status',_round.status);
  END IF;
  IF _round.presentation_generation <> _presentation_generation THEN
    RETURN jsonb_build_object(
      'outcome','rejected','reason','stale-generation',
      'expected', _round.presentation_generation,
      'received', _presentation_generation
    );
  END IF;
  IF _round.pending_turn_position IS NULL THEN
    RETURN jsonb_build_object('outcome','rejected','reason','no-pending-actor');
  END IF;

  -- Host election: normal flow requires the caller to be the elected
  -- session presentation host. Fallback path skips this check and is only
  -- reachable from trusted server code (enforce-deadlines edge function
  -- running with the service role) — RLS allows the SECURITY DEFINER body
  -- to execute regardless of caller, so we additionally require that the
  -- fallback caller has no auth.uid() (anonymous service role).
  IF _from_fallback THEN
    -- Fallback: gate on presentation_fallback_at AND on caller having no
    -- end-user identity (service role / cron). This prevents a client from
    -- ever invoking the fallback branch.
    IF _caller IS NOT NULL THEN
      RETURN jsonb_build_object('outcome','rejected','reason','fallback-requires-service-role');
    END IF;
    IF _round.presentation_fallback_at IS NULL
       OR _round.presentation_fallback_at > now()
    THEN
      RETURN jsonb_build_object('outcome','rejected','reason','fallback-not-yet-due');
    END IF;
  ELSE
    IF _caller IS NULL THEN
      RETURN jsonb_build_object('outcome','rejected','reason','no-auth');
    END IF;
    _is_host := (_game.current_host IS NOT NULL AND _game.current_host = _caller);
    IF NOT _is_host THEN
      RETURN jsonb_build_object('outcome','rejected','reason','not-presentation-host');
    END IF;
  END IF;

  -- Resolve the canonical Holm turn duration from game_defaults.
  SELECT gd.decision_timer_seconds INTO _timer_seconds
    FROM public.game_defaults gd
    WHERE gd.game_type = 'holm-game'
    LIMIT 1;
  IF _timer_seconds IS NULL OR _timer_seconds < 1 THEN
    _timer_seconds := 30;
  END IF;

  _deadline := now() + make_interval(secs => _timer_seconds);

  -- Atomic actionability commit, with a CAS guard on (status,pending,generation).
  UPDATE public.rounds
     SET status = 'betting',
         current_turn_position = _round.pending_turn_position,
         decision_deadline = _deadline,
         pending_turn_position = NULL,
         presentation_fallback_at = NULL,
         presentation_generation = _round.presentation_generation + 1
   WHERE id = _round.id
     AND status = 'dealing'
     AND presentation_generation = _presentation_generation
     AND pending_turn_position = _round.pending_turn_position;

  IF NOT FOUND THEN
    -- Lost the CAS race; re-read and report.
    SELECT * INTO _round FROM public.rounds WHERE id = _round_id;
    RETURN jsonb_build_object(
      'outcome','rejected','reason','cas-lost',
      'status', _round.status,
      'presentation_generation', _round.presentation_generation
    );
  END IF;

  RETURN jsonb_build_object(
    'outcome','promoted',
    'round_id', _round.id,
    'current_turn_position', _round.pending_turn_position,
    'decision_deadline', _deadline,
    'presentation_generation', _round.presentation_generation + 1,
    'from_fallback', _from_fallback
  );
END;
$function$;

-- 3) Execute privileges
REVOKE ALL ON FUNCTION public.activate_holm_round_after_deal_presentation(uuid,uuid,integer,boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.activate_holm_round_after_deal_presentation(uuid,uuid,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_holm_round_after_deal_presentation(uuid,uuid,integer,boolean) TO service_role;