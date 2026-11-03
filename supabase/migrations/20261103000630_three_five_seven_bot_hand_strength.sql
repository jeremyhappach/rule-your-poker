BEGIN;

-- Refuse to overwrite an independently changed recovery owner; allow an exact replay.
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('private.three_five_seven_recover_game(uuid)'::regprocedure))
     NOT IN ('bb8610dd471a71269501df2976e5fc36','4c45cfbc7e4afdab3fefae46534ec391') THEN
    RAISE EXCEPTION '357_bot:recovery_owner_changed';
  END IF;
END;
$guard$;

-- Hand-strength policy is private and uses the canonical 3/5/7 hand scorer.
-- NULL means unusable cards: recovery must not invent a decision.
CREATE OR REPLACE FUNCTION private.three_five_seven_bot_fold_probability(
  p_cards jsonb, p_round_number integer, p_aggression text,
  p_use_hand_strength boolean, p_fixed_probability numeric
) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path=pg_catalog,private
AS $policy$
DECLARE
  v_label text; v_wild text; v_wilds integer; v_count integer; v_rank integer:=0;
  v_base numeric; v_multiplier numeric;
BEGIN
  IF p_round_number IS NULL OR p_round_number NOT BETWEEN 1 AND 3
     OR jsonb_typeof(p_cards) IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
  IF jsonb_array_length(p_cards)<>2*p_round_number+1 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_cards) c WHERE
       coalesce(c->>'rank','') NOT IN ('2','3','4','5','6','7','8','9','10','J','Q','K','A')
       OR coalesce(c->>'suit','') NOT IN ('spades','hearts','diamonds','clubs','♠','♥','♦','♣'))
  THEN RETURN NULL; END IF;
  IF NOT coalesce(p_use_hand_strength,true) THEN
    RETURN least(100,greatest(0,coalesce(p_fixed_probability,30)));
  END IF;

  v_label:=private.three_five_seven_score_hand(p_cards,p_round_number)->>'label';
  v_wild:=CASE p_round_number WHEN 1 THEN '3' WHEN 2 THEN '5' ELSE '7' END;
  SELECT count(*) INTO v_wilds FROM jsonb_array_elements(p_cards) c WHERE c->>'rank'=v_wild;
  -- Preserve the established policy's natural-rank/wild-card thresholds.
  SELECT private.three_five_seven_rank_value(c->>'rank'),count(*)
    INTO v_rank,v_count FROM jsonb_array_elements(p_cards) c WHERE c->>'rank'<>v_wild
    GROUP BY c->>'rank'
    ORDER BY count(*) DESC,private.three_five_seven_rank_value(c->>'rank') DESC LIMIT 1;
  IF coalesce(v_count,0)+v_wilds < (CASE WHEN p_round_number=1 THEN 2 ELSE 3 END) THEN v_rank:=0; END IF;
  IF p_round_number=1 THEN
    v_base:=CASE v_label WHEN 'Three of a Kind' THEN 0
      WHEN 'Pair' THEN CASE WHEN v_rank>=12 THEN 5 WHEN v_rank>=8 THEN 15 ELSE 25 END
      WHEN 'High Card' THEN 55 ELSE NULL END;
  ELSIF p_round_number=2 THEN
    v_base:=CASE
      WHEN v_label IN ('Flush','Full House','Four of a Kind','Straight Flush','Five of a Kind') THEN 0
      WHEN v_label='Straight' THEN 10
      WHEN v_label='Three of a Kind' THEN CASE WHEN v_rank>=12 THEN 10 ELSE 30 END
      WHEN v_label='Two Pair' THEN 45
      WHEN v_label IN ('Pair','High Card') THEN 60 ELSE NULL END;
  ELSE
    v_base:=CASE
      WHEN v_label IN ('Full House','Four of a Kind','Straight Flush','Five of a Kind') THEN 0
      WHEN v_label IN ('Straight','Flush') THEN 10
      WHEN v_label='Three of a Kind' THEN CASE WHEN v_rank>=12 THEN 30 ELSE 45 END
      WHEN v_label IN ('Two Pair','Pair','High Card') THEN 65 ELSE NULL END;
  END IF;
  IF v_base IS NULL THEN RETURN NULL; END IF;
  v_multiplier:=CASE p_aggression WHEN 'very_conservative' THEN 1.6
    WHEN 'conservative' THEN 1.3 WHEN 'aggressive' THEN 0.7
    WHEN 'very_aggressive' THEN 0.4 ELSE 1 END;
  RETURN least(100,greatest(0,v_base*v_multiplier));
END;
$policy$;
REVOKE ALL ON FUNCTION private.three_five_seven_bot_fold_probability(jsonb,integer,text,boolean,numeric)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.three_five_seven_bot_fold_probability(jsonb,integer,text,boolean,numeric)
  TO service_role;

-- Preserve the deployed recovery owner and all lifecycle/settlement guards.
CREATE OR REPLACE FUNCTION private.three_five_seven_recover_game(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_game public.games%ROWTYPE; v_round public.rounds%ROWTYPE; v_resolution private.three_five_seven_round_resolutions%ROWTYPE;
  v_eligible integer; v_ready integer; v_fold_probability integer:=30; v_use_hand_strength boolean:=true; v_result jsonb;
BEGIN
  PERFORM set_config('app.three_five_seven_recovery','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN
    RETURN jsonb_build_object('outcome','not_357');
  END IF;
  IF coalesce(v_game.is_paused,false) THEN RETURN jsonb_build_object('outcome','paused'); END IF;

  IF private.pause_all_humans_auto_fold(p_game_id) THEN RETURN jsonb_build_object('outcome','paused'); END IF;

  IF v_game.status='ante_decision' THEN
    SELECT count(*),count(*) FILTER(WHERE player.ante_decision='ante_up') INTO v_eligible,v_ready
      FROM public.players player WHERE player.game_id=p_game_id AND player.status NOT IN ('left','observer')
       AND NOT coalesce(player.sitting_out,false);
    IF v_eligible>=2 AND v_ready=v_eligible THEN RETURN public.three_five_seven_begin_game(p_game_id); END IF;
    RETURN jsonb_build_object('outcome','awaiting_antes');
  END IF;

  IF v_game.status='in_progress' AND v_game.current_game_uuid IS NOT NULL
     AND v_game.total_hands IS NOT NULL AND v_game.current_round IS NOT NULL THEN
    SELECT * INTO v_round FROM public.rounds
     WHERE game_id=p_game_id AND dealer_game_id=v_game.current_game_uuid
       AND hand_number=v_game.total_hands AND round_number=v_game.current_round FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'three_five_seven_recover_game:current_round_missing'; END IF;
    IF v_round.status='betting' THEN
      SELECT coalesce(defaults.bot_use_hand_strength,true),coalesce(defaults.bot_fold_probability,30)
        INTO v_use_hand_strength,v_fold_probability
        FROM public.game_defaults defaults WHERE defaults.game_type='3-5-7' LIMIT 1;
      WITH candidates AS MATERIALIZED (
        SELECT player.id,private.three_five_seven_bot_fold_probability(
          cards.cards,v_round.round_number,profile.aggression_level,
          v_use_hand_strength,v_fold_probability
        ) AS fold_probability
        FROM public.players player
        JOIN public.player_cards cards ON cards.player_id=player.id AND cards.round_id=v_round.id
        LEFT JOIN public.profiles profile ON profile.id=player.user_id
        WHERE player.game_id=p_game_id AND coalesce(player.is_bot,false)
          AND player.status NOT IN ('left','observer') AND NOT coalesce(player.sitting_out,false)
          AND NOT coalesce(player.decision_locked,false)
      )
      UPDATE public.players player
         SET current_decision=CASE WHEN private.secure_random_unit()*100<candidate.fold_probability
                                   THEN 'fold' ELSE 'stay' END,
             decision_locked=true
        FROM candidates candidate
       WHERE player.id=candidate.id AND candidate.fold_probability IS NOT NULL
         AND NOT coalesce(player.decision_locked,false);
      IF v_round.decision_deadline<=clock_timestamp() THEN
        RETURN public.three_five_seven_expire_round(p_game_id,v_round.id,v_round.dealer_game_id,v_round.hand_number,v_round.round_number);
      END IF;
      SELECT count(*) FILTER(WHERE NOT coalesce(player.decision_locked,false)) INTO v_ready
        FROM public.players player WHERE player.game_id=p_game_id AND player.status NOT IN ('left','observer')
         AND NOT coalesce(player.sitting_out,false);
      IF v_ready=0 THEN RETURN private.three_five_seven_resolve_round(p_game_id,v_round.id,v_round.dealer_game_id,v_round.hand_number,v_round.round_number); END IF;
      RETURN jsonb_build_object('outcome','awaiting_decisions');
    END IF;
    SELECT * INTO v_resolution FROM private.three_five_seven_round_resolutions resolution
     WHERE resolution.game_id=p_game_id AND resolution.dealer_game_id=v_round.dealer_game_id
       AND resolution.round_id=v_round.id AND resolution.hand_number=v_round.hand_number
       AND resolution.round_number=v_round.round_number;
    IF coalesce(v_game.awaiting_next_round,false) AND FOUND
       AND v_resolution.presentation_fallback_at<=clock_timestamp() THEN
      RETURN public.three_five_seven_advance_round(p_game_id,v_round.id,v_round.dealer_game_id,v_round.hand_number,v_round.round_number);
    END IF;
  END IF;

  IF v_game.status IN ('game_over','session_ended') AND v_game.current_game_uuid IS NOT NULL THEN
    SELECT resolution.* INTO v_resolution FROM private.three_five_seven_round_resolutions resolution
     WHERE resolution.game_id=p_game_id AND resolution.dealer_game_id=v_game.current_game_uuid
       AND resolution.hand_number=v_game.total_hands AND resolution.outcome IN ('terminal','instant_sweep')
     ORDER BY resolution.created_at DESC LIMIT 1;
    IF FOUND AND v_resolution.presentation_fallback_at<=clock_timestamp() THEN
      RETURN public.three_five_seven_advance_postgame(
        p_game_id,v_resolution.round_id,v_resolution.dealer_game_id,v_resolution.hand_number
      );
    END IF;
  END IF;
  RETURN jsonb_build_object('outcome','nothing_due');
END;
$function$;

COMMIT;
