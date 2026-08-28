-- Permit bot-style actions for exactly one additional case: the authenticated
-- owner of an armed fake-money Yahtzee Auto-roll turn. All ordinary humans,
-- peers, real-money games, and deadline_auto callers retain the existing gate.

DO $migration$
DECLARE
  v_definition text;
  v_new_gate text := $gate$IF NOT v_deadline_auto
       AND NOT coalesce(v_player.is_bot,false)
       AND NOT (
         NOT coalesce(v_game.real_money,false)
         AND coalesce(v_player.auto_fold,false)
         AND v_action IN ('bot_roll','bot_score')
         AND v_player.user_id IS NOT DISTINCT FROM v_actor_id
       ) THEN
      RAISE EXCEPTION 'yahtzee_apply_action:auto_requires_bot';
    END IF;$gate$;
BEGIN
  SELECT pg_get_functiondef('public.yahtzee_apply_action(uuid,uuid,text,integer,text,boolean[],integer)'::regprocedure)
    INTO v_definition;
  v_definition:=regexp_replace(
    v_definition,
    E'IF NOT v_deadline_auto AND NOT coalesce\\(v_player\\.is_bot,false\\) THEN\\s+RAISE EXCEPTION ''yahtzee_apply_action:auto_requires_bot'';\\s+END IF;',
    v_new_gate
  );
  IF position('AND coalesce(v_player.auto_fold,false)' IN v_definition)=0 THEN
    RAISE EXCEPTION 'yahtzee_auto_roll_owner_authorization:expected_gate_not_found';
  END IF;
  EXECUTE v_definition;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.yahtzee_apply_auto_roll_action(
  _round_id uuid,
  _player_id uuid,
  _action text,
  _category text DEFAULT NULL,
  _hold_mask boolean[] DEFAULT NULL,
  _expected_action_sequence integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_actor_id uuid:=auth.uid();
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_state jsonb;
  v_action text:=lower(coalesce(_action,''));
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'yahtzee_apply_auto_roll_action:authentication_required';
  END IF;
  IF v_action NOT IN ('bot_roll','bot_score') THEN
    RAISE EXCEPTION 'yahtzee_apply_auto_roll_action:invalid_action';
  END IF;

  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'yahtzee_apply_auto_roll_action:round_not_found'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id=v_round.game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'yahtzee' THEN
    RAISE EXCEPTION 'yahtzee_apply_auto_roll_action:not_yahtzee_game';
  END IF;
  IF coalesce(v_game.real_money,false) THEN
    RAISE EXCEPTION 'yahtzee_apply_auto_roll_action:real_money_forbidden';
  END IF;
  SELECT * INTO v_player FROM public.players
   WHERE id=_player_id AND game_id=v_game.id FOR UPDATE;
  IF NOT FOUND OR v_player.status IN ('observer','left') THEN
    RAISE EXCEPTION 'yahtzee_apply_auto_roll_action:player_not_found';
  END IF;
  IF coalesce(v_player.is_bot,false)
     OR NOT coalesce(v_player.auto_fold,false)
     OR v_player.user_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'yahtzee_apply_auto_roll_action:not_auto_roll_owner';
  END IF;

  v_state:=v_round.yahtzee_state;
  IF v_state->>'gamePhase' IS DISTINCT FROM 'playing'
     OR nullif(v_state->>'currentTurnPlayerId','')::uuid IS DISTINCT FROM _player_id THEN
    RETURN jsonb_build_object('outcome','rejected','reason','not_current_turn','state',v_state);
  END IF;

  RETURN public.yahtzee_apply_action(
    _round_id,_player_id,v_action,NULL,_category,_hold_mask,_expected_action_sequence
  );
END;
$function$;
