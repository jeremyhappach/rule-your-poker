-- Farkle Balanced strategy only. Preserve the reducer, action RPC and scheduler.
DO $guard$
BEGIN
  PERFORM pg_advisory_xact_lock(19092026,1);
  IF md5(pg_get_functiondef('private.farkle_bot_action_v1(jsonb)'::regprocedure)) <> 'df325aac7148729ee9c67dc17b8fc3c5'
  THEN RAISE EXCEPTION 'farkle_hot_dice_policy:owner_drift'; END IF;
END $guard$;

CREATE OR REPLACE FUNCTION private.farkle_bot_action_v1(s jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $f$
DECLARE best jsonb; threshold integer; actor text:=s->>'currentTurnPlayerId'; banked_state jsonb;
BEGIN
 IF s->>'stage'='hold' THEN
  SELECT value INTO best FROM jsonb_array_elements(s->'legalHolds')
  ORDER BY (value->>'points')::integer DESC,jsonb_array_length(value->'indexes') DESC,value->'indexes' LIMIT 1;
  IF best IS NULL THEN RAISE EXCEPTION 'farkle:bot_has_no_legal_hold'; END IF;
  RETURN jsonb_build_object('action','hold','selection',best->'indexes');
 END IF;
 IF s->>'stage'='bank_or_roll' THEN
  -- Preserve target-reaching Banks before considering ordinary risk policy.
  IF (s->'playerStates'->actor->>'banked')::bigint+(s->>'thisTurn')::bigint >= (s->'config'->>'targetScore')::bigint
  THEN RETURN jsonb_build_object('action','bank','selection','[]'::jsonb); END IF;
  IF s->'finalQueue'<>'null'::jsonb OR (s->>'tiebreakTurn')::integer>0 THEN
   -- Reuse the pure endgame owner; this evaluation writes no gameplay state.
   banked_state:=private.farkle_finish_turn_v1(s,true);
   IF banked_state->>'gamePhase'='complete' AND banked_state->>'winnerPlayerId'=actor
   THEN RETURN jsonb_build_object('action','bank','selection','[]'::jsonb); END IF;
  END IF;
  -- Only HOT DICE leaves bank_or_roll with all six available in cycle 2+.
  -- The next roll enters hold; a partial Hold restores ordinary threshold use.
  IF s->'config'->>'botPolicy'='balanced' AND (s->>'scoringCycle')::integer>1
   AND s->'available'='[0,1,2,3,4,5]'::jsonb
  THEN RETURN jsonb_build_object('action','roll','selection','[]'::jsonb); END IF;
  threshold:=(s->'config'->>'botBankThreshold')::integer;
  IF (s->>'thisTurn')::bigint>=threshold
  THEN RETURN jsonb_build_object('action','bank','selection','[]'::jsonb); END IF;
 END IF;
 RETURN jsonb_build_object('action','roll','selection','[]'::jsonb);
END $f$;
