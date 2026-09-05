-- The public row is a redacted transport projection. Full cards never enter
-- public WAL, including on INSERT. The deferred FK permits its BEFORE trigger
-- to capture private cards before publishing the parent row.
CREATE TABLE IF NOT EXISTS private.holm_round_cards (
 round_id uuid PRIMARY KEY REFERENCES public.rounds(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
 community_cards jsonb NOT NULL CHECK(jsonb_typeof(community_cards)='array'),
 chucky_cards jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(chucky_cards)='array')
);
ALTER TABLE private.holm_round_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.holm_round_cards FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON private.holm_round_cards TO service_role;

CREATE OR REPLACE FUNCTION private.holm_public_cards(p_cards jsonb,p_revealed integer)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT coalesce(jsonb_agg(CASE WHEN ord<=greatest(coalesce(p_revealed,0),0)
   THEN card ELSE jsonb_build_object('rank','?','suit','?','masked',true) END ORDER BY ord),'[]'::jsonb)
 FROM jsonb_array_elements(coalesce(p_cards,'[]'::jsonb)) WITH ORDINALITY AS c(card,ord);
$fn$;
REVOKE ALL ON FUNCTION private.holm_public_cards(jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.holm_public_cards(jsonb,integer) TO service_role;

-- Preserve exact existing cards before redacting public projections.
INSERT INTO private.holm_round_cards(round_id,community_cards,chucky_cards)
SELECT r.id,coalesce(r.community_cards,'[]'::jsonb),coalesce(r.chucky_cards,'[]'::jsonb)
FROM public.rounds r LEFT JOIN public.dealer_games d ON d.id=r.dealer_game_id
JOIN public.games g ON g.id=r.game_id
WHERE d.game_type IN ('holm','holm-game')
 OR (r.dealer_game_id IS NULL AND g.game_type IN ('holm','holm-game'))
ON CONFLICT(round_id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.holm_project_round_cards()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE v_round public.rounds; v_holm boolean; v_cards private.holm_round_cards;
BEGIN
 v_round:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 SELECT EXISTS(SELECT 1 FROM public.dealer_games d WHERE d.id=v_round.dealer_game_id AND d.game_type IN ('holm','holm-game'))
   OR (v_round.dealer_game_id IS NULL AND EXISTS(SELECT 1 FROM public.games g WHERE g.id=v_round.game_id AND g.game_type IN ('holm','holm-game')))
 INTO v_holm;
 IF TG_OP='UPDATE' AND NOT v_holm THEN
   SELECT EXISTS(SELECT 1 FROM public.dealer_games d WHERE d.id=OLD.dealer_game_id AND d.game_type IN ('holm','holm-game'))
     OR (OLD.dealer_game_id IS NULL AND EXISTS(SELECT 1 FROM public.games g WHERE g.id=OLD.game_id AND g.game_type IN ('holm','holm-game')))
   INTO v_holm;
 END IF;
 -- Check the invoking database role before any private-table access. Existing
 -- SECURITY DEFINER owners execute as postgres; Data API writes do not.
 IF current_user IN ('anon','authenticated') THEN
   IF v_holm THEN RAISE EXCEPTION 'holm_round:rpc_required' USING ERRCODE='42501'; END IF;
   -- Retyping a session cannot turn a browser card/reveal write into authority.
   IF TG_OP='UPDATE' AND ROW(NEW.community_cards,NEW.chucky_cards,NEW.community_cards_revealed,NEW.chucky_cards_revealed)
      IS DISTINCT FROM ROW(OLD.community_cards,OLD.chucky_cards,OLD.community_cards_revealed,OLD.chucky_cards_revealed) THEN
     RAISE EXCEPTION 'holm_cards:rpc_required' USING ERRCODE='42501';
   END IF;
 END IF;
 IF NOT v_holm OR TG_OP='DELETE' THEN RETURN v_round; END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.game_id,NEW.dealer_game_id,NEW.hand_number)
    IS DISTINCT FROM ROW(OLD.id,OLD.game_id,OLD.dealer_game_id,OLD.hand_number) THEN
   RAISE EXCEPTION 'holm_cards:immutable_round_identity';
 END IF;
 IF TG_OP='INSERT' THEN
   INSERT INTO private.holm_round_cards(round_id,community_cards,chucky_cards)
   VALUES(NEW.id,coalesce(NEW.community_cards,'[]'::jsonb),coalesce(NEW.chucky_cards,'[]'::jsonb));
 END IF;
 SELECT * INTO v_cards FROM private.holm_round_cards WHERE round_id=NEW.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'holm_cards:authoritative_state_missing'; END IF;
 IF TG_OP='UPDATE' THEN
   IF NEW.community_cards IS DISTINCT FROM OLD.community_cards
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(NEW.community_cards,'[]'::jsonb)) c WHERE coalesce((c->>'masked')::boolean,false))
      AND coalesce(NEW.community_cards,'[]'::jsonb) IS DISTINCT FROM v_cards.community_cards THEN
     RAISE EXCEPTION 'holm_cards:community_already_committed';
   END IF;
   IF NEW.chucky_cards IS DISTINCT FROM OLD.chucky_cards
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(NEW.chucky_cards,'[]'::jsonb)) c WHERE coalesce((c->>'masked')::boolean,false))
      AND coalesce(NEW.chucky_cards,'[]'::jsonb) IS DISTINCT FROM v_cards.chucky_cards THEN
     IF jsonb_array_length(v_cards.chucky_cards)>0 THEN RAISE EXCEPTION 'holm_cards:chucky_already_committed'; END IF;
     UPDATE private.holm_round_cards SET chucky_cards=coalesce(NEW.chucky_cards,'[]'::jsonb) WHERE round_id=NEW.id
     RETURNING * INTO v_cards;
   END IF;
 END IF;
 NEW.community_cards:=private.holm_public_cards(v_cards.community_cards,NEW.community_cards_revealed);
 NEW.chucky_cards:=private.holm_public_cards(v_cards.chucky_cards,NEW.chucky_cards_revealed);
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.holm_project_round_cards() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS holm_project_round_cards ON public.rounds;
CREATE TRIGGER holm_project_round_cards BEFORE INSERT OR UPDATE OR DELETE ON public.rounds
FOR EACH ROW EXECUTE FUNCTION private.holm_project_round_cards();

DO $redact$
DECLARE
 c text:=coalesce(current_setting('app.cribbage_authoritative_write',true),'');
 g text:=coalesce(current_setting('app.gin_rummy_authoritative_write',true),'');
 t text:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
BEGIN
 -- Old Holm hands may belong to a session now playing another game.
 -- Only the public card projection is rewritten; no timer/state columns change.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.rounds r
SET community_cards=private.holm_public_cards(c.community_cards,r.community_cards_revealed),
 chucky_cards=private.holm_public_cards(c.chucky_cards,r.chucky_cards_revealed)
FROM private.holm_round_cards c WHERE r.id=c.round_id AND (
 r.community_cards IS DISTINCT FROM private.holm_public_cards(c.community_cards,r.community_cards_revealed)
 OR r.chucky_cards IS DISTINCT FROM private.holm_public_cards(c.chucky_cards,r.chucky_cards_revealed));
 PERFORM set_config('app.cribbage_authoritative_write',c,true);
 PERFORM set_config('app.gin_rummy_authoritative_write',g,true);
 PERFORM set_config('app.three_five_seven_authoritative_write',t,true);
END;
$redact$;

CREATE OR REPLACE FUNCTION private.holm_guard_player_cards()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE v_round_id uuid; v_old_round_id uuid;
BEGIN
 v_round_id:=CASE WHEN TG_OP='DELETE' THEN OLD.round_id ELSE NEW.round_id END;
 IF TG_OP='UPDATE' THEN v_old_round_id:=OLD.round_id; END IF;
 IF current_user IN ('anon','authenticated') AND EXISTS(
   SELECT 1 FROM public.rounds r LEFT JOIN public.dealer_games d ON d.id=r.dealer_game_id
   JOIN public.games g ON g.id=r.game_id
   WHERE r.id IN (v_round_id,v_old_round_id)
     AND (d.game_type IN ('holm','holm-game') OR (r.dealer_game_id IS NULL AND g.game_type IN ('holm','holm-game')))
 ) THEN RAISE EXCEPTION 'holm_player_cards:rpc_required' USING ERRCODE='42501'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$fn$;
REVOKE ALL ON FUNCTION private.holm_guard_player_cards() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS holm_guard_player_cards ON public.player_cards;
CREATE TRIGGER holm_guard_player_cards BEFORE INSERT OR UPDATE OR DELETE ON public.player_cards
FOR EACH ROW EXECUTE FUNCTION private.holm_guard_player_cards();

CREATE OR REPLACE FUNCTION private.holm_authoritative_round(p_round public.rounds)
RETURNS public.rounds LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_round public.rounds:=p_round; v_cards private.holm_round_cards;
BEGIN
 SELECT * INTO v_cards FROM private.holm_round_cards WHERE round_id=p_round.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'holm_cards:authoritative_state_missing'; END IF;
 v_round.community_cards:=v_cards.community_cards;
 v_round.chucky_cards:=v_cards.chucky_cards;
 RETURN v_round;
END;
$fn$;
REVOKE ALL ON FUNCTION private.holm_authoritative_round(public.rounds) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.holm_submit_decision_core(p_game_id uuid, p_player_id uuid, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_round public.rounds%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_stayer public.players%ROWTYPE;
  v_active_count integer;
  v_stayer_count integer;
  v_all_decided boolean;
  v_tax integer;
  v_round_pot integer;
  v_pot_final integer;
  v_pot_match integer;
  v_deltas jsonb;
  v_player_cards jsonb;
  v_community_cards jsonb;
  v_chucky_cards jsonb;
  v_player_value integer[];
  v_chucky_value integer[];
  v_forced_harness text;
  v_harnesses_mode_enabled boolean := false;
  v_player_wins boolean;
  v_username text;
  v_settlement jsonb;
BEGIN
  IF p_decision NOT IN ('stay', 'fold') THEN
    RAISE EXCEPTION 'holm_submit_decision:invalid_decision';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'holm_submit_decision:authentication_required';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('holm', 'holm-game') THEN
    RAISE EXCEPTION 'holm_submit_decision:not_holm_game';
  END IF;

  IF v_game.status IN ('game_over', 'session_ended') THEN
    RETURN jsonb_build_object('already_terminal', true, 'status', v_game.status);
  END IF;

  SELECT * INTO v_round
  FROM public.rounds
  WHERE game_id = p_game_id
    AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
  ORDER BY hand_number DESC NULLS LAST, round_number DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_round.status <> 'betting' THEN
    RETURN jsonb_build_object('round_not_betting', true, 'round_status', v_round.status);
  END IF;

  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND OR v_player.game_id <> p_game_id THEN
    RAISE EXCEPTION 'holm_submit_decision:player_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.players participant
    WHERE participant.game_id = p_game_id
      AND participant.user_id = auth.uid()
      AND participant.status = 'active'
  ) THEN
    RAISE EXCEPTION 'holm_submit_decision:not_participant';
  END IF;

  IF v_player.user_id IS DISTINCT FROM auth.uid() AND NOT coalesce(v_player.is_bot, false) THEN
    RAISE EXCEPTION 'holm_submit_decision:not_player_owner';
  END IF;

  IF v_player.decision_locked THEN
    RETURN jsonb_build_object(
      'already_locked', true,
      'all_decisions_in', v_game.all_decisions_in,
      'status', v_game.status
    );
  END IF;

  UPDATE public.players
  SET current_decision = p_decision,
      decision_locked = true
  WHERE id = p_player_id
    AND decision_locked = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('already_locked', true);
  END IF;

  PERFORM 1
  FROM public.players
  WHERE game_id = p_game_id
    AND status = 'active'
    AND sitting_out = false
  FOR UPDATE;

  SELECT count(*), bool_and(decision_locked AND current_decision IN ('stay', 'fold'))
  INTO v_active_count, v_all_decided
  FROM public.players
  WHERE game_id = p_game_id
    AND status = 'active'
    AND sitting_out = false;

  IF v_active_count = 0 OR NOT coalesce(v_all_decided, false) THEN
    RETURN jsonb_build_object('decision_locked', true, 'all_decisions_in', false);
  END IF;

  UPDATE public.games
  SET all_decisions_in = true,
      all_decisions_in_round_id = v_round.id
  WHERE id = p_game_id;

  UPDATE public.rounds
  SET current_turn_position = null,
      decision_deadline = null
  WHERE id = v_round.id;

  SELECT count(*) INTO v_stayer_count
  FROM public.players
  WHERE game_id = p_game_id
    AND status = 'active'
    AND sitting_out = false
    AND current_decision = 'stay';

  IF v_stayer_count > 1 THEN
    RETURN jsonb_build_object(
      'decision_locked', true,
      'all_decisions_in', true,
      'server_resolved', false,
      'resolution_owner', 'existing_showdown'
    );
  END IF;

  IF v_stayer_count = 0 THEN
    v_tax := CASE WHEN coalesce(v_game.pussy_tax_enabled, true)
      THEN coalesce(v_game.pussy_tax_value, 1)
      ELSE 0
    END;
    v_pot_final := coalesce(v_game.pot, 0) + (v_tax * v_active_count);

    SELECT coalesce(jsonb_object_agg(id::text, to_jsonb(-v_tax)), '{}'::jsonb)
    INTO v_deltas
    FROM public.players
    WHERE game_id = p_game_id
      AND status = 'active'
      AND sitting_out = false;

    SELECT public.holm_settle_hand(
      p_game_id, v_round.dealer_game_id, v_round.hand_number,
      'pussy_tax_carryforward'::public.holm_event_kind, v_pot_final, true,
      CASE WHEN v_tax > 0 THEN 'Pussy Tax!' ELSE 'Everyone folded! No penalty.' END,
      v_deltas, 'Everyone folded', NULL, 'Pussy Tax', false, 0, true,
      v_pot_final, false, false
    ) INTO v_settlement;

    RETURN jsonb_build_object(
      'decision_locked', true,
      'all_decisions_in', true,
      'server_resolved', true,
      'event_kind', 'pussy_tax_carryforward',
      'terminal_disposition', v_settlement->>'terminal_disposition'
    );
  END IF;

  SELECT * INTO v_stayer
  FROM public.players
  WHERE game_id = p_game_id
    AND status = 'active'
    AND sitting_out = false
    AND current_decision = 'stay';

  SELECT cards INTO v_player_cards
  FROM public.player_cards
  WHERE round_id = v_round.id
    AND player_id = v_stayer.id
  ORDER BY id
  LIMIT 1;

  v_round := private.holm_authoritative_round(v_round);
  v_community_cards := coalesce(v_round.community_cards, '[]'::jsonb);
  IF jsonb_array_length(coalesce(v_player_cards, '[]'::jsonb)) <> 4
    OR jsonb_array_length(v_community_cards) <> 4 THEN
    RAISE EXCEPTION 'holm_submit_decision:incomplete_showdown_cards';
  END IF;

  v_chucky_cards := coalesce(nullif(v_round.chucky_cards, '[]'::jsonb),
    public.holm_deterministic_chucky_cards(
      v_round.id,
      v_player_cards || v_community_cards,
      coalesce(v_game.chucky_cards, 4)
    )
  );

  IF jsonb_array_length(v_chucky_cards) <> coalesce(v_game.chucky_cards, 4) THEN
    RAISE EXCEPTION 'holm_submit_decision:unable_to_deal_chucky';
  END IF;

  SELECT debug_harness INTO v_forced_harness
  FROM public.game_defaults
  WHERE game_type = 'holm'
  LIMIT 1;

  SELECT COALESCE((value ->> 'enabled')::boolean, false)
  INTO v_harnesses_mode_enabled
  FROM public.system_settings
  WHERE key = 'harnesses_mode'
  LIMIT 1;
  v_harnesses_mode_enabled := COALESCE(v_harnesses_mode_enabled, false);

  v_player_value := public.holm_best_hand_value(v_player_cards || v_community_cards);
  v_chucky_value := public.holm_best_hand_value(v_chucky_cards || v_community_cards);
  v_player_wins := CASE
    WHEN v_harnesses_mode_enabled
      AND v_forced_harness = 'force_player_beats_chucky' THEN true
    WHEN v_harnesses_mode_enabled
      AND v_forced_harness = 'force_chucky_beats_player' THEN false
    ELSE v_player_value > v_chucky_value
  END;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_stayer.user_id;
  v_username := coalesce(v_username, v_stayer.user_id::text, 'Player');
  v_round_pot := coalesce(v_round.pot, v_game.pot, 0);

  UPDATE public.rounds
  SET community_cards_revealed = greatest(coalesce(community_cards_revealed, 0), 4),
      chucky_cards = v_chucky_cards,
      chucky_cards_revealed = jsonb_array_length(v_chucky_cards),
      chucky_active = true
  WHERE id = v_round.id;

  IF v_player_wins THEN
    SELECT public.holm_settle_hand(
      p_game_id, v_round.dealer_game_id, v_round.hand_number,
      'chucky_final_award'::public.holm_event_kind, 0, false,
      format('%s beat Chucky with %s!|||POT:%s', v_username, public.holm_hand_label(v_player_value), v_round_pot),
      jsonb_build_object(v_stayer.id::text, v_round_pot), public.holm_hand_label(v_player_value),
      v_stayer.id, v_username, false, v_round_pot, true, v_round_pot, false, false
    ) INTO v_settlement;
  ELSE
    v_pot_match := CASE WHEN coalesce(v_game.pot_max_enabled, true)
      THEN least(v_round_pot, coalesce(v_game.pot_max_value, v_round_pot))
      ELSE v_round_pot
    END;

    SELECT public.holm_settle_hand(
      p_game_id, v_round.dealer_game_id, v_round.hand_number,
      CASE WHEN v_player_value = v_chucky_value
        THEN 'chucky_tiebreak_pot_match'::public.holm_event_kind
        ELSE 'chucky_loss_pot_match'::public.holm_event_kind
      END,
      v_round_pot + v_pot_match, true,
      format('Chucky beat %s with %s. -$%s', v_username, public.holm_hand_label(v_chucky_value), v_pot_match),
      jsonb_build_object(v_stayer.id::text, -v_pot_match),
      CASE WHEN v_player_value = v_chucky_value THEN 'Tie - player matches pot' ELSE 'Chucky beat player' END,
      NULL, 'Chucky Win', false, 0, true, v_round_pot + v_pot_match, false, false
    ) INTO v_settlement;
  END IF;

  RETURN jsonb_build_object(
    'decision_locked', true,
    'all_decisions_in', true,
    'server_resolved', true,
    'event_kind', CASE WHEN v_player_wins THEN 'chucky_final_award' ELSE 'chucky_loss_pot_match' END,
    'terminal_disposition', v_settlement->>'terminal_disposition',
    'round_id', v_round.id,
    'dealer_game_id', v_round.dealer_game_id,
    'hand_number', v_round.hand_number
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_holm_showdown(p_game_id uuid, p_expected_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_game public.games%ROWTYPE; v_round public.rounds%ROWTYPE;
  v_actor_id uuid := auth.uid(); v_is_service_role boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_active_count integer; v_decided_count integer; v_stayer_count integer; v_round_pot integer; v_pot_match integer; v_new_pot integer;
  v_player record; v_value integer[]; v_max_value integer[] := NULL; v_chucky_value integer[];
  v_first_label text := NULL; v_chucky_label text;
  v_winner_ids uuid[] := ARRAY[]::uuid[]; v_winner_names text[] := ARRAY[]::text[]; v_loser_ids uuid[] := ARRAY[]::uuid[];
  v_chucky_winner_ids uuid[] := ARRAY[]::uuid[]; v_chucky_winner_names text[] := ARRAY[]::text[]; v_chucky_loser_ids uuid[] := ARRAY[]::uuid[];
  v_all_user_ids uuid[]; v_used_cards jsonb; v_chucky_cards jsonb; v_all_tied_with_chucky boolean := true;
  v_deltas jsonb := '{}'::jsonb; v_settlement jsonb; v_successor_id uuid;
BEGIN
  IF v_actor_id IS NULL AND NOT v_is_service_role THEN RAISE EXCEPTION 'resolve_holm_showdown:authentication_required'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('holm', 'holm-game') THEN RAISE EXCEPTION 'resolve_holm_showdown:not_holm_game'; END IF;
  IF NOT v_is_service_role AND NOT EXISTS (SELECT 1 FROM public.players participant WHERE participant.game_id=p_game_id AND participant.user_id=v_actor_id AND participant.status NOT IN ('observer','left')) AND NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id=v_actor_id AND coalesce(profile.is_superuser,false)) THEN RAISE EXCEPTION 'resolve_holm_showdown:not_participant'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=p_expected_round_id AND game_id=p_game_id AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','rejected','reason','stale-round'); END IF;
  IF v_round.status='completed' THEN
    SELECT id INTO v_successor_id FROM public.rounds WHERE holm_predecessor_round_id=v_round.id;
    RETURN jsonb_build_object('outcome','already-resolved','round_id',v_round.id,'successor_round_id',v_successor_id,'deduped',true);
  END IF;
  IF v_game.status IN ('game_over','session_ended') THEN RETURN jsonb_build_object('outcome','rejected','reason','terminal-state','status',v_game.status); END IF;
  IF coalesce(v_game.is_paused,false) THEN RETURN jsonb_build_object('outcome','rejected','reason','game-paused'); END IF;
  IF v_round.status NOT IN ('betting','processing','showdown') THEN RETURN jsonb_build_object('outcome','rejected','reason','invalid-round-status','status',v_round.status); END IF;
  PERFORM 1 FROM public.players participant WHERE participant.game_id=p_game_id AND participant.status='active' AND participant.sitting_out=false ORDER BY participant.id FOR UPDATE;
  SELECT count(*),count(*) FILTER (WHERE decision_locked AND current_decision IN ('stay','fold')),count(*) FILTER (WHERE current_decision='stay'),array_agg(user_id ORDER BY id) FILTER (WHERE user_id IS NOT NULL) INTO v_active_count,v_decided_count,v_stayer_count,v_all_user_ids FROM public.players WHERE game_id=p_game_id AND status='active' AND sitting_out=false;
  IF coalesce(v_active_count,0)=0 OR v_decided_count<>v_active_count THEN RETURN jsonb_build_object('outcome','rejected','reason','decisions-pending'); END IF;
  IF v_stayer_count<2 THEN RETURN jsonb_build_object('outcome','rejected','reason','not-multiplayer-showdown'); END IF;
  v_round := private.holm_authoritative_round(v_round);
  IF jsonb_array_length(coalesce(v_round.community_cards,'[]'::jsonb))<>4 OR EXISTS (SELECT 1 FROM public.player_cards card JOIN public.players participant ON participant.id=card.player_id WHERE card.round_id=v_round.id AND participant.game_id=p_game_id AND participant.status='active' AND participant.sitting_out=false AND participant.current_decision='stay' AND jsonb_array_length(coalesce(card.cards,'[]'::jsonb))<>4) OR (SELECT count(*) FROM public.player_cards card JOIN public.players participant ON participant.id=card.player_id WHERE card.round_id=v_round.id AND participant.game_id=p_game_id AND participant.status='active' AND participant.sitting_out=false AND participant.current_decision='stay')<>v_stayer_count THEN RAISE EXCEPTION 'resolve_holm_showdown:incomplete_showdown_cards'; END IF;
  UPDATE public.rounds SET status='showdown',current_turn_position=NULL,decision_deadline=NULL,presentation_fallback_at=NULL,community_cards_revealed=greatest(coalesce(community_cards_revealed,0),4) WHERE id=v_round.id;
  UPDATE public.player_cards SET visible_to_user_ids=v_all_user_ids,is_public=true WHERE round_id=v_round.id AND player_id IN (SELECT id FROM public.players WHERE game_id=p_game_id AND status='active' AND sitting_out=false AND current_decision='stay');
  v_round_pot:=coalesce(v_round.pot,v_game.pot,0);
  FOR v_player IN SELECT participant.id,participant.user_id,coalesce(profile.username,participant.user_id::text,'Player') AS username,card.cards FROM public.players participant JOIN public.player_cards card ON card.player_id=participant.id AND card.round_id=v_round.id LEFT JOIN public.profiles profile ON profile.id=participant.user_id WHERE participant.game_id=p_game_id AND participant.status='active' AND participant.sitting_out=false AND participant.current_decision='stay' ORDER BY participant.id LOOP
    v_value:=public.holm_best_hand_value(v_player.cards||v_round.community_cards);
    IF v_max_value IS NULL OR v_value>v_max_value THEN v_max_value:=v_value; v_first_label:=public.holm_hand_label(v_value); END IF;
  END LOOP;
  FOR v_player IN SELECT participant.id,participant.user_id,coalesce(profile.username,participant.user_id::text,'Player') AS username,card.cards FROM public.players participant JOIN public.player_cards card ON card.player_id=participant.id AND card.round_id=v_round.id LEFT JOIN public.profiles profile ON profile.id=participant.user_id WHERE participant.game_id=p_game_id AND participant.status='active' AND participant.sitting_out=false AND participant.current_decision='stay' ORDER BY participant.id LOOP
    v_value:=public.holm_best_hand_value(v_player.cards||v_round.community_cards);
    IF v_value=v_max_value THEN v_winner_ids:=array_append(v_winner_ids,v_player.id); v_winner_names:=array_append(v_winner_names,v_player.username); ELSE v_loser_ids:=array_append(v_loser_ids,v_player.id); END IF;
  END LOOP;
  IF cardinality(v_loser_ids)>0 THEN
    v_pot_match:=CASE WHEN coalesce(v_game.pot_max_enabled,true) THEN least(v_round_pot,coalesce(v_game.pot_max_value,v_round_pot)) ELSE v_round_pot END; v_new_pot:=cardinality(v_loser_ids)*v_pot_match;
    IF cardinality(v_winner_ids)=1 THEN
      v_deltas:=jsonb_build_object(v_winner_ids[1]::text,v_round_pot); FOREACH v_successor_id IN ARRAY v_loser_ids LOOP v_deltas:=v_deltas||jsonb_build_object(v_successor_id::text,-v_pot_match); END LOOP;
      SELECT public.holm_settle_hand(p_game_id,v_round.dealer_game_id,v_round.hand_number,'showdown_final_award'::public.holm_event_kind,v_new_pot,true,format('%s won with %s|||WINNER:%s|||LOSERS:%s|||POT:%s|||MATCH:%s',v_winner_names[1],v_first_label,v_winner_ids[1],array_to_string(v_loser_ids,','),v_round_pot,v_pot_match),v_deltas,'Won showdown (continues vs Chucky)',v_winner_ids[1],v_winner_names[1],false,v_round_pot,true,v_new_pot,false,false) INTO v_settlement;
    ELSE
      v_deltas:='{}'::jsonb; FOREACH v_successor_id IN ARRAY v_winner_ids LOOP v_deltas:=v_deltas||jsonb_build_object(v_successor_id::text,floor(v_round_pot::numeric/cardinality(v_winner_ids))::integer); END LOOP; FOREACH v_successor_id IN ARRAY v_loser_ids LOOP v_deltas:=v_deltas||jsonb_build_object(v_successor_id::text,-v_pot_match); END LOOP;
      SELECT public.holm_settle_hand(p_game_id,v_round.dealer_game_id,v_round.hand_number,'partial_tie_final_award'::public.holm_event_kind,v_new_pot,true,format('%s tied and split the pot with %s|||WINNERS:%s|||LOSERS:%s|||POT:%s|||MATCH:%s',array_to_string(v_winner_names,' and '),v_first_label,array_to_string(v_winner_ids,','),array_to_string(v_loser_ids,','),v_round_pot,v_pot_match),v_deltas,'Tied and split pot (continues vs Chucky)',NULL,array_to_string(v_winner_names,' and '),true,v_round_pot,true,v_new_pot,false,false) INTO v_settlement;
    END IF;
    RETURN jsonb_build_object('outcome','resolved','event_kind',v_settlement->>'event_kind','round_id',v_round.id,'deduped',false);
  END IF;
  SELECT coalesce(jsonb_agg(card),'[]'::jsonb) INTO v_used_cards FROM (SELECT jsonb_array_elements(card.cards) AS card FROM public.player_cards card WHERE card.round_id=v_round.id UNION ALL SELECT jsonb_array_elements(v_round.community_cards) AS card) used;
  v_chucky_cards:=coalesce(nullif(v_round.chucky_cards,'[]'::jsonb),public.holm_deterministic_chucky_cards(v_round.id,v_used_cards,coalesce(v_game.chucky_cards,4)));
  IF jsonb_array_length(v_chucky_cards)<>coalesce(v_game.chucky_cards,4) THEN RAISE EXCEPTION 'resolve_holm_showdown:unable_to_deal_chucky'; END IF;
  v_chucky_value:=public.holm_best_hand_value(v_chucky_cards||v_round.community_cards); v_chucky_label:=public.holm_hand_label(v_chucky_value);
  UPDATE public.rounds SET chucky_cards=v_chucky_cards,chucky_cards_revealed=jsonb_array_length(v_chucky_cards),chucky_active=true WHERE id=v_round.id;
  FOR v_player IN SELECT participant.id,coalesce(profile.username,participant.user_id::text,'Player') AS username,card.cards FROM public.players participant JOIN public.player_cards card ON card.player_id=participant.id AND card.round_id=v_round.id LEFT JOIN public.profiles profile ON profile.id=participant.user_id WHERE participant.id=ANY(v_winner_ids) ORDER BY participant.id LOOP
    v_value:=public.holm_best_hand_value(v_player.cards||v_round.community_cards);
    IF v_value>v_chucky_value THEN v_chucky_winner_ids:=array_append(v_chucky_winner_ids,v_player.id); v_chucky_winner_names:=array_append(v_chucky_winner_names,v_player.username); IF v_first_label IS NULL THEN v_first_label:=public.holm_hand_label(v_value); END IF; ELSE v_chucky_loser_ids:=array_append(v_chucky_loser_ids,v_player.id); IF v_value IS DISTINCT FROM v_chucky_value THEN v_all_tied_with_chucky:=false; END IF; END IF;
  END LOOP;
  v_pot_match:=CASE WHEN coalesce(v_game.pot_max_enabled,true) THEN least(v_round_pot,coalesce(v_game.pot_max_value,v_round_pot)) ELSE v_round_pot END;
  IF cardinality(v_chucky_winner_ids)>0 THEN
    v_deltas:='{}'::jsonb; FOREACH v_successor_id IN ARRAY v_chucky_winner_ids LOOP v_deltas:=v_deltas||jsonb_build_object(v_successor_id::text,floor(v_round_pot::numeric/cardinality(v_chucky_winner_ids))::integer); END LOOP; FOREACH v_successor_id IN ARRAY v_chucky_loser_ids LOOP v_deltas:=v_deltas||jsonb_build_object(v_successor_id::text,-v_pot_match); END LOOP;
    SELECT public.holm_settle_hand(p_game_id,v_round.dealer_game_id,v_round.hand_number,'chucky_final_award'::public.holm_event_kind,0,false,format('%s beat Chucky!|||POT:%s',array_to_string(v_chucky_winner_names,' and '),v_round_pot),v_deltas,coalesce(v_first_label,'Winning hand'),v_chucky_winner_ids[1],array_to_string(v_chucky_winner_names,' and '),cardinality(v_chucky_winner_ids)>1,v_round_pot,true,v_round_pot,true,true) INTO v_settlement;
  ELSE
    v_new_pot:=v_round_pot+cardinality(v_chucky_loser_ids)*v_pot_match; v_deltas:='{}'::jsonb; FOREACH v_successor_id IN ARRAY v_chucky_loser_ids LOOP v_deltas:=v_deltas||jsonb_build_object(v_successor_id::text,-v_pot_match); END LOOP;
    SELECT public.holm_settle_hand(p_game_id,v_round.dealer_game_id,v_round.hand_number,'chucky_tiebreak_pot_match'::public.holm_event_kind,v_new_pot,true,CASE WHEN v_all_tied_with_chucky THEN format('Ya tie but ya lose! %s lose to Chucky''s %s. $%s added to pot.',array_to_string(v_winner_names,' and '),v_chucky_label,cardinality(v_chucky_loser_ids)*v_pot_match) ELSE format('Tie broken by Chucky! %s lose to Chucky''s %s. $%s added to pot.',array_to_string(v_winner_names,' and '),v_chucky_label,cardinality(v_chucky_loser_ids)*v_pot_match) END,v_deltas,CASE WHEN v_all_tied_with_chucky THEN 'Tie - all match pot' ELSE format('Chucky beat tied players with %s',v_chucky_label) END,NULL,'Chucky Win (Tie Breaker)',false,0,true,v_new_pot,true,false) INTO v_settlement;
  END IF;
  RETURN jsonb_build_object('outcome','resolved','event_kind',v_settlement->>'event_kind','round_id',v_round.id,'deduped',false);
END; $function$;

NOTIFY pgrst,'reload schema';
