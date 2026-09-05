-- Legal game commands own monetary state, including signed player scores.
CREATE FUNCTION private.guard_browser_player_finances()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN ('anon','authenticated') THEN
  IF (TG_OP='INSERT' AND (NEW.chips<>0 OR NEW.legs<>0 OR NEW.chip_transfer_cursor IS NOT NULL))
     OR (TG_OP='UPDATE' AND (OLD.chips IS DISTINCT FROM NEW.chips OR OLD.legs IS DISTINCT FROM NEW.legs
       OR OLD.chip_transfer_cursor IS DISTINCT FROM NEW.chip_transfer_cursor)) THEN
   RAISE EXCEPTION 'player_finances:authoritative_command_required' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_browser_player_finances BEFORE INSERT OR UPDATE ON public.players
FOR EACH ROW EXECUTE FUNCTION private.guard_browser_player_finances();
CREATE FUNCTION private.guard_browser_game_finances()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN ('anon','authenticated') THEN
  IF (TG_OP='INSERT' AND (coalesce(NEW.pot,0)<>0 OR NEW.chip_transfer_cursor IS NOT NULL))
     OR (TG_OP='UPDATE' AND (OLD.pot IS DISTINCT FROM NEW.pot
       OR OLD.chip_transfer_cursor IS DISTINCT FROM NEW.chip_transfer_cursor)) THEN
   RAISE EXCEPTION 'game_finances:authoritative_command_required' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_browser_game_finances BEFORE INSERT OR UPDATE ON public.games
FOR EACH ROW EXECUTE FUNCTION private.guard_browser_game_finances();
REVOKE ALL ON FUNCTION public.increment_player_chips(uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.decrement_player_chips(uuid[],integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.settle_gameplay_chip_transfers(uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.game_results FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.split_whole_chips_clockwise(p_game_id uuid,p_winner_ids uuid[],p_pot integer,p_dealer_position integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE count_winners integer:=cardinality(p_winner_ids); valid_winners integer; result jsonb;
BEGIN
 IF p_pot IS NULL OR p_pot<0 OR coalesce(count_winners,0)=0 OR p_dealer_position IS NULL THEN
  RAISE EXCEPTION 'split_whole_chips_clockwise:invalid_input';
 END IF;
 SELECT count(*) INTO valid_winners FROM public.players
 WHERE game_id=p_game_id AND id=ANY(p_winner_ids) AND position IS NOT NULL;
 IF valid_winners<>count_winners THEN RAISE EXCEPTION 'split_whole_chips_clockwise:invalid_winners'; END IF;
 -- Canonical seatRing.nextClockwise: nearest LOWER occupied seat, wrapping.
 -- The dealer is last if also a winner; input array order is irrelevant.
 SELECT jsonb_object_agg(id::text,p_pot/count_winners + CASE WHEN ordinal<=p_pot%count_winners THEN 1 ELSE 0 END)
 INTO result FROM (
  SELECT id,row_number() OVER (ORDER BY CASE WHEN position<p_dealer_position THEN 0 ELSE 1 END,position DESC,id) ordinal
  FROM public.players WHERE game_id=p_game_id AND id=ANY(p_winner_ids)
 ) winners;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION private.split_whole_chips_clockwise(uuid,uuid[],integer,integer) FROM PUBLIC,anon,authenticated;

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
      v_deltas:=private.split_whole_chips_clockwise(p_game_id,v_winner_ids,v_round_pot,v_game.dealer_position); FOREACH v_successor_id IN ARRAY v_loser_ids LOOP v_deltas:=v_deltas||jsonb_build_object(v_successor_id::text,-v_pot_match); END LOOP;
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
    v_deltas:=private.split_whole_chips_clockwise(p_game_id,v_chucky_winner_ids,v_round_pot,v_game.dealer_position); FOREACH v_successor_id IN ARRAY v_chucky_loser_ids LOOP v_deltas:=v_deltas||jsonb_build_object(v_successor_id::text,-v_pot_match); END LOOP;
    SELECT public.holm_settle_hand(p_game_id,v_round.dealer_game_id,v_round.hand_number,'chucky_final_award'::public.holm_event_kind,0,false,format('%s beat Chucky!|||POT:%s',array_to_string(v_chucky_winner_names,' and '),v_round_pot),v_deltas,coalesce(v_first_label,'Winning hand'),v_chucky_winner_ids[1],array_to_string(v_chucky_winner_names,' and '),cardinality(v_chucky_winner_ids)>1,v_round_pot,true,v_round_pot,true,true) INTO v_settlement;
  ELSE
    v_new_pot:=v_round_pot+cardinality(v_chucky_loser_ids)*v_pot_match; v_deltas:='{}'::jsonb; FOREACH v_successor_id IN ARRAY v_chucky_loser_ids LOOP v_deltas:=v_deltas||jsonb_build_object(v_successor_id::text,-v_pot_match); END LOOP;
    SELECT public.holm_settle_hand(p_game_id,v_round.dealer_game_id,v_round.hand_number,'chucky_tiebreak_pot_match'::public.holm_event_kind,v_new_pot,true,CASE WHEN v_all_tied_with_chucky THEN format('Ya tie but ya lose! %s lose to Chucky''s %s. $%s added to pot.',array_to_string(v_winner_names,' and '),v_chucky_label,cardinality(v_chucky_loser_ids)*v_pot_match) ELSE format('Tie broken by Chucky! %s lose to Chucky''s %s. $%s added to pot.',array_to_string(v_winner_names,' and '),v_chucky_label,cardinality(v_chucky_loser_ids)*v_pot_match) END,v_deltas,CASE WHEN v_all_tied_with_chucky THEN 'Tie - all match pot' ELSE format('Chucky beat tied players with %s',v_chucky_label) END,NULL,'Chucky Win (Tie Breaker)',false,0,true,v_new_pot,true,false) INTO v_settlement;
  END IF;
  RETURN jsonb_build_object('outcome','resolved','event_kind',v_settlement->>'event_kind','round_id',v_round.id,'deduped',false);
END; $function$;
NOTIFY pgrst,'reload schema';
