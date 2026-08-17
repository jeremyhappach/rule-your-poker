-- 3-5-7 authority cutover.
--
-- The database owns bootstrap, hidden deals, decisions, scoring, financial
-- resolution, continuation, terminal settlement authorization, and the
-- outgoing dealer-game handoff. Realtime remains a synchronization channel;
-- every initiating RPC returns the committed projection directly.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.three_five_seven_round_resolutions (
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  dealer_game_id uuid NOT NULL REFERENCES public.dealer_games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  hand_number integer NOT NULL CHECK (hand_number > 0),
  round_number integer NOT NULL CHECK (round_number IN (1,2,3)),
  outcome text NOT NULL,
  winner_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  result jsonb NOT NULL,
  presentation_fallback_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (game_id, dealer_game_id, round_id, hand_number, round_number)
);

CREATE TABLE IF NOT EXISTS private.three_five_seven_postgame_advances (
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  dealer_game_id uuid NOT NULL REFERENCES public.dealer_games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  hand_number integer NOT NULL CHECK (hand_number > 0),
  winner_player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  target_status text NOT NULL CHECK (
    target_status IN ('game_selection','dealer_selection','waiting','session_ended')
  ),
  dealer_position integer,
  config_deadline timestamptz,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (game_id, dealer_game_id, round_id, hand_number)
);

ALTER TABLE private.three_five_seven_round_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.three_five_seven_postgame_advances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.three_five_seven_round_resolutions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.three_five_seven_postgame_advances FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.three_five_seven_is_game(p_game_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.games game_row
     WHERE game_row.id = p_game_id
       AND game_row.game_type IN ('3-5-7','3-5-7-game','357')
  );
$$;

CREATE OR REPLACE FUNCTION private.three_five_seven_actor_allowed(p_game_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(current_setting('app.three_five_seven_recovery',true),'')='on'
      OR coalesce(auth.jwt()->>'role','') = 'service_role'
      OR (
        auth.uid() IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.players participant
             WHERE participant.game_id = p_game_id
               AND participant.user_id = auth.uid()
               AND participant.status <> 'left'
          )
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
        )
      );
$$;

REVOKE ALL ON FUNCTION private.three_five_seven_is_game(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.three_five_seven_actor_allowed(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.three_five_seven_guard_round_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_game_id uuid := CASE WHEN TG_OP='DELETE' THEN OLD.game_id ELSE NEW.game_id END;
  v_trusted boolean := coalesce(current_setting('app.three_five_seven_authoritative_write',true),'')='on';
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
  IF private.three_five_seven_is_game(v_game_id) AND NOT v_trusted AND NOT v_service THEN
    RAISE EXCEPTION 'three_five_seven_round_mutation:rpc_required';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS three_five_seven_guard_round_mutation ON public.rounds;
CREATE TRIGGER three_five_seven_guard_round_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.rounds
FOR EACH ROW EXECUTE FUNCTION private.three_five_seven_guard_round_mutation();

CREATE OR REPLACE FUNCTION private.three_five_seven_guard_player_cards_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_round_id uuid := CASE WHEN TG_OP='DELETE' THEN OLD.round_id ELSE NEW.round_id END;
  v_is_357 boolean;
  v_trusted boolean := coalesce(current_setting('app.three_five_seven_authoritative_write',true),'')='on';
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.rounds round_row
    JOIN public.games game_row ON game_row.id=round_row.game_id
    WHERE round_row.id=v_round_id
      AND game_row.game_type IN ('3-5-7','3-5-7-game','357')
  ) INTO v_is_357;
  IF v_is_357 AND NOT v_trusted AND NOT v_service THEN
    RAISE EXCEPTION 'three_five_seven_player_cards_mutation:rpc_required';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS three_five_seven_guard_player_cards_mutation ON public.player_cards;
CREATE TRIGGER three_five_seven_guard_player_cards_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.player_cards
FOR EACH ROW EXECUTE FUNCTION private.three_five_seven_guard_player_cards_mutation();

ALTER TABLE public.player_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS three_five_seven_hidden_cards_select ON public.player_cards;
CREATE POLICY three_five_seven_hidden_cards_select
ON public.player_cards
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  NOT EXISTS (
    SELECT 1 FROM public.rounds round_row
    JOIN public.games game_row ON game_row.id=round_row.game_id
    WHERE round_row.id=player_cards.round_id
      AND game_row.game_type IN ('3-5-7','3-5-7-game','357')
  )
  OR coalesce(player_cards.is_public,false)
  OR EXISTS (
    SELECT 1 FROM public.players owner
    JOIN public.rounds round_row ON round_row.game_id=owner.game_id
    WHERE round_row.id=player_cards.round_id
      AND owner.id=player_cards.player_id
      AND owner.user_id=(SELECT auth.uid())
  )
  OR public.has_role((SELECT auth.uid()),'admin'::public.app_role)
);

CREATE OR REPLACE FUNCTION private.three_five_seven_guard_game_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_trusted boolean := coalesce(current_setting('app.three_five_seven_authoritative_write',true),'')='on';
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
  v_is_357 boolean := OLD.game_type IN ('3-5-7','3-5-7-game','357');
  v_config_handoff boolean := false;
BEGIN
  IF v_is_357 AND NOT v_trusted AND NOT v_service THEN
    v_config_handoff := OLD.status IN ('waiting','game_selection','dealer_selection')
      AND OLD.current_game_uuid IS NULL
      AND NEW.current_game_uuid IS NOT NULL
      AND NEW.status='ante_decision'
      AND EXISTS (
        SELECT 1 FROM public.dealer_games dealer_game
         WHERE dealer_game.id=NEW.current_game_uuid
           AND dealer_game.session_id=NEW.id
           AND dealer_game.game_type=NEW.game_type
      );
  END IF;
  IF v_is_357 AND NOT v_trusted AND NOT v_service AND NOT v_config_handoff AND (
       OLD.current_game_uuid IS DISTINCT FROM NEW.current_game_uuid
    OR OLD.current_round IS DISTINCT FROM NEW.current_round
    OR OLD.total_hands IS DISTINCT FROM NEW.total_hands
    OR OLD.dealer_position IS DISTINCT FROM NEW.dealer_position
    OR OLD.pot IS DISTINCT FROM NEW.pot
    OR OLD.awaiting_next_round IS DISTINCT FROM NEW.awaiting_next_round
    OR OLD.next_round_number IS DISTINCT FROM NEW.next_round_number
    OR OLD.all_decisions_in IS DISTINCT FROM NEW.all_decisions_in
    OR OLD.all_decisions_in_round_id IS DISTINCT FROM NEW.all_decisions_in_round_id
    OR OLD.last_round_result IS DISTINCT FROM NEW.last_round_result
    OR OLD.game_over_at IS DISTINCT FROM NEW.game_over_at
    OR OLD.session_ended_at IS DISTINCT FROM NEW.session_ended_at
    OR OLD.pending_session_end IS DISTINCT FROM NEW.pending_session_end
    OR (
      OLD.status IN ('ante_decision','in_progress','game_over','session_ended')
      AND OLD.status IS DISTINCT FROM NEW.status
    )
  ) THEN
    RAISE EXCEPTION 'three_five_seven_game_authority_mutation:rpc_required';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS three_five_seven_guard_game_authority ON public.games;
CREATE TRIGGER three_five_seven_guard_game_authority
BEFORE UPDATE ON public.games
FOR EACH ROW EXECUTE FUNCTION private.three_five_seven_guard_game_authority();

CREATE OR REPLACE FUNCTION private.three_five_seven_guard_player_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $$
DECLARE
  v_trusted boolean := coalesce(current_setting('app.three_five_seven_authoritative_write',true),'')='on';
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
  IF private.three_five_seven_is_game(OLD.game_id) AND NOT v_trusted AND NOT v_service AND (
       OLD.chips IS DISTINCT FROM NEW.chips
    OR OLD.legs IS DISTINCT FROM NEW.legs
    OR OLD.current_decision IS DISTINCT FROM NEW.current_decision
    OR OLD.decision_locked IS DISTINCT FROM NEW.decision_locked
    OR OLD.auto_fold IS DISTINCT FROM NEW.auto_fold
    OR OLD.pre_fold IS DISTINCT FROM NEW.pre_fold
    OR OLD.pre_stay IS DISTINCT FROM NEW.pre_stay
  ) THEN
    RAISE EXCEPTION 'three_five_seven_player_authority_mutation:rpc_required';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS three_five_seven_guard_player_authority ON public.players;
CREATE TRIGGER three_five_seven_guard_player_authority
BEFORE UPDATE ON public.players
FOR EACH ROW EXECUTE FUNCTION private.three_five_seven_guard_player_authority();

CREATE OR REPLACE FUNCTION private.three_five_seven_guard_result_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_game_id uuid := CASE WHEN TG_OP='DELETE' THEN OLD.game_id ELSE NEW.game_id END;
  v_trusted boolean := coalesce(current_setting('app.three_five_seven_authoritative_write',true),'')='on';
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
  IF private.three_five_seven_is_game(v_game_id) AND NOT v_trusted AND NOT v_service THEN
    RAISE EXCEPTION 'three_five_seven_result_mutation:rpc_required';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS three_five_seven_guard_result_mutation ON public.game_results;
CREATE TRIGGER three_five_seven_guard_result_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.game_results
FOR EACH ROW EXECUTE FUNCTION private.three_five_seven_guard_result_mutation();

DROP TRIGGER IF EXISTS three_five_seven_guard_snapshot_mutation ON public.session_player_snapshots;
CREATE TRIGGER three_five_seven_guard_snapshot_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.session_player_snapshots
FOR EACH ROW EXECUTE FUNCTION private.three_five_seven_guard_result_mutation();

REVOKE ALL ON FUNCTION private.three_five_seven_guard_round_mutation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.three_five_seven_guard_player_cards_mutation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.three_five_seven_guard_game_authority() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.three_five_seven_guard_player_authority() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.three_five_seven_guard_result_mutation() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.three_five_seven_rank_value(p_rank text)
RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog
AS $$
  SELECT CASE upper(p_rank)
    WHEN 'A' THEN 14 WHEN 'K' THEN 13 WHEN 'Q' THEN 12 WHEN 'J' THEN 11
    ELSE CASE WHEN p_rank ~ '^[0-9]+$' THEN p_rank::integer ELSE 0 END
  END;
$$;

CREATE OR REPLACE FUNCTION private.three_five_seven_pack_values(p_values integer[])
RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog
AS $$
DECLARE v bigint:=0; n integer;
BEGIN
  FOREACH n IN ARRAY coalesce(p_values,ARRAY[]::integer[]) LOOP v:=v*15+n; END LOOP;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION private.three_five_seven_straight_high(p_ranks integer[], p_wilds integer)
RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog
AS $$
DECLARE high integer; needed integer; rank_value integer;
BEGIN
  FOR high IN REVERSE 14..5 LOOP
    needed:=0;
    FOR rank_value IN high-4..high LOOP
      IF rank_value=1 THEN
        IF NOT (14=ANY(coalesce(p_ranks,ARRAY[]::integer[]))) THEN needed:=needed+1; END IF;
      ELSIF NOT (rank_value=ANY(coalesce(p_ranks,ARRAY[]::integer[]))) THEN needed:=needed+1;
      END IF;
    END LOOP;
    IF needed<=p_wilds THEN RETURN high; END IF;
  END LOOP;
  RETURN 0;
END;
$$;

-- Scores one 3-card or 5-card candidate. Category occupies the high digits;
-- the packed kickers provide deterministic poker ordering.
CREATE OR REPLACE FUNCTION private.three_five_seven_score_candidate(
  p_cards jsonb, p_wild_rank integer
)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private
AS $$
DECLARE
  v_count integer:=jsonb_array_length(p_cards); v_wilds integer:=0;
  v_ranks integer[]:=ARRAY[]::integer[]; v_suits text[]:=ARRAY[]::text[];
  v_card jsonb; v_rank integer; v_rank_cursor integer; v_rank2 integer;
  v_count_rank integer; v_count_rank2 integer; v_best integer:=0; v_best2 integer:=0;
  v_straight integer:=0; v_sf integer:=0; v_suit text; v_suit_ranks integer[];
  v_values integer[]:=ARRAY[]::integer[]; v_category integer:=0; v_label text:='High Card';
  v_remaining integer; v_need integer; v_pair_count integer;
  v_flush_score bigint:=0; v_candidate_score bigint:=0;
BEGIN
  FOR v_card IN SELECT value FROM jsonb_array_elements(p_cards) LOOP
    v_rank:=private.three_five_seven_rank_value(v_card->>'rank');
    IF v_rank=p_wild_rank THEN v_wilds:=v_wilds+1;
    ELSE v_ranks:=array_append(v_ranks,v_rank); v_suits:=array_append(v_suits,v_card->>'suit'); END IF;
  END LOOP;

  IF v_count=3 THEN
    FOR v_rank_cursor IN REVERSE 14..2 LOOP
      SELECT count(*) INTO v_count_rank FROM unnest(v_ranks) r WHERE r=v_rank_cursor;
      IF v_count_rank+v_wilds>=3 THEN
        RETURN jsonb_build_object('score',3::bigint*10000000000+v_rank_cursor,'label','Three of a Kind');
      END IF;
    END LOOP;
    FOR v_rank_cursor IN REVERSE 14..2 LOOP
      SELECT count(*) INTO v_count_rank FROM unnest(v_ranks) r WHERE r=v_rank_cursor;
      IF v_count_rank+v_wilds>=2 THEN
        SELECT coalesce(max(r),14) INTO v_best FROM unnest(v_ranks) r WHERE r<>v_rank_cursor;
        RETURN jsonb_build_object('score',2::bigint*10000000000+private.three_five_seven_pack_values(ARRAY[v_rank_cursor,v_best]),'label','Pair');
      END IF;
    END LOOP;
    SELECT coalesce(array_agg(r ORDER BY r DESC),ARRAY[]::integer[]) INTO v_values FROM unnest(v_ranks) r;
    WHILE cardinality(v_values)<3 LOOP v_values:=array_prepend(14,v_values); END LOOP;
    RETURN jsonb_build_object('score',10000000000::bigint+private.three_five_seven_pack_values(v_values[1:3]),'label','High Card');
  END IF;

  FOR v_rank_cursor IN REVERSE 14..2 LOOP
    SELECT count(*) INTO v_count_rank FROM unnest(v_ranks) r WHERE r=v_rank_cursor;
    IF v_count_rank+v_wilds>=5 THEN
      RETURN jsonb_build_object('score',10::bigint*10000000000+v_rank_cursor,'label','Five of a Kind');
    END IF;
  END LOOP;

  FOREACH v_suit IN ARRAY ARRAY['spades','hearts','diamonds','clubs','♠','♥','♦','♣'] LOOP
    SELECT coalesce(array_agg(DISTINCT r),ARRAY[]::integer[]) INTO v_suit_ranks
      FROM unnest(v_ranks,v_suits) x(r,s) WHERE s=v_suit;
    v_sf:=greatest(v_sf,private.three_five_seven_straight_high(v_suit_ranks,v_wilds));
  END LOOP;
  IF v_sf>0 THEN RETURN jsonb_build_object('score',9::bigint*10000000000+v_sf,'label','Straight Flush'); END IF;

  FOR v_rank_cursor IN REVERSE 14..2 LOOP
    SELECT count(*) INTO v_count_rank FROM unnest(v_ranks) r WHERE r=v_rank_cursor;
    IF v_count_rank+v_wilds>=4 THEN
      SELECT coalesce(max(r),14) INTO v_best FROM unnest(v_ranks) r WHERE r<>v_rank_cursor;
      RETURN jsonb_build_object('score',8::bigint*10000000000+private.three_five_seven_pack_values(ARRAY[v_rank_cursor,v_best]),'label','Four of a Kind');
    END IF;
  END LOOP;

  FOR v_rank_cursor IN REVERSE 14..2 LOOP
    SELECT count(*) INTO v_count_rank FROM unnest(v_ranks) r WHERE r=v_rank_cursor;
    v_need:=greatest(0,3-v_count_rank);
    IF v_need<=v_wilds THEN
      FOR v_rank2 IN REVERSE 14..2 LOOP
        CONTINUE WHEN v_rank2=v_rank_cursor;
        SELECT count(*) INTO v_count_rank2 FROM unnest(v_ranks) r WHERE r=v_rank2;
        IF greatest(0,2-v_count_rank2)<=v_wilds-v_need THEN
          RETURN jsonb_build_object('score',7::bigint*10000000000+private.three_five_seven_pack_values(ARRAY[v_rank_cursor,v_rank2]),'label','Full House');
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  FOREACH v_suit IN ARRAY ARRAY['spades','hearts','diamonds','clubs','♠','♥','♦','♣'] LOOP
    SELECT count(*),coalesce(array_agg(r ORDER BY r DESC),ARRAY[]::integer[]) INTO v_count_rank,v_values
      FROM unnest(v_ranks,v_suits) x(r,s) WHERE s=v_suit;
    IF v_count_rank+v_wilds>=5 THEN
      WHILE cardinality(v_values)<5 LOOP v_values:=array_prepend(14,v_values); END LOOP;
      v_candidate_score:=6::bigint*10000000000+private.three_five_seven_pack_values(v_values[1:5]);
      v_flush_score:=greatest(v_flush_score,v_candidate_score);
    END IF;
  END LOOP;
  IF v_flush_score>0 THEN RETURN jsonb_build_object('score',v_flush_score,'label','Flush'); END IF;

  SELECT coalesce(array_agg(DISTINCT r),ARRAY[]::integer[]) INTO v_values FROM unnest(v_ranks) r;
  v_straight:=private.three_five_seven_straight_high(v_values,v_wilds);
  IF v_straight>0 THEN RETURN jsonb_build_object('score',5::bigint*10000000000+v_straight,'label','Straight'); END IF;

  FOR v_rank_cursor IN REVERSE 14..2 LOOP
    SELECT count(*) INTO v_count_rank FROM unnest(v_ranks) r WHERE r=v_rank_cursor;
    IF v_count_rank+v_wilds>=3 THEN
      SELECT coalesce(array_agg(r ORDER BY r DESC),ARRAY[]::integer[]) INTO v_values FROM unnest(v_ranks) r WHERE r<>v_rank_cursor;
      WHILE cardinality(v_values)<2 LOOP v_values:=array_append(v_values,14); END LOOP;
      RETURN jsonb_build_object('score',4::bigint*10000000000+private.three_five_seven_pack_values(ARRAY[v_rank_cursor]||v_values[1:2]),'label','Three of a Kind');
    END IF;
  END LOOP;

  FOR v_rank_cursor IN REVERSE 14..2 LOOP
    SELECT count(*) INTO v_count_rank FROM unnest(v_ranks) r WHERE r=v_rank_cursor;
    v_need:=greatest(0,2-v_count_rank);
    IF v_need<=v_wilds THEN
      FOR v_rank2 IN REVERSE 14..2 LOOP
        CONTINUE WHEN v_rank2>=v_rank_cursor;
        SELECT count(*) INTO v_count_rank2 FROM unnest(v_ranks) r WHERE r=v_rank2;
        IF greatest(0,2-v_count_rank2)<=v_wilds-v_need THEN
          SELECT coalesce(max(r),14) INTO v_best FROM unnest(v_ranks) r WHERE r NOT IN (v_rank_cursor,v_rank2);
          RETURN jsonb_build_object('score',3::bigint*10000000000+private.three_five_seven_pack_values(ARRAY[v_rank_cursor,v_rank2,v_best]),'label','Two Pair');
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  FOR v_rank_cursor IN REVERSE 14..2 LOOP
    SELECT count(*) INTO v_count_rank FROM unnest(v_ranks) r WHERE r=v_rank_cursor;
    IF greatest(0,2-v_count_rank)<=v_wilds THEN
      SELECT coalesce(array_agg(r ORDER BY r DESC),ARRAY[]::integer[]) INTO v_values FROM unnest(v_ranks) r WHERE r<>v_rank_cursor;
      WHILE cardinality(v_values)<3 LOOP v_values:=array_append(v_values,14); END LOOP;
      RETURN jsonb_build_object('score',2::bigint*10000000000+private.three_five_seven_pack_values(ARRAY[v_rank_cursor]||v_values[1:3]),'label','Pair');
    END IF;
  END LOOP;

  SELECT coalesce(array_agg(r ORDER BY r DESC),ARRAY[]::integer[]) INTO v_values FROM unnest(v_ranks) r;
  WHILE cardinality(v_values)<5 LOOP v_values:=array_prepend(14,v_values); END LOOP;
  RETURN jsonb_build_object('score',10000000000::bigint+private.three_five_seven_pack_values(v_values[1:5]),'label','High Card');
END;
$$;

CREATE OR REPLACE FUNCTION private.three_five_seven_score_hand(p_cards jsonb,p_round_number integer)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private
AS $$
DECLARE
  v_count integer:=jsonb_array_length(p_cards); a integer; b integer; c integer; d integer; e integer;
  v_candidate jsonb; v_score jsonb; v_best jsonb:=jsonb_build_object('score',-1,'label','Invalid');
  v_wild integer:=CASE p_round_number WHEN 1 THEN 3 WHEN 2 THEN 5 ELSE 7 END;
BEGIN
  IF v_count=3 THEN RETURN private.three_five_seven_score_candidate(p_cards,v_wild); END IF;
  IF v_count NOT IN (5,7) THEN RAISE EXCEPTION 'three_five_seven_score_hand:invalid_card_count:%',v_count; END IF;
  FOR a IN 0..v_count-5 LOOP FOR b IN a+1..v_count-4 LOOP FOR c IN b+1..v_count-3 LOOP
    FOR d IN c+1..v_count-2 LOOP FOR e IN d+1..v_count-1 LOOP
      v_candidate:=jsonb_build_array(p_cards->a,p_cards->b,p_cards->c,p_cards->d,p_cards->e);
      v_score:=private.three_five_seven_score_candidate(v_candidate,v_wild);
      IF (v_score->>'score')::bigint>(v_best->>'score')::bigint THEN v_best:=v_score; END IF;
    END LOOP; END LOOP;
  END LOOP; END LOOP; END LOOP;
  RETURN v_best;
END;
$$;

REVOKE ALL ON FUNCTION private.three_five_seven_rank_value(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.three_five_seven_pack_values(integer[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.three_five_seven_straight_high(integer[],integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.three_five_seven_score_candidate(jsonb,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.three_five_seven_score_hand(jsonb,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.three_five_seven_create_round(
  p_game_id uuid,
  p_dealer_game_id uuid,
  p_round_number integer,
  p_hand_number integer,
  p_charge_amount integer,
  p_charge_label text,
  p_decision_deadline timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_game public.games%ROWTYPE; v_existing public.rounds%ROWTYPE; v_round public.rounds%ROWTYPE;
  v_player public.players%ROWTYPE; v_player_ids uuid[]; v_player_id uuid;
  v_cards_dealt integer:=CASE p_round_number WHEN 1 THEN 3 WHEN 2 THEN 5 WHEN 3 THEN 7 END;
  v_new_count integer:=CASE p_round_number WHEN 1 THEN 3 ELSE 2 END;
  v_prev_round_id uuid; v_carry jsonb; v_dealt jsonb:='[]'::jsonb; v_deck jsonb;
  v_slice jsonb; v_cards jsonb; v_cursor integer:=0; v_total_charge integer:=0;
  v_legs jsonb; v_changes jsonb:='{}'::jsonb; v_transfer jsonb:='[]'::jsonb;
BEGIN
  IF p_round_number NOT IN (1,2,3) OR p_hand_number<1 THEN
    RAISE EXCEPTION 'three_five_seven_create_round:invalid_identity';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN
    RAISE EXCEPTION 'three_five_seven_create_round:not_357_game';
  END IF;
  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id THEN
    RAISE EXCEPTION 'three_five_seven_create_round:dealer_game_mismatch';
  END IF;
  IF v_game.status IN ('game_over','session_ended') THEN
    RAISE EXCEPTION 'three_five_seven_create_round:terminal_game';
  END IF;

  SELECT * INTO v_existing FROM public.rounds
   WHERE dealer_game_id=p_dealer_game_id AND hand_number=p_hand_number AND round_number=p_round_number
   FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome','already_started','deduped',true,'round_id',v_existing.id,
      'hand_number',v_existing.hand_number,'round_number',v_existing.round_number,
      'round',to_jsonb(v_existing)
    );
  END IF;

  SELECT array_agg(player.id ORDER BY coalesce(player.position,9999),player.id)
    INTO v_player_ids
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND player.status NOT IN ('left','observer')
     AND NOT coalesce(player.sitting_out,false);
  IF coalesce(cardinality(v_player_ids),0)<2 THEN
    RAISE EXCEPTION 'three_five_seven_create_round:insufficient_players';
  END IF;

  IF p_round_number IN (2,3) THEN
    SELECT id INTO v_prev_round_id FROM public.rounds
     WHERE dealer_game_id=p_dealer_game_id AND hand_number=p_hand_number
       AND round_number=p_round_number-1 AND status='completed'
     FOR UPDATE;
    IF v_prev_round_id IS NULL THEN RAISE EXCEPTION 'three_five_seven_create_round:predecessor_not_completed'; END IF;
    SELECT coalesce(jsonb_agg(card),'[]'::jsonb) INTO v_dealt
      FROM public.player_cards pc CROSS JOIN LATERAL jsonb_array_elements(pc.cards) card
     WHERE pc.round_id=v_prev_round_id;
  END IF;

  WITH ranks(rank) AS (VALUES ('2'),('3'),('4'),('5'),('6'),('7'),('8'),('9'),('10'),('J'),('Q'),('K'),('A')),
       suits(suit) AS (VALUES ('♠'),('♥'),('♦'),('♣')),
       available AS (
         SELECT jsonb_build_object('rank',rank,'suit',suit) card FROM ranks CROSS JOIN suits
         EXCEPT
         SELECT dealt_card FROM jsonb_array_elements(v_dealt) dealt_card
       )
  SELECT coalesce(jsonb_agg(card ORDER BY random()),'[]'::jsonb) INTO v_deck FROM available;

  IF p_round_number=1 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'player_id',player.id,'position',coalesce(player.position,0),'legs',coalesce(player.legs,0)
    ) ORDER BY coalesce(player.position,9999),player.id),'[]'::jsonb)
    INTO v_legs FROM public.players player WHERE player.game_id=p_game_id;
  END IF;

  INSERT INTO public.rounds(
    game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot,
    decision_deadline,three_five_seven_legs_at_start
  ) VALUES (
    p_game_id,p_dealer_game_id,p_hand_number,p_round_number,v_cards_dealt,'betting',
    coalesce(v_game.pot,0),p_decision_deadline,v_legs
  ) RETURNING * INTO v_round;

  FOREACH v_player_id IN ARRAY v_player_ids LOOP
    IF p_round_number=1 THEN v_carry:='[]'::jsonb;
    ELSE
      SELECT cards INTO v_carry FROM public.player_cards
       WHERE round_id=v_prev_round_id AND player_id=v_player_id;
      IF jsonb_array_length(coalesce(v_carry,'[]'::jsonb))<>v_cards_dealt-2 THEN
        RAISE EXCEPTION 'three_five_seven_create_round:invalid_carry:%',v_player_id;
      END IF;
    END IF;
    SELECT coalesce(jsonb_agg(card ORDER BY ord),'[]'::jsonb) INTO v_slice
      FROM jsonb_array_elements(v_deck) WITH ORDINALITY deck(card,ord)
     WHERE ord>v_cursor AND ord<=v_cursor+v_new_count;
    IF jsonb_array_length(v_slice)<>v_new_count THEN RAISE EXCEPTION 'three_five_seven_create_round:deck_underflow'; END IF;
    v_cursor:=v_cursor+v_new_count; v_cards:=v_carry||v_slice;
    INSERT INTO public.player_cards(player_id,round_id,cards) VALUES(v_player_id,v_round.id,v_cards);
  END LOOP;

  IF coalesce(p_charge_amount,0)>0 THEN
    FOREACH v_player_id IN ARRAY v_player_ids LOOP
      v_transfer:=v_transfer||jsonb_build_array(jsonb_build_object(
        'from',jsonb_build_object('kind','player','playerId',v_player_id),
        'to',jsonb_build_object('kind','pot'),'amount',p_charge_amount
      ));
      v_changes:=jsonb_set(v_changes,ARRAY[v_player_id::text],to_jsonb(-p_charge_amount),true);
    END LOOP;
    PERFORM public.settle_gameplay_chip_transfers(p_game_id,v_transfer,'ante');
    v_total_charge:=cardinality(v_player_ids)*p_charge_amount;
    UPDATE public.rounds SET pot=(SELECT pot FROM public.games WHERE id=p_game_id) WHERE id=v_round.id;
    INSERT INTO public.game_results(
      game_id,dealer_game_id,hand_number,winner_player_id,winner_username,
      winning_hand_description,pot_won,player_chip_changes,is_chopped,game_type,
      settlement_key
    ) VALUES (
      p_game_id,p_dealer_game_id,p_hand_number,NULL,
      cardinality(v_player_ids)::text||' players '||lower(p_charge_label)||' $'||p_charge_amount::text,
      p_charge_label,0,v_changes,false,'357',
      'three_five_seven_charge:'||v_round.id::text
    ) ON CONFLICT (dealer_game_id,hand_number,settlement_key)
        WHERE settlement_key IS NOT NULL DO NOTHING;
  END IF;

  UPDATE public.players SET current_decision=NULL,decision_locked=false,status='active'
   WHERE id=ANY(v_player_ids);
  UPDATE public.games SET
    status='in_progress',current_round=p_round_number,total_hands=p_hand_number,
    awaiting_next_round=false,next_round_number=NULL,all_decisions_in=false,
    all_decisions_in_round_id=NULL,last_round_result=NULL,game_over_at=NULL,
    config_deadline=NULL,ante_decision_deadline=NULL,is_first_hand=false
   WHERE id=p_game_id;
  SELECT * INTO v_round FROM public.rounds WHERE id=v_round.id;
  RETURN jsonb_build_object(
    'outcome','started','deduped',false,'round_id',v_round.id,
    'hand_number',p_hand_number,'round_number',p_round_number,
    'charged',v_total_charge,'round',to_jsonb(v_round)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.three_five_seven_create_round(uuid,uuid,integer,integer,integer,text,timestamptz)
  FROM PUBLIC,anon,authenticated;

-- Preserve the deployed implementation for rollback/history, but remove its
-- browser authority. All live callers move to exact-identity RPCs below.
DO $rename_legacy_advance$
BEGIN
  IF to_regprocedure('public.advance_357_round(uuid,uuid,integer,integer,timestamp with time zone,jsonb)') IS NOT NULL
     AND to_regprocedure('public.advance_357_round_unsafe_legacy(uuid,uuid,integer,integer,timestamp with time zone,jsonb)') IS NULL THEN
    ALTER FUNCTION public.advance_357_round(uuid,uuid,integer,integer,timestamptz,jsonb)
      RENAME TO advance_357_round_unsafe_legacy;
  END IF;
END;
$rename_legacy_advance$;

DO $lock_legacy_advance$
BEGIN
  IF to_regprocedure('public.advance_357_round_unsafe_legacy(uuid,uuid,integer,integer,timestamp with time zone,jsonb)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.advance_357_round_unsafe_legacy(uuid,uuid,integer,integer,timestamptz,jsonb)
      FROM PUBLIC,anon,authenticated,service_role;
  END IF;
  IF to_regprocedure('public.advance_357_round_legacy(uuid,uuid,integer,integer,timestamp with time zone,integer,jsonb)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.advance_357_round_legacy(uuid,uuid,integer,integer,timestamptz,integer,jsonb)
      FROM PUBLIC,anon,authenticated,service_role;
  END IF;
END;
$lock_legacy_advance$;

-- Forward declaration; replaced by the complete exact-identity implementation
-- after the terminal settlement implementation is sealed below.
CREATE OR REPLACE FUNCTION private.three_five_seven_settle_instant_sweep(
  p_game_id uuid,p_round_id uuid,p_dealer_game_id uuid,p_hand_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$ BEGIN RETURN jsonb_build_object('outcome','pending'); END; $$;

CREATE OR REPLACE FUNCTION public.three_five_seven_begin_game(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_game public.games%ROWTYPE; v_existing public.rounds%ROWTYPE; v_result jsonb;
  v_timer integer:=10; v_eligible integer; v_ready integer;
BEGIN
  IF p_game_id IS NULL THEN RAISE EXCEPTION 'three_five_seven_begin_game:missing_game_id'; END IF;
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN
    RAISE EXCEPTION 'three_five_seven_begin_game:not_in_session';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN
    RAISE EXCEPTION 'three_five_seven_begin_game:not_357_game';
  END IF;
  IF v_game.current_game_uuid IS NULL THEN RAISE EXCEPTION 'three_five_seven_begin_game:missing_dealer_game'; END IF;

  SELECT * INTO v_existing FROM public.rounds
   WHERE dealer_game_id=v_game.current_game_uuid AND hand_number=1 AND round_number=1
   FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome','already_started','deduped',true,'round_id',v_existing.id,
      'hand_number',1,'round_number',1,'round',to_jsonb(v_existing)
    );
  END IF;
  IF v_game.status IS DISTINCT FROM 'ante_decision' THEN
    RAISE EXCEPTION 'three_five_seven_begin_game:invalid_phase:%',v_game.status;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dealer_games dealer_game
     WHERE dealer_game.id=v_game.current_game_uuid AND dealer_game.session_id=p_game_id
       AND dealer_game.game_type IN ('3-5-7','3-5-7-game','357')
  ) THEN RAISE EXCEPTION 'three_five_seven_begin_game:dealer_game_mismatch'; END IF;

  SELECT count(*),count(*) FILTER (WHERE player.ante_decision='ante_up')
    INTO v_eligible,v_ready FROM public.players player
   WHERE player.game_id=p_game_id AND player.status NOT IN ('left','observer')
     AND NOT coalesce(player.sitting_out,false);
  IF v_eligible<2 OR v_ready<>v_eligible THEN
    RAISE EXCEPTION 'three_five_seven_begin_game:admission_incomplete:%/%',v_ready,v_eligible;
  END IF;
  IF coalesce(v_game.ante_amount,0)<0 THEN RAISE EXCEPTION 'three_five_seven_begin_game:invalid_ante'; END IF;
  SELECT coalesce(defaults.decision_timer_seconds,10) INTO v_timer
    FROM public.game_defaults defaults WHERE defaults.game_type='3-5-7' LIMIT 1;
  v_timer:=coalesce(v_timer,10);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  v_result:=private.three_five_seven_create_round(
    p_game_id,v_game.current_game_uuid,1,1,coalesce(v_game.ante_amount,0),'Ante',
    clock_timestamp()+make_interval(secs=>greatest(1,v_timer)+2)
  );
  PERFORM private.three_five_seven_settle_instant_sweep(
    p_game_id,(v_result->>'round_id')::uuid,v_game.current_game_uuid,1
  );
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id;
  SELECT * INTO v_existing FROM public.rounds WHERE id=(v_result->>'round_id')::uuid;
  RETURN v_result||jsonb_build_object('game',to_jsonb(v_game),'round',to_jsonb(v_existing));
END;
$$;

REVOKE ALL ON FUNCTION public.three_five_seven_begin_game(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.three_five_seven_begin_game(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.three_five_seven_advance_round(
  p_game_id uuid,p_round_id uuid,p_dealer_game_id uuid,p_hand_number integer,p_round_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE; v_game public.games%ROWTYPE; v_resolution private.three_five_seven_round_resolutions%ROWTYPE;
  v_existing public.rounds%ROWTYPE;
  v_next_round integer; v_next_hand integer; v_charge integer:=0; v_label text:='Rollover'; v_timer integer:=10; v_result jsonb;
BEGIN
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN RAISE EXCEPTION 'three_five_seven_advance_round:not_in_session'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND OR v_round.game_id IS DISTINCT FROM p_game_id OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number OR v_round.round_number IS DISTINCT FROM p_round_number THEN
    RAISE EXCEPTION 'three_five_seven_advance_round:round_identity_mismatch';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id THEN RAISE EXCEPTION 'three_five_seven_advance_round:stale_game_identity'; END IF;
  SELECT * INTO v_resolution FROM private.three_five_seven_round_resolutions
   WHERE game_id=p_game_id AND dealer_game_id=p_dealer_game_id AND round_id=p_round_id
     AND hand_number=p_hand_number AND round_number=p_round_number;
  IF NOT FOUND OR v_round.status<>'completed' THEN
    RAISE EXCEPTION 'three_five_seven_advance_round:predecessor_not_committed';
  END IF;
  v_next_round:=CASE p_round_number WHEN 1 THEN 2 WHEN 2 THEN 3 ELSE 1 END;
  v_next_hand:=CASE WHEN p_round_number=3 THEN p_hand_number+1 ELSE p_hand_number END;
  SELECT * INTO v_existing FROM public.rounds
   WHERE dealer_game_id=p_dealer_game_id AND hand_number=v_next_hand AND round_number=v_next_round;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome','already_started','deduped',true,'round_id',v_existing.id,
      'hand_number',v_existing.hand_number,'round_number',v_existing.round_number,
      'game',to_jsonb(v_game),'round',to_jsonb(v_existing)
    );
  END IF;
  IF NOT coalesce(v_game.awaiting_next_round,false)
     OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_game.current_round IS DISTINCT FROM p_round_number THEN
    RAISE EXCEPTION 'three_five_seven_advance_round:predecessor_not_current';
  END IF;
  IF p_round_number=3 THEN v_charge:=greatest(0,coalesce(v_game.rollover_amount,1)); END IF;
  SELECT coalesce(defaults.decision_timer_seconds,10) INTO v_timer FROM public.game_defaults defaults WHERE defaults.game_type='3-5-7' LIMIT 1;
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  v_result:=private.three_five_seven_create_round(
    p_game_id,p_dealer_game_id,v_next_round,v_next_hand,v_charge,v_label,
    clock_timestamp()+make_interval(secs=>greatest(1,coalesce(v_timer,10))+2)
  );
  IF v_next_round=1 THEN
    PERFORM private.three_five_seven_settle_instant_sweep(
      p_game_id,(v_result->>'round_id')::uuid,p_dealer_game_id,v_next_hand
    );
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id;
  SELECT * INTO v_round FROM public.rounds WHERE id=(v_result->>'round_id')::uuid;
  RETURN v_result||jsonb_build_object('game',to_jsonb(v_game),'round',to_jsonb(v_round));
END;
$$;

REVOKE ALL ON FUNCTION public.three_five_seven_advance_round(uuid,uuid,uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.three_five_seven_advance_round(uuid,uuid,uuid,integer,integer) TO authenticated,service_role;

DO $seal_terminal_settlement$
BEGIN
  IF to_regprocedure('public.three_five_seven_settle_game(uuid,uuid,uuid,integer)') IS NOT NULL
     AND to_regprocedure('public.three_five_seven_settle_game_authority_impl(uuid,uuid,uuid,integer)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.three_five_seven_settle_game(uuid,uuid,uuid,integer) RENAME TO three_five_seven_settle_game_authority_impl';
  END IF;
END;
$seal_terminal_settlement$;

REVOKE ALL ON FUNCTION public.three_five_seven_settle_game_authority_impl(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.three_five_seven_settle_game(
  p_game_id uuid,p_round_id uuid,p_dealer_game_id uuid,p_hand_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_resolution private.three_five_seven_round_resolutions%ROWTYPE; v_result jsonb;
BEGIN
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:not_in_session';
  END IF;
  SELECT * INTO v_resolution FROM private.three_five_seven_round_resolutions resolution
   WHERE resolution.game_id=p_game_id AND resolution.dealer_game_id=p_dealer_game_id
     AND resolution.round_id=p_round_id AND resolution.hand_number=p_hand_number
     AND resolution.outcome IN ('terminal','instant_sweep')
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'three_five_seven_settle_game:resolution_not_committed'; END IF;
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  SELECT public.three_five_seven_settle_game_authority_impl(
    p_game_id,p_round_id,p_dealer_game_id,p_hand_number
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.three_five_seven_settle_game(uuid,uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.three_five_seven_settle_game(uuid,uuid,uuid,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.three_five_seven_settle_instant_sweep(
  p_game_id uuid,p_round_id uuid,p_dealer_game_id uuid,p_hand_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE; v_game public.games%ROWTYPE; v_claim private.three_five_seven_round_resolutions%ROWTYPE;
  v_winner_id uuid; v_count integer; v_result jsonb; v_settlement jsonb;
BEGIN
  IF coalesce(current_setting('app.three_five_seven_test_no_sweep',true),'')='on' THEN
    RETURN jsonb_build_object('outcome','no_sweep','deduped',false);
  END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND OR v_round.game_id IS DISTINCT FROM p_game_id OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number OR v_round.round_number<>1 THEN
    RAISE EXCEPTION 'three_five_seven_instant_sweep:round_identity_mismatch';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id THEN
    RAISE EXCEPTION 'three_five_seven_instant_sweep:stale_game_identity';
  END IF;
  SELECT * INTO v_claim FROM private.three_five_seven_round_resolutions resolution
   WHERE resolution.game_id=p_game_id AND resolution.dealer_game_id=p_dealer_game_id
     AND resolution.round_id=p_round_id AND resolution.hand_number=p_hand_number
     AND resolution.round_number=1;
  IF FOUND THEN RETURN v_claim.result||jsonb_build_object('deduped',true); END IF;

  SELECT count(*) INTO v_count
    FROM public.player_cards cards
   WHERE cards.round_id=p_round_id
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(cards.cards) card WHERE card->>'rank'='3')
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(cards.cards) card WHERE card->>'rank'='5')
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(cards.cards) card WHERE card->>'rank'='7');
  IF v_count=0 THEN RETURN jsonb_build_object('outcome','no_sweep','deduped',false); END IF;
  IF v_count>1 THEN RAISE EXCEPTION 'three_five_seven_instant_sweep:ambiguous_multiple_winners'; END IF;
  SELECT cards.player_id INTO v_winner_id
    FROM public.player_cards cards
   WHERE cards.round_id=p_round_id
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(cards.cards) card WHERE card->>'rank'='3')
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(cards.cards) card WHERE card->>'rank'='5')
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(cards.cards) card WHERE card->>'rank'='7')
   LIMIT 1;

  v_result:=jsonb_build_object(
    'outcome','instant_sweep','deduped',false,'winner_player_id',v_winner_id,
    'round_id',p_round_id,'dealer_game_id',p_dealer_game_id,'hand_number',p_hand_number,'round_number',1
  );
  INSERT INTO private.three_five_seven_round_resolutions(
    game_id,dealer_game_id,round_id,hand_number,round_number,outcome,winner_player_id,result,presentation_fallback_at
  ) VALUES(p_game_id,p_dealer_game_id,p_round_id,p_hand_number,1,'instant_sweep',v_winner_id,v_result,clock_timestamp()+interval '30 seconds');
  UPDATE public.rounds SET status='completed' WHERE id=p_round_id;
  SELECT public.three_five_seven_settle_game(p_game_id,p_round_id,p_dealer_game_id,p_hand_number) INTO v_settlement;
  v_result:=v_result||jsonb_build_object('settlement',v_settlement);
  UPDATE private.three_five_seven_round_resolutions SET result=v_result
   WHERE game_id=p_game_id AND dealer_game_id=p_dealer_game_id AND round_id=p_round_id
     AND hand_number=p_hand_number AND round_number=1;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION private.three_five_seven_settle_instant_sweep(uuid,uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.three_five_seven_resolve_round(
  p_game_id uuid,p_round_id uuid,p_dealer_game_id uuid,p_hand_number integer,p_round_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE; v_game public.games%ROWTYPE; v_claim private.three_five_seven_round_resolutions%ROWTYPE;
  v_player public.players%ROWTYPE; v_stayer public.players%ROWTYPE; v_stayers integer; v_eligible integer; v_locked integer;
  v_score jsonb; v_top_score bigint:=-1; v_top_count integer:=0; v_top_label text; v_winner_id uuid; v_winner_name text;
  v_outcome text; v_message text; v_next_round integer; v_transfer jsonb:='[]'::jsonb; v_changes jsonb:='{}'::jsonb;
  v_amount integer:=0; v_result jsonb; v_settlement jsonb; v_new_legs integer; v_terminal boolean:=false;
BEGIN
  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND OR v_round.game_id IS DISTINCT FROM p_game_id OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number OR v_round.round_number IS DISTINCT FROM p_round_number THEN
    RAISE EXCEPTION 'three_five_seven_resolve_round:round_identity_mismatch';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN RAISE EXCEPTION 'three_five_seven_resolve_round:not_357_game'; END IF;
  SELECT * INTO v_claim FROM private.three_five_seven_round_resolutions resolution
   WHERE resolution.game_id=p_game_id AND resolution.dealer_game_id=p_dealer_game_id
     AND resolution.round_id=p_round_id AND resolution.hand_number=p_hand_number
     AND resolution.round_number=p_round_number;
  IF FOUND THEN RETURN v_claim.result||jsonb_build_object('deduped',true); END IF;
  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_game.current_round IS DISTINCT FROM p_round_number OR v_game.status<>'in_progress' OR v_round.status<>'betting' THEN
    RAISE EXCEPTION 'three_five_seven_resolve_round:stale_game_identity';
  END IF;

  SELECT count(*),count(*) FILTER(WHERE coalesce(player.decision_locked,false)),
         count(*) FILTER(WHERE player.current_decision='stay' AND coalesce(player.decision_locked,false))
    INTO v_eligible,v_locked,v_stayers
    FROM public.players player
   WHERE player.game_id=p_game_id AND player.status NOT IN ('left','observer') AND NOT coalesce(player.sitting_out,false);
  IF v_eligible<2 OR v_locked<>v_eligible THEN
    RETURN jsonb_build_object('outcome','awaiting_decisions','deduped',false,'decided',v_locked,'eligible',v_eligible);
  END IF;
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);

  IF v_stayers=0 THEN
    v_outcome:='all_fold'; v_message:='All players folded';
    IF coalesce(v_game.pussy_tax_enabled,true) AND coalesce(v_game.pussy_tax_value,0)>0 THEN
      FOR v_player IN SELECT * FROM public.players player
       WHERE player.game_id=p_game_id AND player.status NOT IN ('left','observer') AND NOT coalesce(player.sitting_out,false)
      LOOP
        v_transfer:=v_transfer||jsonb_build_array(jsonb_build_object(
          'from',jsonb_build_object('kind','player','playerId',v_player.id),
          'to',jsonb_build_object('kind','pot'),'amount',v_game.pussy_tax_value));
        v_changes:=jsonb_set(v_changes,ARRAY[v_player.id::text],to_jsonb(-v_game.pussy_tax_value),true);
      END LOOP;
      PERFORM public.settle_gameplay_chip_transfers(p_game_id,v_transfer,'bet');
    END IF;
  ELSIF v_stayers=1 THEN
    SELECT * INTO v_stayer FROM public.players player
     WHERE player.game_id=p_game_id AND player.current_decision='stay' AND coalesce(player.decision_locked,false)
       AND player.status NOT IN ('left','observer') AND NOT coalesce(player.sitting_out,false) FOR UPDATE;
    v_winner_id:=v_stayer.id; v_amount:=greatest(0,coalesce(v_game.leg_value,1));
    IF v_amount>0 THEN
      v_transfer:=jsonb_build_array(jsonb_build_object(
        'from',jsonb_build_object('kind','player','playerId',v_winner_id),
        'to',jsonb_build_object('kind','pot'),'amount',v_amount));
      PERFORM public.settle_gameplay_chip_transfers(p_game_id,v_transfer,'leg');
      v_changes:=jsonb_set(v_changes,ARRAY[v_winner_id::text],to_jsonb(-v_amount),true);
    END IF;
    UPDATE public.players SET legs=coalesce(legs,0)+1 WHERE id=v_winner_id RETURNING legs INTO v_new_legs;
    SELECT coalesce(profile.username,'Player '||coalesce(v_stayer.position,0)::text) INTO v_winner_name
      FROM public.players player LEFT JOIN public.profiles profile ON profile.id=player.user_id WHERE player.id=v_winner_id;
    v_terminal:=v_new_legs>=greatest(1,coalesce(v_game.legs_to_win,3));
    v_outcome:=CASE WHEN v_terminal THEN 'terminal' ELSE 'solo_stay' END;
    v_message:=v_winner_name||' stayed alone and earned leg '||v_new_legs::text;
  ELSE
    FOR v_stayer IN SELECT player.* FROM public.players player
     WHERE player.game_id=p_game_id AND player.current_decision='stay' AND coalesce(player.decision_locked,false)
       AND player.status NOT IN ('left','observer') AND NOT coalesce(player.sitting_out,false)
     ORDER BY player.position,player.id FOR UPDATE
    LOOP
      SELECT private.three_five_seven_score_hand(cards.cards,p_round_number) INTO v_score
        FROM public.player_cards cards WHERE cards.round_id=p_round_id AND cards.player_id=v_stayer.id;
      IF (v_score->>'score')::bigint>v_top_score THEN
        v_top_score:=(v_score->>'score')::bigint; v_top_count:=1; v_winner_id:=v_stayer.id; v_top_label:=v_score->>'label';
      ELSIF (v_score->>'score')::bigint=v_top_score THEN v_top_count:=v_top_count+1;
      END IF;
    END LOOP;
    IF v_top_count<>1 THEN v_outcome:='tie'; v_winner_id:=NULL; v_message:='Tie: pot carries forward';
    ELSE
      SELECT coalesce(profile.username,'Player '||coalesce(player.position,0)::text) INTO v_winner_name
        FROM public.players player LEFT JOIN public.profiles profile ON profile.id=player.user_id WHERE player.id=v_winner_id;
      v_amount:=greatest(0,coalesce(v_game.pot,0));
      IF coalesce(v_game.pot_max_enabled,false) THEN v_amount:=least(v_amount,greatest(0,coalesce(v_game.pot_max_value,v_amount))); END IF;
      IF v_amount>0 THEN
        FOR v_stayer IN SELECT player.* FROM public.players player
         WHERE player.game_id=p_game_id AND player.current_decision='stay' AND coalesce(player.decision_locked,false)
           AND player.id<>v_winner_id AND player.status NOT IN ('left','observer') AND NOT coalesce(player.sitting_out,false)
        LOOP
          v_transfer:=v_transfer||jsonb_build_array(jsonb_build_object(
            'from',jsonb_build_object('kind','player','playerId',v_stayer.id),
            'to',jsonb_build_object('kind','player','playerId',v_winner_id),'amount',v_amount));
          v_changes:=jsonb_set(v_changes,ARRAY[v_stayer.id::text],to_jsonb(-v_amount),true);
        END LOOP;
        v_changes:=jsonb_set(v_changes,ARRAY[v_winner_id::text],to_jsonb((v_stayers-1)*v_amount),true);
        PERFORM public.settle_gameplay_chip_transfers(p_game_id,v_transfer,'win');
      END IF;
      v_outcome:='showdown'; v_message:=v_winner_name||' wins with '||v_top_label;
    END IF;
    IF coalesce(v_game.reveal_at_showdown,true) THEN
      UPDATE public.player_cards cards SET is_public=true
       WHERE cards.round_id=p_round_id
         AND EXISTS (
           SELECT 1 FROM public.players player
            WHERE player.id=cards.player_id AND player.game_id=p_game_id
              AND player.current_decision='stay' AND coalesce(player.decision_locked,false)
         );
    END IF;
  END IF;

  v_next_round:=CASE p_round_number WHEN 1 THEN 2 WHEN 2 THEN 3 ELSE 1 END;
  v_result:=jsonb_build_object(
    'outcome',v_outcome,'deduped',false,'winner_player_id',v_winner_id,'message',v_message,
    'round_id',p_round_id,'dealer_game_id',p_dealer_game_id,'hand_number',p_hand_number,
    'round_number',p_round_number,'next_round_number',CASE WHEN v_terminal THEN NULL ELSE v_next_round END
  );
  INSERT INTO private.three_five_seven_round_resolutions(
    game_id,dealer_game_id,round_id,hand_number,round_number,outcome,winner_player_id,result,presentation_fallback_at
  ) VALUES(
    p_game_id,p_dealer_game_id,p_round_id,p_hand_number,p_round_number,v_outcome,v_winner_id,v_result,
    clock_timestamp()+CASE WHEN v_terminal THEN interval '30 seconds' ELSE interval '8 seconds' END
  );
  UPDATE public.rounds SET status='completed' WHERE id=p_round_id;

  IF v_terminal THEN
    SELECT public.three_five_seven_settle_game(p_game_id,p_round_id,p_dealer_game_id,p_hand_number) INTO v_settlement;
    v_result:=v_result||jsonb_build_object('settlement',v_settlement);
  ELSE
    UPDATE public.games SET awaiting_next_round=true,next_round_number=v_next_round,
      all_decisions_in=true,all_decisions_in_round_id=p_round_id,last_round_result=v_message
     WHERE id=p_game_id;
  END IF;
  INSERT INTO public.game_results(
    game_id,dealer_game_id,hand_number,winner_player_id,winner_username,winning_hand_description,
    pot_won,player_chip_changes,is_chopped,game_type,settlement_key
  ) VALUES(
    p_game_id,p_dealer_game_id,p_hand_number,v_winner_id,v_winner_name,v_message,0,v_changes,
    v_outcome='tie','357','three_five_seven_round:'||p_round_id::text
  ) ON CONFLICT (dealer_game_id,hand_number,settlement_key) WHERE settlement_key IS NOT NULL DO NOTHING;
  UPDATE private.three_five_seven_round_resolutions SET result=v_result
   WHERE game_id=p_game_id AND dealer_game_id=p_dealer_game_id AND round_id=p_round_id
     AND hand_number=p_hand_number AND round_number=p_round_number;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION private.three_five_seven_resolve_round(uuid,uuid,uuid,integer,integer)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.three_five_seven_submit_decision(
  p_game_id uuid,p_round_id uuid,p_dealer_game_id uuid,p_hand_number integer,p_round_number integer,
  p_player_id uuid,p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE v_round public.rounds%ROWTYPE; v_game public.games%ROWTYPE; v_player public.players%ROWTYPE; v_result jsonb;
BEGIN
  IF p_decision NOT IN ('stay','fold') THEN RAISE EXCEPTION 'three_five_seven_submit_decision:invalid_decision'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND OR v_round.game_id IS DISTINCT FROM p_game_id OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number OR v_round.round_number IS DISTINCT FROM p_round_number THEN
    RAISE EXCEPTION 'three_five_seven_submit_decision:round_identity_mismatch';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_game.current_round IS DISTINCT FROM p_round_number OR v_game.status<>'in_progress' OR v_round.status<>'betting' THEN
    RAISE EXCEPTION 'three_five_seven_submit_decision:stale_game_identity';
  END IF;
  SELECT * INTO v_player FROM public.players WHERE id=p_player_id AND game_id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_player.status IN ('left','observer') OR coalesce(v_player.sitting_out,false) THEN
    RAISE EXCEPTION 'three_five_seven_submit_decision:player_not_eligible';
  END IF;
  IF coalesce(v_player.is_bot,false) OR auth.uid() IS DISTINCT FROM v_player.user_id THEN
    RAISE EXCEPTION 'three_five_seven_submit_decision:not_player_owner';
  END IF;
  IF coalesce(v_player.decision_locked,false) THEN
    IF v_player.current_decision=p_decision THEN
      RETURN jsonb_build_object('outcome','already_decided','deduped',true,'decision',p_decision);
    END IF;
    RAISE EXCEPTION 'three_five_seven_submit_decision:decision_already_locked';
  END IF;
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.players SET current_decision=p_decision,decision_locked=true WHERE id=p_player_id;
  v_result:=private.three_five_seven_resolve_round(p_game_id,p_round_id,p_dealer_game_id,p_hand_number,p_round_number);
  RETURN jsonb_build_object('outcome','decision_committed','decision',p_decision,'resolution',v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.three_five_seven_submit_decision(uuid,uuid,uuid,integer,integer,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.three_five_seven_submit_decision(uuid,uuid,uuid,integer,integer,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.three_five_seven_expire_round(
  p_game_id uuid,p_round_id uuid,p_dealer_game_id uuid,p_hand_number integer,p_round_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE v_round public.rounds%ROWTYPE; v_game public.games%ROWTYPE; v_result jsonb;
BEGIN
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN RAISE EXCEPTION 'three_five_seven_expire_round:not_in_session'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND OR v_round.game_id IS DISTINCT FROM p_game_id OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number OR v_round.round_number IS DISTINCT FROM p_round_number THEN
    RAISE EXCEPTION 'three_five_seven_expire_round:round_identity_mismatch';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR v_game.status<>'in_progress' OR v_round.status<>'betting' THEN
    RAISE EXCEPTION 'three_five_seven_expire_round:stale_game_identity';
  END IF;
  IF NOT coalesce(v_game.timeout_enforcement_enabled,true) OR coalesce(v_game.timeout_action,'auto_fold')<>'auto_fold'
     OR v_round.decision_deadline IS NULL OR v_round.decision_deadline>clock_timestamp() THEN
    RETURN jsonb_build_object('outcome','not_due','deduped',false);
  END IF;
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.players SET current_decision='fold',decision_locked=true
   WHERE game_id=p_game_id AND status NOT IN ('left','observer') AND NOT coalesce(sitting_out,false)
     AND NOT coalesce(decision_locked,false);
  v_result:=private.three_five_seven_resolve_round(p_game_id,p_round_id,p_dealer_game_id,p_hand_number,p_round_number);
  RETURN jsonb_build_object('outcome','expired','resolution',v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.three_five_seven_expire_round(uuid,uuid,uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.three_five_seven_expire_round(uuid,uuid,uuid,integer,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.three_five_seven_reveal_terminal_cards(
  p_game_id uuid,p_round_id uuid,p_dealer_game_id uuid,p_hand_number integer,p_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE v_round public.rounds%ROWTYPE; v_game public.games%ROWTYPE; v_resolution private.three_five_seven_round_resolutions%ROWTYPE; v_player public.players%ROWTYPE;
BEGIN
  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND OR v_round.game_id IS DISTINCT FROM p_game_id OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number THEN RAISE EXCEPTION 'three_five_seven_reveal_terminal_cards:round_identity_mismatch'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_game.status NOT IN ('game_over','session_ended') THEN RAISE EXCEPTION 'three_five_seven_reveal_terminal_cards:stale_game_identity'; END IF;
  SELECT * INTO v_resolution FROM private.three_five_seven_round_resolutions resolution
   WHERE resolution.game_id=p_game_id AND resolution.dealer_game_id=p_dealer_game_id
     AND resolution.round_id=p_round_id AND resolution.hand_number=p_hand_number
     AND resolution.outcome IN ('terminal','instant_sweep') FOR UPDATE;
  IF NOT FOUND OR v_resolution.winner_player_id IS DISTINCT FROM p_player_id THEN
    RAISE EXCEPTION 'three_five_seven_reveal_terminal_cards:not_terminal_winner';
  END IF;
  SELECT * INTO v_player FROM public.players WHERE id=p_player_id AND game_id=p_game_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS DISTINCT FROM v_player.user_id THEN
    RAISE EXCEPTION 'three_five_seven_reveal_terminal_cards:not_player_owner';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.game_results result WHERE result.game_id=p_game_id
    AND result.dealer_game_id=p_dealer_game_id AND result.hand_number=p_hand_number
    AND result.settlement_key='three_five_seven_terminal' AND result.winner_player_id=p_player_id) THEN
    RAISE EXCEPTION 'three_five_seven_reveal_terminal_cards:settlement_not_committed';
  END IF;
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.player_cards SET is_public=true WHERE round_id=p_round_id AND player_id=p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'three_five_seven_reveal_terminal_cards:cards_not_found'; END IF;
  RETURN jsonb_build_object('outcome','revealed','round_id',p_round_id,'dealer_game_id',p_dealer_game_id,'hand_number',p_hand_number,'player_id',p_player_id);
END;
$$;

REVOKE ALL ON FUNCTION public.three_five_seven_reveal_terminal_cards(uuid,uuid,uuid,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.three_five_seven_reveal_terminal_cards(uuid,uuid,uuid,integer,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.three_five_seven_advance_postgame(
  p_game_id uuid,p_round_id uuid,p_dealer_game_id uuid,p_hand_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE; v_game public.games%ROWTYPE; v_claim private.three_five_seven_postgame_advances%ROWTYPE;
  v_resolution private.three_five_seven_round_resolutions%ROWTYPE; v_winner public.players%ROWTYPE;
  v_winner_id uuid; v_settlements integer; v_active integer; v_humans integer; v_dealers integer;
  v_allow_bots boolean:=false; v_make_take boolean:=false; v_positions integer[]; v_index integer;
  v_next_position integer; v_target text; v_deadline timestamptz; v_result jsonb;
BEGIN
  IF p_game_id IS NULL OR p_round_id IS NULL OR p_dealer_game_id IS NULL OR p_hand_number<1 THEN
    RAISE EXCEPTION 'three_five_seven_advance_postgame:missing_identity';
  END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND OR v_round.game_id IS DISTINCT FROM p_game_id OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number THEN
    RAISE EXCEPTION 'three_five_seven_advance_postgame:round_identity_mismatch';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'three_five_seven_advance_postgame:game_not_found'; END IF;
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN
    RAISE EXCEPTION 'three_five_seven_advance_postgame:not_in_session';
  END IF;
  SELECT * INTO v_claim FROM private.three_five_seven_postgame_advances claim
   WHERE claim.game_id=p_game_id AND claim.dealer_game_id=p_dealer_game_id
     AND claim.round_id=p_round_id AND claim.hand_number=p_hand_number;
  IF FOUND THEN RETURN v_claim.result||jsonb_build_object('deduped',true,'outcome','already_advanced'); END IF;
  IF v_game.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN
    RETURN jsonb_build_object(
      'outcome','stale_identity','deduped',true,'status',v_game.status,
      'current_dealer_game_id',v_game.current_game_uuid,'current_hand_number',v_game.total_hands
    );
  END IF;
  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_game.status NOT IN ('game_over','session_ended') THEN
    RETURN jsonb_build_object(
      'outcome','stale_identity','deduped',true,'status',v_game.status,
      'current_dealer_game_id',v_game.current_game_uuid,'current_hand_number',v_game.total_hands
    );
  END IF;
  SELECT * INTO v_resolution FROM private.three_five_seven_round_resolutions resolution
   WHERE resolution.game_id=p_game_id AND resolution.dealer_game_id=p_dealer_game_id
     AND resolution.round_id=p_round_id AND resolution.hand_number=p_hand_number
     AND resolution.outcome IN ('terminal','instant_sweep');
  IF NOT FOUND OR v_round.status<>'completed' OR v_resolution.winner_player_id IS NULL THEN
    RAISE EXCEPTION 'three_five_seven_advance_postgame:terminal_resolution_missing';
  END IF;
  v_winner_id:=v_resolution.winner_player_id;
  SELECT count(*) INTO v_settlements FROM public.game_results result
   WHERE result.game_id=p_game_id AND result.dealer_game_id=p_dealer_game_id
     AND result.hand_number=p_hand_number AND result.settlement_key='three_five_seven_terminal'
     AND result.winner_player_id=v_winner_id;
  IF v_settlements<>1 THEN RAISE EXCEPTION 'three_five_seven_advance_postgame:settlement_not_committed:%',v_settlements; END IF;
  SELECT * INTO v_winner FROM public.players WHERE id=v_winner_id AND game_id=p_game_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'three_five_seven_advance_postgame:winner_not_in_session'; END IF;

  SELECT count(*) FILTER(WHERE NOT coalesce(player.sitting_out,false) AND player.status NOT IN ('observer','left') AND player.position IS NOT NULL),
         count(*) FILTER(WHERE NOT coalesce(player.sitting_out,false) AND player.status NOT IN ('observer','left') AND player.position IS NOT NULL AND NOT coalesce(player.is_bot,false))
    INTO v_active,v_humans FROM public.players player WHERE player.game_id=p_game_id;
  IF v_game.status='session_ended' OR v_humans=0 THEN v_target:='session_ended';
  ELSIF v_active<2 THEN v_target:='waiting';
  ELSE
    SELECT coalesce(defaults.allow_bot_dealers,false) INTO v_allow_bots
      FROM public.game_defaults defaults WHERE defaults.game_type='holm' LIMIT 1;
    v_allow_bots:=coalesce(v_allow_bots,false);
    SELECT coalesce((setting.value->>'enabled')::boolean,false) INTO v_make_take
      FROM public.system_settings setting WHERE setting.key='make_it_take_it' LIMIT 1;
    v_make_take:=coalesce(v_make_take,false);
    IF v_make_take AND NOT coalesce(v_winner.is_bot,false) AND NOT coalesce(v_winner.sitting_out,false)
       AND v_winner.status NOT IN ('observer','left') THEN v_next_position:=v_winner.position; END IF;
    IF v_next_position IS NULL THEN
      SELECT array_agg(player.position ORDER BY player.position) INTO v_positions
        FROM public.players player WHERE player.game_id=p_game_id AND NOT coalesce(player.sitting_out,false)
         AND player.status NOT IN ('observer','left') AND player.position IS NOT NULL
         AND (v_allow_bots OR NOT coalesce(player.is_bot,false));
      IF coalesce(cardinality(v_positions),0)=0 THEN v_target:='dealer_selection';
      ELSE
        v_index:=array_position(v_positions,coalesce(v_game.dealer_position,1));
        v_next_position:=CASE WHEN v_index IS NULL THEN v_positions[1]
          ELSE v_positions[(v_index%cardinality(v_positions))+1] END;
      END IF;
    END IF;
    IF v_target IS NULL THEN
      v_target:='game_selection';
      v_deadline:=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(v_game.game_setup_timer_seconds,30)));
    END IF;
  END IF;

  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.rounds SET status='completed'
   WHERE game_id=p_game_id AND dealer_game_id=p_dealer_game_id AND status<>'completed';
  UPDATE public.players SET auto_fold=false,current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,
    ante_decision=NULL,sit_out_next_hand=false,stand_up_next_hand=false,legs=0
   WHERE game_id=p_game_id AND status NOT IN ('observer','left');
  UPDATE public.games SET
    status=v_target,config_complete=false,config_deadline=v_deadline,last_round_result=NULL,
    current_round=NULL,awaiting_next_round=false,next_round_number=NULL,pot=0,
    all_decisions_in=false,all_decisions_in_round_id=NULL,game_over_at=NULL,
    buck_position=NULL,total_hands=0,is_first_hand=false,current_game_uuid=NULL,
    dealer_selection_state=NULL,dealer_position=CASE WHEN v_target='game_selection' THEN v_next_position ELSE dealer_position END,
    session_ended_at=CASE WHEN v_target='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END
   WHERE id=p_game_id;
  v_result:=jsonb_build_object(
    'outcome','advanced','deduped',false,'status',v_target,
    'dealer_position',CASE WHEN v_target='game_selection' THEN v_next_position ELSE NULL END,
    'config_deadline',v_deadline
  );
  INSERT INTO private.three_five_seven_postgame_advances(
    game_id,dealer_game_id,round_id,hand_number,winner_player_id,target_status,dealer_position,config_deadline,result
  ) VALUES(p_game_id,p_dealer_game_id,p_round_id,p_hand_number,v_winner_id,v_target,
    CASE WHEN v_target='game_selection' THEN v_next_position END,v_deadline,v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.three_five_seven_advance_postgame(uuid,uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.three_five_seven_advance_postgame(uuid,uuid,uuid,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.three_five_seven_recover_game(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_game public.games%ROWTYPE; v_round public.rounds%ROWTYPE; v_resolution private.three_five_seven_round_resolutions%ROWTYPE;
  v_eligible integer; v_ready integer; v_fold_probability integer:=30; v_result jsonb;
BEGIN
  PERFORM set_config('app.three_five_seven_recovery','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN
    RETURN jsonb_build_object('outcome','not_357');
  END IF;
  IF coalesce(v_game.is_paused,false) THEN RETURN jsonb_build_object('outcome','paused'); END IF;

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
      SELECT coalesce(defaults.bot_fold_probability,30) INTO v_fold_probability
        FROM public.game_defaults defaults WHERE defaults.game_type='3-5-7' LIMIT 1;
      UPDATE public.players SET current_decision=CASE WHEN random()*100<coalesce(v_fold_probability,30) THEN 'fold' ELSE 'stay' END,
        decision_locked=true
       WHERE game_id=p_game_id AND coalesce(is_bot,false) AND status NOT IN ('left','observer')
         AND NOT coalesce(sitting_out,false) AND NOT coalesce(decision_locked,false);
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
$$;

REVOKE ALL ON FUNCTION private.three_five_seven_recover_game(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.three_five_seven_recover_game(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.three_five_seven_recover_game(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private
AS $$
BEGIN
  IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'three_five_seven_recover_game:service_role_required'; END IF;
  RETURN private.three_five_seven_recover_game(p_game_id);
END;
$$;
REVOKE ALL ON FUNCTION public.three_five_seven_recover_game(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.three_five_seven_recover_game(uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.advance_due_three_five_seven_state()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private
AS $$
DECLARE v_game record; v_result jsonb; v_results jsonb:='[]'::jsonb; v_scope uuid;
BEGIN
  PERFORM set_config('app.three_five_seven_recovery','on',true);
  BEGIN
    v_scope:=nullif(current_setting('app.three_five_seven_recovery_game_id',true),'')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'advance_due_three_five_seven_state:invalid_recovery_scope';
  END;
  FOR v_game IN SELECT id FROM public.games
    WHERE game_type IN ('3-5-7','3-5-7-game','357')
      AND status IN ('ante_decision','in_progress','game_over','session_ended')
      AND (v_scope IS NULL OR id=v_scope)
    ORDER BY id
  LOOP
    v_result:=private.three_five_seven_recover_game(v_game.id);
    v_results:=v_results||jsonb_build_array(jsonb_build_object('game_id',v_game.id,'result',v_result));
  END LOOP;
  RETURN jsonb_build_object('outcome','recovered','games',v_results);
END;
$$;

REVOKE ALL ON FUNCTION private.advance_due_three_five_seven_state() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.advance_due_three_five_seven_state() TO service_role;

DO $schedule_three_five_seven_recovery$
DECLARE v_job record;
BEGIN
  FOR v_job IN SELECT jobid FROM cron.job WHERE jobname='advance-due-three-five-seven-state-1s' LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;
  PERFORM cron.schedule(
    'advance-due-three-five-seven-state-1s','1 second',
    $cron$SELECT private.advance_due_three_five_seven_state();$cron$
  );
END;
$schedule_three_five_seven_recovery$;

COMMENT ON FUNCTION public.three_five_seven_begin_game(uuid) IS
  'Atomically validates 3-5-7 admission/antes, commits the opening deal, and returns the committed exact result.';
COMMENT ON FUNCTION private.advance_due_three_five_seven_state() IS
  'Complete disconnect-safe 3-5-7 recovery owner for bootstrap, bots, deadlines, continuation, and terminal handoff.';
