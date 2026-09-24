-- Server-owned 3-5-7 disclosure boundary. No settlement/rule calculations change.
-- Deploy only after qualification; old clients need the companion safe-frame update.
BEGIN;

CREATE TABLE private.three_five_seven_decision_snapshots (
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  dealer_game_id uuid NOT NULL,
  round_id uuid PRIMARY KEY REFERENCES public.rounds(id) ON DELETE CASCADE,
  hand_number integer NOT NULL,
  round_number integer NOT NULL,
  decisions jsonb NOT NULL CHECK (jsonb_typeof(decisions)='object'),
  game_before jsonb NOT NULL,
  round_before jsonb NOT NULL,
  players_before jsonb NOT NULL,
  initial_drop_at timestamptz NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(game_id,dealer_game_id,round_id,hand_number,round_number)
);
ALTER TABLE private.three_five_seven_decision_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.three_five_seven_decision_snapshots FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.three_five_seven_snapshot_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'three_five_seven_snapshot:immutable'; END $$;
REVOKE ALL ON FUNCTION private.three_five_seven_snapshot_immutable() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER three_five_seven_snapshot_immutable BEFORE UPDATE
ON private.three_five_seven_decision_snapshots FOR EACH ROW
EXECUTE FUNCTION private.three_five_seven_snapshot_immutable();

-- Decisions remain immutable. This separate monotonic latch prevents pause/resume
-- from concealing information that was already eligible for disclosure.
CREATE TABLE private.three_five_seven_disclosed_rounds (
  round_id uuid PRIMARY KEY REFERENCES public.rounds(id) ON DELETE CASCADE,
  disclosed_at timestamptz NOT NULL
);
ALTER TABLE private.three_five_seven_disclosed_rounds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.three_five_seven_disclosed_rounds FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.three_five_seven_round_concealed(p_round_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='pg_catalog','public','private' AS $$
DECLARE r public.rounds%ROWTYPE; g public.games%ROWTYPE; c private.three_five_seven_round_resolutions%ROWTYPE; w jsonb;
BEGIN
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id;
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dealer_games WHERE id=r.dealer_game_id AND game_type IN('3-5-7','3-5-7-game','357')) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM private.three_five_seven_disclosed_rounds WHERE round_id=r.id) THEN RETURN false; END IF;
 SELECT * INTO c FROM private.three_five_seven_round_resolutions WHERE round_id=r.id
 AND game_id=r.game_id AND dealer_game_id=r.dealer_game_id AND hand_number=r.hand_number AND round_number=r.round_number;
 IF NOT FOUND THEN RETURN true; END IF;
 IF c.outcome='instant_sweep' THEN RETURN false; END IF;
 w:=private.three_five_seven_decision_reveal(r.game_id,r.dealer_game_id,r.id,r.hand_number,r.round_number);
 IF w IS NULL THEN RETURN true; END IF;
 SELECT * INTO g FROM public.games WHERE id=r.game_id;
 IF coalesce(g.is_paused,false) AND g.timer_paused_at < (w->>'drop_at')::timestamptz THEN RETURN true; END IF;
 RETURN clock_timestamp() < (w->>'drop_at')::timestamptz;
END $$;
REVOKE ALL ON FUNCTION private.three_five_seven_round_concealed(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.three_five_seven_hidden_round(p_game_id uuid,p_resolved_only boolean DEFAULT false)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
 SELECT r.id FROM public.games g JOIN public.rounds r
 ON r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands AND r.round_number=g.current_round
 WHERE g.id=p_game_id AND g.game_type IN('3-5-7','3-5-7-game','357')
 AND private.three_five_seven_round_concealed(r.id)
 AND (NOT p_resolved_only OR EXISTS(SELECT 1 FROM private.three_five_seven_round_resolutions c WHERE c.round_id=r.id))
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION private.three_five_seven_hidden_round(uuid,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.three_five_seven_latch_disclosure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
BEGIN
 IF NOT coalesce(OLD.is_paused,false) AND coalesce(NEW.is_paused,false) THEN
   INSERT INTO private.three_five_seven_disclosed_rounds(round_id,disclosed_at)
   SELECT s.round_id,clock_timestamp() FROM private.three_five_seven_decision_snapshots s
   WHERE s.game_id=OLD.id AND NOT private.three_five_seven_round_concealed(s.round_id)
   ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.three_five_seven_latch_disclosure() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER three_five_seven_latch_disclosure BEFORE UPDATE OF is_paused ON public.games
FOR EACH ROW EXECUTE FUNCTION private.three_five_seven_latch_disclosure();

-- Policy helpers return only visibility, never a decision or an outcome.
CREATE FUNCTION public.three_five_seven_row_visible(p_game_id uuid,p_resolved_only boolean DEFAULT true)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='pg_catalog','private' AS $$
 SELECT private.three_five_seven_hidden_round(p_game_id,p_resolved_only) IS NULL
$$;
REVOKE ALL ON FUNCTION public.three_five_seven_row_visible(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.three_five_seven_row_visible(uuid,boolean) TO anon,authenticated,service_role;
CREATE FUNCTION public.three_five_seven_round_visible(p_round_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='pg_catalog','private' AS $$
 SELECT NOT private.three_five_seven_round_concealed(p_round_id)
$$;
REVOKE ALL ON FUNCTION public.three_five_seven_round_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.three_five_seven_round_visible(uuid) TO anon,authenticated,service_role;

CREATE POLICY three_five_seven_conceal_players ON public.players AS RESTRICTIVE FOR SELECT TO anon,authenticated
USING (public.three_five_seven_row_visible(game_id,false) OR (user_id=auth.uid() AND public.three_five_seven_row_visible(game_id,true)));
CREATE POLICY three_five_seven_conceal_games ON public.games AS RESTRICTIVE FOR SELECT TO anon,authenticated
USING (public.three_five_seven_row_visible(id,true));
CREATE POLICY three_five_seven_conceal_rounds ON public.rounds AS RESTRICTIVE FOR SELECT TO anon,authenticated
USING (public.three_five_seven_row_visible(game_id,true));
CREATE POLICY three_five_seven_conceal_actions ON public.player_actions AS RESTRICTIVE FOR SELECT TO anon,authenticated
USING (public.three_five_seven_round_visible(round_id));
CREATE FUNCTION public.three_five_seven_owns_cards(p_player_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='pg_catalog','public' AS $$
 SELECT EXISTS(SELECT 1 FROM public.players WHERE id=p_player_id AND user_id=auth.uid())
$$;
REVOKE ALL ON FUNCTION public.three_five_seven_owns_cards(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.three_five_seven_owns_cards(uuid) TO anon,authenticated,service_role;
CREATE POLICY three_five_seven_conceal_cards ON public.player_cards AS RESTRICTIVE FOR SELECT TO anon,authenticated
USING (public.three_five_seven_round_visible(round_id) OR public.three_five_seven_owns_cards(player_id));

-- Outcome-bearing public rows are unreadable only during the resolved, unreleased interval.
DO $policies$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['game_results','gameplay_transfer_batches','gameplay_transfer_pending_changes','session_player_snapshots'] LOOP
  EXECUTE format('CREATE POLICY three_five_seven_conceal ON public.%I AS RESTRICTIVE FOR SELECT TO anon,authenticated USING (public.three_five_seven_row_visible(game_id,true))',t);
 END LOOP;
 -- Diagnostic/action material can contain a decision even before resolution.
 FOREACH t IN ARRAY ARRAY['debug_events','debug_sync_events','game_state_debug_log','session_events','network_sim_events','client_runtime_events','client_runtime_incidents','chat_message_diagnostic_events','chat_operation_reports','chat_send_operations','voice_operation_reports'] LOOP
  IF to_regclass('public.'||t) IS NOT NULL THEN
   EXECUTE format('CREATE POLICY three_five_seven_conceal ON public.%I AS RESTRICTIVE FOR SELECT TO anon,authenticated USING (public.three_five_seven_row_visible(game_id,false))',t);
  END IF;
 END LOOP;
END $policies$;
CREATE POLICY three_five_seven_conceal_transactions ON public.player_transactions AS RESTRICTIVE FOR SELECT TO anon,authenticated
USING(public.three_five_seven_row_visible(source_game_id,true));
CREATE POLICY three_five_seven_conceal_dealers ON public.dealer_games AS RESTRICTIVE FOR SELECT TO anon,authenticated
USING(public.three_five_seven_row_visible(session_id,true));

CREATE TABLE public.three_five_seven_frame_notices (
 game_id uuid PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
 round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
 version bigint NOT NULL DEFAULT 1
);
ALTER TABLE public.three_five_seven_frame_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.three_five_seven_frame_notices FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.three_five_seven_frame_notices TO authenticated;
CREATE POLICY three_five_seven_frame_notice_member ON public.three_five_seven_frame_notices
FOR SELECT TO authenticated USING(public.user_is_in_game(game_id));
-- One decision notification per lock, independent of the choice and settlement write count.
CREATE OR REPLACE FUNCTION private.three_five_seven_notify_frame() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
DECLARE r uuid; g uuid;
BEGIN
 IF TG_TABLE_NAME='players' THEN
  IF coalesce(OLD.decision_locked,false) OR NOT coalesce(NEW.decision_locked,false) THEN RETURN NEW; END IF;
  g:=NEW.game_id;
  SELECT round_row.id INTO r FROM public.rounds round_row JOIN public.games game_row ON game_row.id=round_row.game_id
  WHERE game_row.id=g AND game_row.game_type IN('3-5-7','3-5-7-game','357')
  AND round_row.dealer_game_id=game_row.current_game_uuid AND round_row.hand_number=game_row.total_hands AND round_row.round_number=game_row.current_round;
 ELSIF TG_TABLE_NAME='games' THEN
  IF OLD.is_paused IS NOT DISTINCT FROM NEW.is_paused OR NOT private.three_five_seven_is_game(NEW.id) THEN RETURN NEW; END IF;
  g:=NEW.id;
  SELECT id INTO r FROM public.rounds WHERE game_id=g AND dealer_game_id=NEW.current_game_uuid AND hand_number=NEW.total_hands AND round_number=NEW.current_round;
 ELSE
  g:=NEW.game_id; r:=NEW.id;
  IF NOT private.three_five_seven_is_game(g) THEN RETURN NEW; END IF;
 END IF;
 IF r IS NOT NULL THEN
  INSERT INTO public.three_five_seven_frame_notices(game_id,round_id) VALUES(g,r)
  ON CONFLICT(game_id) DO UPDATE SET round_id=excluded.round_id,version=three_five_seven_frame_notices.version+1;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.three_five_seven_notify_frame() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER three_five_seven_notify_decision AFTER UPDATE OF decision_locked ON public.players
FOR EACH ROW EXECUTE FUNCTION private.three_five_seven_notify_frame();
CREATE TRIGGER three_five_seven_notify_round AFTER INSERT ON public.rounds
FOR EACH ROW EXECUTE FUNCTION private.three_five_seven_notify_frame();
CREATE TRIGGER three_five_seven_notify_pause AFTER UPDATE OF is_paused ON public.games
FOR EACH ROW EXECUTE FUNCTION private.three_five_seven_notify_frame();
ALTER PUBLICATION supabase_realtime ADD TABLE public.three_five_seven_frame_notices;

CREATE OR REPLACE FUNCTION private.three_five_seven_raw_frame(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_round public.rounds%ROWTYPE;
  v_players jsonb := '[]'::jsonb;
  v_cards jsonb := '[]'::jsonb;
  v_viewer public.players%ROWTYPE;
  v_is_privileged boolean := false;
  v_viewer_cards_required boolean := false;
  v_viewer_cards_present boolean := false;
  v_opening_charge_exists boolean := false;
BEGIN
  IF p_game_id IS NULL THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:missing_game_id';
  END IF;
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:not_in_session';
  END IF;

  SELECT * INTO v_game FROM public.games game_row WHERE game_row.id = p_game_id;
  IF NOT FOUND OR v_game.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:not_357_game';
  END IF;

  IF (
       v_game.status = 'game_over'
       OR (
         v_game.status = 'session_ended'
         AND (
           v_game.current_game_uuid IS NOT NULL
           OR coalesce(v_game.total_hands, 0) > 0
           OR v_game.current_round IS NOT NULL
         )
       )
     )
     AND (
       v_game.current_game_uuid IS NULL
       OR coalesce(v_game.total_hands, 0) < 1
       OR v_game.current_round IS NULL
     ) THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:terminal_round_identity_missing';
  END IF;

  IF v_game.current_game_uuid IS NOT NULL
     AND v_game.total_hands IS NOT NULL
     AND v_game.current_round IS NOT NULL THEN
    SELECT * INTO v_round
      FROM public.rounds round_row
     WHERE round_row.game_id = p_game_id
       AND round_row.dealer_game_id = v_game.current_game_uuid
       AND round_row.hand_number = v_game.total_hands
       AND round_row.round_number = v_game.current_round;
  END IF;

  IF v_game.status IN ('in_progress','game_over','session_ended')
     AND v_game.current_game_uuid IS NOT NULL
     AND v_game.total_hands IS NOT NULL
     AND v_game.current_round IS NOT NULL
     AND v_round.id IS NULL THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:exact_round_missing';
  END IF;

  IF v_round.id IS NOT NULL AND v_round.round_number = 1 THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.game_results charge_result
       WHERE charge_result.game_id = v_round.game_id
         AND charge_result.dealer_game_id = v_round.dealer_game_id
         AND charge_result.hand_number = v_round.hand_number
         AND charge_result.settlement_key = 'three_five_seven_charge:' || v_round.id::text
    ) INTO v_opening_charge_exists;
    IF v_opening_charge_exists
       AND v_round.three_five_seven_opening_transfer_cursor IS NULL THEN
      RAISE EXCEPTION 'three_five_seven_current_frame:opening_transfer_claim_missing';
    END IF;
    IF NOT v_opening_charge_exists
       AND v_round.three_five_seven_opening_transfer_cursor IS NOT NULL THEN
      RAISE EXCEPTION 'three_five_seven_current_frame:unexpected_opening_transfer_claim';
    END IF;
    IF v_round.three_five_seven_opening_transfer_cursor IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.gameplay_transfer_batches batch
          WHERE batch.game_id = v_round.game_id
            AND batch.dealer_game_id IS NOT DISTINCT FROM v_round.dealer_game_id
            AND batch.cursor = v_round.three_five_seven_opening_transfer_cursor
            AND batch.reason = 'ante'
       ) THEN
      RAISE EXCEPTION 'three_five_seven_current_frame:opening_transfer_claim_mismatch';
    END IF;
  END IF;

  SELECT participant.* INTO v_viewer
    FROM public.players participant
   WHERE participant.game_id = p_game_id
     AND participant.user_id = auth.uid()
     AND participant.status <> 'left'
   ORDER BY participant.created_at, participant.id
   LIMIT 1;

  v_is_privileged := coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::public.app_role));

  SELECT coalesce(
    jsonb_agg(
      to_jsonb(participant) || jsonb_build_object(
        'profiles', CASE WHEN profile.id IS NULL THEN NULL
          ELSE jsonb_build_object('username', profile.username) END
      ) ORDER BY participant.position, participant.id
    ), '[]'::jsonb
  ) INTO v_players
    FROM public.players participant
    LEFT JOIN public.profiles profile ON profile.id = participant.user_id
   WHERE participant.game_id = p_game_id
     AND participant.status <> 'left';

  IF v_round.id IS NOT NULL THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object('player_id', cards.player_id, 'cards', cards.cards)
        ORDER BY cards.player_id
      ), '[]'::jsonb
    ) INTO v_cards
      FROM public.player_cards cards
      JOIN public.players owner
        ON owner.id = cards.player_id
       AND owner.game_id = p_game_id
     WHERE cards.round_id = v_round.id
       AND (
         coalesce(cards.is_public, false)
         OR owner.user_id = auth.uid()
         OR v_is_privileged
       );

    v_viewer_cards_required := v_viewer.id IS NOT NULL
      AND v_viewer.status NOT IN ('left','observer')
      AND NOT coalesce(v_viewer.sitting_out, false)
      AND NOT coalesce(v_viewer.is_bot, false);
    v_viewer_cards_present := v_viewer.id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.player_cards cards
       WHERE cards.round_id = v_round.id AND cards.player_id = v_viewer.id
    );
    IF v_viewer_cards_required AND NOT v_viewer_cards_present THEN
      RAISE EXCEPTION 'three_five_seven_current_frame:viewer_cards_missing';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'game', to_jsonb(v_game)||jsonb_build_object('_authorityRevision',private.session_authority_revision(p_game_id)),
    'round', CASE WHEN v_round.id IS NULL THEN NULL ELSE
      to_jsonb(v_round) || jsonb_build_object(
        'three_five_seven_opening_transfer_required', v_opening_charge_exists
      )
    END,
    'players', v_players,
    'player_cards', v_cards,
    'viewer_player_id', v_viewer.id,
    'viewer_cards_required', v_viewer_cards_required,
    'viewer_cards_present', v_viewer_cards_present,
    'decision_reveal', private.three_five_seven_decision_reveal(
      p_game_id, v_game.current_game_uuid, v_round.id,
      v_game.total_hands, v_game.current_round
    ),
    'server_now', statement_timestamp(),
    'identity', jsonb_build_object(
      'dealer_game_id', v_game.current_game_uuid,
      'hand_number', v_game.total_hands,
      'round_number', v_game.current_round,
      'round_id', v_round.id,
      'opening_transfer_required', v_opening_charge_exists,
      'opening_transfer_cursor', v_round.three_five_seven_opening_transfer_cursor,
      'chip_transfer_cursor', coalesce(v_game.chip_transfer_cursor, 0)
    )
  );
END;
$function$
;
REVOKE ALL ON FUNCTION private.three_five_seven_raw_frame(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.three_five_seven_settle_core(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_hand_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
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
$function$
;
REVOKE ALL ON FUNCTION private.three_five_seven_settle_core(uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.three_five_seven_resolve_round(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_hand_number integer, p_round_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE; v_game public.games%ROWTYPE; v_claim private.three_five_seven_round_resolutions%ROWTYPE;
  v_player public.players%ROWTYPE; v_stayer public.players%ROWTYPE; v_stayers integer; v_eligible integer; v_locked integer;
  v_score jsonb; v_top_score bigint:=-1; v_top_count integer:=0; v_top_label text; v_winner_id uuid; v_winner_name text;
  v_outcome text; v_message text; v_next_round integer; v_transfer jsonb:='[]'::jsonb; v_changes jsonb:='{}'::jsonb;
  v_amount integer:=0; v_result jsonb; v_settlement jsonb; v_new_legs integer; v_terminal boolean:=false;
  v_presentation_cursor integer;
  v_private_players jsonb; v_private_decisions jsonb; v_private_game jsonb;
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
  -- Capture before any financial or lifecycle mutation; insertion remains in this transaction.
  SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('profiles',jsonb_build_object('username',pr.username)) ORDER BY p.position,p.id),
    jsonb_object_agg(p.id::text,p.current_decision) FILTER (WHERE p.status NOT IN('left','observer') AND NOT coalesce(p.sitting_out,false))
  INTO v_private_players,v_private_decisions FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id
  WHERE p.game_id=p_game_id AND p.status<>'left';
  v_private_game:=to_jsonb(v_game)||jsonb_build_object('_authorityRevision',private.session_authority_revision(p_game_id));
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
      EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE';
      EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED';
      SELECT game.chip_transfer_cursor INTO v_presentation_cursor
        FROM public.games game
       WHERE game.id=p_game_id;
      IF coalesce(v_presentation_cursor,0)<=0 THEN
        RAISE EXCEPTION 'three_five_seven_resolve_round:pussy_tax_batch_missing';
      END IF;
    END IF;
  ELSIF v_stayers=1 THEN
    SELECT * INTO v_stayer FROM public.players player
     WHERE player.game_id=p_game_id AND player.current_decision='stay' AND coalesce(player.decision_locked,false)
       AND player.status NOT IN ('left','observer') AND NOT coalesce(player.sitting_out,false) FOR UPDATE;
    v_winner_id:=v_stayer.id; v_amount:=greatest(0,coalesce(v_game.leg_value,1));
    IF v_amount>0 THEN
      PERFORM set_config('ptown.chip_transfer_reason','leg',true);
      UPDATE public.players
         SET chips=chips-v_amount,
             legs=coalesce(legs,0)+1
       WHERE id=v_winner_id
         AND game_id=p_game_id
       RETURNING legs INTO v_new_legs;
      v_changes:=jsonb_set(v_changes,ARRAY[v_winner_id::text],to_jsonb(-v_amount),true);
    ELSE
      UPDATE public.players
         SET legs=coalesce(legs,0)+1
       WHERE id=v_winner_id
         AND game_id=p_game_id
       RETURNING legs INTO v_new_legs;
    END IF;
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
  IF v_outcome='all_fold' THEN
    v_result:=v_result||jsonb_build_object(
      'presentation_kind','pussy_tax',
      'presentation_transfer_cursor',v_presentation_cursor
    );
  END IF;
  INSERT INTO private.three_five_seven_round_resolutions(
    game_id,dealer_game_id,round_id,hand_number,round_number,outcome,winner_player_id,result,presentation_fallback_at
  ) VALUES(
    p_game_id,p_dealer_game_id,p_round_id,p_hand_number,p_round_number,v_outcome,v_winner_id,v_result,
    clock_timestamp()+CASE WHEN v_terminal THEN interval '30 seconds' ELSE interval '10 seconds' END
  );
  INSERT INTO private.three_five_seven_decision_snapshots(
    game_id,dealer_game_id,round_id,hand_number,round_number,decisions,game_before,round_before,players_before,initial_drop_at)
  VALUES(p_game_id,p_dealer_game_id,p_round_id,p_hand_number,p_round_number,
    v_private_decisions,v_private_game,to_jsonb(v_round),v_private_players,
    (private.three_five_seven_decision_reveal(p_game_id,p_dealer_game_id,p_round_id,p_hand_number,p_round_number)->>'drop_at')::timestamptz);
  UPDATE public.rounds SET status='completed' WHERE id=p_round_id;

  IF v_terminal THEN
    SELECT private.three_five_seven_settle_core(p_game_id,p_round_id,p_dealer_game_id,p_hand_number) INTO v_settlement;
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
$function$
;

CREATE FUNCTION private.three_five_seven_reveal_payload(p_game_id uuid,p_dealer_game_id uuid,p_round_id uuid,p_hand_number integer,p_round_number integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
DECLARE w jsonb; decisions jsonb;
BEGIN
 w:=private.three_five_seven_decision_reveal(p_game_id,p_dealer_game_id,p_round_id,p_hand_number,p_round_number);
 IF w IS NULL THEN RETURN NULL; END IF;
 IF NOT private.three_five_seven_round_concealed(p_round_id) THEN
  SELECT s.decisions INTO decisions FROM private.three_five_seven_decision_snapshots s
  WHERE s.game_id=p_game_id AND s.dealer_game_id=p_dealer_game_id AND s.round_id=p_round_id
  AND s.hand_number=p_hand_number AND s.round_number=p_round_number;
 END IF;
 RETURN w||jsonb_build_object('resolved_decisions',decisions);
END $$;
REVOKE ALL ON FUNCTION private.three_five_seven_reveal_payload(uuid,uuid,uuid,integer,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.three_five_seven_current_frame(p_game_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
DECLARE f jsonb; s private.three_five_seven_decision_snapshots%ROWTYPE; r uuid; hidden boolean; resolved boolean; ps jsonb;
BEGIN
 -- Original owner performs the unchanged participant/spectator and exact-identity checks.
 f:=private.three_five_seven_raw_frame(p_game_id);
 r:=(f#>>'{identity,round_id}')::uuid;
 hidden:=private.three_five_seven_round_concealed(r);
 IF hidden THEN
  SELECT * INTO s FROM private.three_five_seven_decision_snapshots WHERE round_id=r
   AND game_id=p_game_id AND dealer_game_id=(f#>>'{identity,dealer_game_id}')::uuid
   AND hand_number=(f#>>'{identity,hand_number}')::integer AND round_number=(f#>>'{identity,round_number}')::integer;
  resolved:=FOUND;
  IF resolved THEN
   f:=f||jsonb_build_object('game',s.game_before||jsonb_build_object(
     'is_paused',f#>'{game,is_paused}','timer_paused_at',f#>'{game,timer_paused_at}',
     'paused_time_remaining',f#>'{game,paused_time_remaining}','pause_version',f#>'{game,pause_version}'),'round',s.round_before||jsonb_build_object(
     'three_five_seven_opening_transfer_required',f#>'{round,three_five_seven_opening_transfer_required}'),'players',s.players_before);
   f:=jsonb_set(f,'{identity,chip_transfer_cursor}',coalesce(s.game_before->'chip_transfer_cursor','0'));
  ELSIF EXISTS(SELECT 1 FROM private.three_five_seven_round_resolutions WHERE round_id=r) THEN
   -- A pre-migration round cannot be reconstructed from already-settled values.
   RAISE EXCEPTION 'three_five_seven_current_frame:legacy_disclosure_pending';
  END IF;
  SELECT coalesce(jsonb_agg(CASE WHEN p->>'user_id'=auth.uid()::text THEN p ELSE
    p||jsonb_build_object('current_decision',NULL,'pre_fold',false,'pre_stay',false,'auto_fold',false) END),'[]')
  INTO ps FROM jsonb_array_elements(f->'players') p;
  f:=jsonb_set(f,'{players}',ps);
  -- A showdown may have made cards public inside the settled transaction. Do not publish them early.
  f:=jsonb_set(f,'{player_cards}',coalesce((SELECT jsonb_agg(c) FROM jsonb_array_elements(f->'player_cards') c
    WHERE c->>'player_id'=f->>'viewer_player_id'),'[]'));
 END IF;
 RETURN f||jsonb_build_object('decision_reveal',private.three_five_seven_reveal_payload(
   p_game_id,(f#>>'{identity,dealer_game_id}')::uuid,r,(f#>>'{identity,hand_number}')::integer,(f#>>'{identity,round_number}')::integer),
   'server_now',clock_timestamp());
END $$;

CREATE FUNCTION public.three_five_seven_read_reveal(p_game_id uuid,p_dealer_game_id uuid,p_round_id uuid,p_hand_number integer,p_round_number integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
BEGIN
 IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN RAISE EXCEPTION 'three_five_seven_read_reveal:not_in_session' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.rounds WHERE id=p_round_id AND game_id=p_game_id AND dealer_game_id=p_dealer_game_id
   AND hand_number=p_hand_number AND round_number=p_round_number) THEN RAISE EXCEPTION 'three_five_seven_read_reveal:identity_mismatch'; END IF;
 RETURN jsonb_build_object('decision_reveal',private.three_five_seven_reveal_payload(p_game_id,p_dealer_game_id,p_round_id,p_hand_number,p_round_number),'server_now',clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION public.three_five_seven_read_reveal(uuid,uuid,uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.three_five_seven_read_reveal(uuid,uuid,uuid,integer,integer) TO authenticated,service_role;

CREATE FUNCTION private.three_five_seven_safe_receipt(p_game_id uuid,p_round_id uuid,p_decision text,p_outcome text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
DECLARE f jsonb; c private.three_five_seven_round_resolutions%ROWTYPE;
BEGIN
 f:=public.three_five_seven_current_frame(p_game_id);
 IF NOT private.three_five_seven_round_concealed(p_round_id) THEN
  SELECT * INTO c FROM private.three_five_seven_round_resolutions WHERE game_id=p_game_id AND round_id=p_round_id;
 END IF;
 RETURN jsonb_build_object('outcome',p_outcome,'decision',p_decision,'resolution',c.result,
   'game',f->'game','round',f->'round','decision_reveal',f->'decision_reveal','server_now',f->'server_now');
END $$;
REVOKE ALL ON FUNCTION private.three_five_seven_safe_receipt(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.three_five_seven_submit_core(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_hand_number integer, p_round_number integer, p_player_id uuid, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_claim private.three_five_seven_round_resolutions%ROWTYPE;
  v_result jsonb;
  v_game_result jsonb;
  v_round_result jsonb;
BEGIN
  IF p_decision NOT IN ('stay','fold') THEN RAISE EXCEPTION 'three_five_seven_submit_decision:invalid_decision'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND OR v_round.game_id IS DISTINCT FROM p_game_id OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number OR v_round.round_number IS DISTINCT FROM p_round_number THEN
    RAISE EXCEPTION 'three_five_seven_submit_decision:round_identity_mismatch';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'three_five_seven_submit_decision:game_not_found'; END IF;
  SELECT * INTO v_player FROM public.players WHERE id=p_player_id AND game_id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_player.status IN ('left','observer') OR coalesce(v_player.sitting_out,false) THEN
    RAISE EXCEPTION 'three_five_seven_submit_decision:player_not_eligible';
  END IF;
  IF coalesce(v_player.is_bot,false) OR auth.uid() IS DISTINCT FROM v_player.user_id THEN
    RAISE EXCEPTION 'three_five_seven_submit_decision:not_player_owner';
  END IF;

  IF coalesce(v_player.decision_locked,false) THEN
    IF v_player.current_decision<>p_decision THEN
      RAISE EXCEPTION 'three_five_seven_submit_decision:decision_already_locked';
    END IF;
    SELECT * INTO v_claim
      FROM private.three_five_seven_round_resolutions resolution
     WHERE resolution.game_id=p_game_id
       AND resolution.dealer_game_id=p_dealer_game_id
       AND resolution.round_id=p_round_id
       AND resolution.hand_number=p_hand_number
       AND resolution.round_number=p_round_number;
    v_game_result:=jsonb_build_object(
      'id',v_game.id,'status',v_game.status,'authority_revision',v_game.authority_revision,'current_game_uuid',v_game.current_game_uuid,
      'total_hands',v_game.total_hands,'current_round',v_game.current_round,
      'awaiting_next_round',v_game.awaiting_next_round,'last_round_result',v_game.last_round_result
    );
    v_round_result:=jsonb_build_object(
      'id',v_round.id,'authority_revision',v_round.authority_revision,'dealer_game_id',v_round.dealer_game_id,
      'hand_number',v_round.hand_number,'round_number',v_round.round_number,'status',v_round.status
    );
    RETURN jsonb_build_object(
      'outcome','already_decided','deduped',true,'decision',p_decision,
      'resolution',CASE WHEN FOUND THEN v_claim.result||jsonb_build_object('deduped',true) ELSE NULL END,
      'game',v_game_result,'round',v_round_result,
      'decision_reveal',private.three_five_seven_decision_reveal(
        p_game_id,p_dealer_game_id,p_round_id,p_hand_number,p_round_number
      ),
      'server_now',statement_timestamp()
    );
  END IF;

  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_game.current_round IS DISTINCT FROM p_round_number OR v_game.status<>'in_progress' OR v_round.status<>'betting' THEN
    RAISE EXCEPTION 'three_five_seven_submit_decision:stale_game_identity';
  END IF;
  PERFORM private.assert_game_not_paused(p_game_id);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.players SET current_decision=p_decision,decision_locked=true WHERE id=p_player_id;
  v_result:=private.three_five_seven_resolve_round(p_game_id,p_round_id,p_dealer_game_id,p_hand_number,p_round_number);

  SELECT * INTO v_game FROM public.games WHERE id=p_game_id;
  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id;
  v_game_result:=jsonb_build_object(
    'id',v_game.id,'status',v_game.status,'authority_revision',v_game.authority_revision,'current_game_uuid',v_game.current_game_uuid,
    'total_hands',v_game.total_hands,'current_round',v_game.current_round,
    'awaiting_next_round',v_game.awaiting_next_round,'last_round_result',v_game.last_round_result
  );
  v_round_result:=jsonb_build_object(
    'id',v_round.id,'authority_revision',v_round.authority_revision,'dealer_game_id',v_round.dealer_game_id,
    'hand_number',v_round.hand_number,'round_number',v_round.round_number,'status',v_round.status
  );
  RETURN jsonb_build_object(
    'outcome','decision_committed','decision',p_decision,'resolution',v_result,
    'game',v_game_result,'round',v_round_result,
    'decision_reveal',private.three_five_seven_decision_reveal(
      p_game_id,p_dealer_game_id,p_round_id,p_hand_number,p_round_number
    ),
    'server_now',statement_timestamp()
  );
END;
$function$
;
REVOKE ALL ON FUNCTION private.three_five_seven_submit_core(uuid,uuid,uuid,integer,integer,uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.three_five_seven_submit_decision(p_game_id uuid,p_round_id uuid,p_dealer_game_id uuid,p_hand_number integer,p_round_number integer,p_player_id uuid,p_decision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
DECLARE original jsonb; saved text;
BEGIN
 IF p_decision NOT IN('stay','fold') OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=p_player_id AND game_id=p_game_id AND user_id=auth.uid() AND NOT coalesce(is_bot,false)) THEN
  RAISE EXCEPTION 'three_five_seven_submit_decision:not_player_owner' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.rounds WHERE id=p_round_id AND game_id=p_game_id AND dealer_game_id=p_dealer_game_id AND hand_number=p_hand_number AND round_number=p_round_number) THEN
  RAISE EXCEPTION 'three_five_seven_submit_decision:round_identity_mismatch'; END IF;
 SELECT decisions->>p_player_id::text INTO saved FROM private.three_five_seven_decision_snapshots
 WHERE game_id=p_game_id AND round_id=p_round_id AND dealer_game_id=p_dealer_game_id AND hand_number=p_hand_number AND round_number=p_round_number;
 IF FOUND THEN
  IF saved IS DISTINCT FROM p_decision THEN RAISE EXCEPTION 'three_five_seven_submit_decision:decision_already_locked'; END IF;
  RETURN private.three_five_seven_safe_receipt(p_game_id,p_round_id,p_decision,'already_decided');
 END IF;
 original:=private.three_five_seven_submit_core(p_game_id,p_round_id,p_dealer_game_id,p_hand_number,p_round_number,p_player_id,p_decision);
 RETURN private.three_five_seven_safe_receipt(p_game_id,p_round_id,p_decision,original->>'outcome');
END $$;
CREATE OR REPLACE FUNCTION public.read_session_frame(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb; frame357 jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'session_frame:authentication_required' USING ERRCODE='42501'; END IF;
 IF private.three_five_seven_is_game(p_game_id) THEN
  frame357:=public.three_five_seven_current_frame(p_game_id);
  RETURN jsonb_build_object('game',(frame357->'game')||jsonb_build_object('rounds',
    CASE WHEN frame357->'round'='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(frame357->'round') END),
    'players',frame357->'players','allow_bot_dealers',(SELECT allow_bot_dealers FROM public.game_defaults WHERE game_type='holm' LIMIT 1),
    'server_now',frame357->'server_now');
 END IF;
 SELECT jsonb_build_object(
  'game',to_jsonb(g)||jsonb_build_object('_authorityRevision',private.session_authority_revision(g.id),
    'rounds',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object(
       'horses_state',CASE WHEN r.horses_state IS NULL THEN NULL ELSE r.horses_state||jsonb_build_object('_authorityRevision',r.authority_revision,'_authorityScope',r.id) END,
       'farkle_state',CASE WHEN r.farkle_state IS NULL THEN NULL ELSE r.farkle_state||jsonb_build_object('_authorityRevision',r.authority_revision,'_authorityScope',r.id) END,
       'yahtzee_state',CASE WHEN r.yahtzee_state IS NULL THEN NULL ELSE r.yahtzee_state||jsonb_build_object('_authorityRevision',r.authority_revision,'_authorityScope',r.id) END)
     ORDER BY r.hand_number,r.round_number,r.id) FROM public.rounds r WHERE r.game_id=g.id),'[]'::jsonb)),
  'players',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('profiles',
    CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object('username',pr.username,'aggression_level',pr.aggression_level) END)
    ORDER BY p.position,p.id) FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id
    WHERE p.game_id=g.id AND p.status<>'left'),'[]'::jsonb),
  'allow_bot_dealers',(SELECT allow_bot_dealers FROM public.game_defaults WHERE game_type='holm' LIMIT 1),
  'server_now',statement_timestamp()
 ) INTO result FROM public.games g WHERE g.id=p_game_id;
 RETURN result;
END $function$
;

CREATE FUNCTION private.three_five_seven_hand_concealed(p_dealer uuid,p_hand integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
 SELECT EXISTS(SELECT 1 FROM public.rounds WHERE dealer_game_id=p_dealer AND hand_number=p_hand AND private.three_five_seven_round_concealed(id))
$$;
REVOKE ALL ON FUNCTION private.three_five_seven_hand_concealed(uuid,integer) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_hand_history(p_game_id uuid, p_dealer_game_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE uid uuid:=auth.uid(); result jsonb;
BEGIN
 IF uid IS NULL OR NOT(
   EXISTS(SELECT 1 FROM public.players WHERE game_id=p_game_id AND user_id=uid)
   OR EXISTS(SELECT 1 FROM public.session_player_snapshots WHERE game_id=p_game_id AND user_id=uid)
   OR public.has_role(uid,'admin')) THEN RAISE EXCEPTION 'history:not_authorized' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'gameType',d.game_type,'startedAt',d.started_at,'config',d.config,
   'hands',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'handNumber',h.hand_number,'participants',h.participants,
     'opening',h.opening,'closing',CASE WHEN private.three_five_seven_hand_concealed(h.dealer_game_id,h.hand_number) THEN NULL ELSE h.closing END,'scoresAfter',CASE WHEN private.three_five_seven_hand_concealed(h.dealer_game_id,h.hand_number) THEN NULL ELSE h.scores_after END,'terminal',CASE WHEN private.three_five_seven_hand_concealed(h.dealer_game_id,h.hand_number) THEN NULL ELSE h.terminal END,'provenance',h.provenance,
     'events',coalesce((SELECT jsonb_agg(jsonb_build_object(
       'id',e.id,'roundId',e.round_id,'roundNumber',e.round_number,'sequence',e.sequence,'type',e.event_type,
       'actorId',e.actor_id,'payload',e.payload,'occurredAt',e.occurred_at) ORDER BY e.sequence)
       FROM private.history_events e WHERE e.hand_id=h.id AND NOT private.three_five_seven_hand_concealed(h.dealer_game_id,h.hand_number) AND (p_dealer_game_id IS NOT NULL OR e.event_type='result') AND (e.audience IS NULL OR uid=ANY(e.audience))),'[]'))
     ORDER BY h.hand_number) FROM private.history_hands h WHERE h.dealer_game_id=d.id),'[]')) ORDER BY d.started_at DESC),'[]')
 INTO result FROM public.dealer_games d WHERE d.session_id=p_game_id AND (p_dealer_game_id IS NULL OR d.id=p_dealer_game_id);
 RETURN jsonb_build_object('version',1,'games',result);
END $function$
;
CREATE OR REPLACE FUNCTION public.three_five_seven_expire_round(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_hand_number integer, p_round_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_round public.rounds%ROWTYPE; v_game public.games%ROWTYPE; v_result jsonb;
BEGIN
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN RAISE EXCEPTION 'three_five_seven_expire_round:not_in_session'; END IF;
  IF private.three_five_seven_hidden_round(p_game_id,true)=p_round_id THEN
    RETURN private.three_five_seven_safe_receipt(p_game_id,p_round_id,NULL,'resolved');
  END IF;
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
  RETURN private.three_five_seven_safe_receipt(p_game_id,p_round_id,NULL,'expired');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.three_five_seven_settle_game(p_game_id uuid,p_round_id uuid,p_dealer_game_id uuid,p_hand_number integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','private' AS $$
BEGIN
 IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN RAISE EXCEPTION 'three_five_seven_settle_game:not_in_session'; END IF;
 IF private.three_five_seven_round_concealed(p_round_id) THEN
  RETURN jsonb_build_object('outcome','disclosure_pending');
 END IF;
 RETURN private.three_five_seven_settle_core(p_game_id,p_round_id,p_dealer_game_id,p_hand_number);
END $$;
REVOKE ALL ON FUNCTION public.three_five_seven_settle_game_authority_impl(uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.three_five_seven_advance_round(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_hand_number integer, p_round_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_resolution private.three_five_seven_round_resolutions%ROWTYPE;
  v_existing public.rounds%ROWTYPE;
  v_next_round integer;
  v_next_hand integer;
  v_charge integer := 0;
  v_label text := 'Re-Ante';
  v_timer integer := 10;
  v_result jsonb;
  v_opening_cursor bigint;
BEGIN
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN RAISE EXCEPTION 'three_five_seven_advance_round:not_in_session'; END IF;
  IF private.three_five_seven_round_concealed(p_round_id) THEN RETURN jsonb_build_object('outcome','disclosure_pending'); END IF;
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN
    RAISE EXCEPTION 'three_five_seven_advance_round:not_in_session';
  END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND
     OR v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number
     OR v_round.round_number IS DISTINCT FROM p_round_number THEN
    RAISE EXCEPTION 'three_five_seven_advance_round:round_identity_mismatch';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id THEN
    RAISE EXCEPTION 'three_five_seven_advance_round:stale_game_identity';
  END IF;
  SELECT * INTO v_resolution FROM private.three_five_seven_round_resolutions
   WHERE game_id = p_game_id
     AND dealer_game_id = p_dealer_game_id
     AND round_id = p_round_id
     AND hand_number = p_hand_number
     AND round_number = p_round_number;
  IF NOT FOUND OR v_round.status <> 'completed' THEN
    RAISE EXCEPTION 'three_five_seven_advance_round:predecessor_not_committed';
  END IF;
  v_next_round := CASE p_round_number WHEN 1 THEN 2 WHEN 2 THEN 3 ELSE 1 END;
  v_next_hand := CASE WHEN p_round_number = 3 THEN p_hand_number + 1 ELSE p_hand_number END;
  IF p_round_number = 3 THEN
    v_charge := greatest(0, coalesce(v_game.rollover_amount, 1));
  END IF;

  SELECT * INTO v_existing FROM public.rounds
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number = v_next_hand
     AND round_number = v_next_round
   FOR UPDATE;
  IF FOUND THEN
    IF v_next_round = 1 THEN
      v_opening_cursor := private.three_five_seven_commit_opening_transfer_claim(
        p_game_id, v_existing.id, p_dealer_game_id, v_next_hand, v_charge
      );
    END IF;
    SELECT * INTO v_game FROM public.games WHERE id = p_game_id;
    SELECT * INTO v_existing FROM public.rounds WHERE id = v_existing.id;
    RETURN jsonb_build_object(
      'outcome','already_started','deduped',true,'round_id',v_existing.id,
      'hand_number',v_existing.hand_number,'round_number',v_existing.round_number,
      'opening_transfer_cursor',v_opening_cursor,
      'opening_transfer_required',v_opening_cursor IS NOT NULL,
      'game',to_jsonb(v_game),'round',to_jsonb(v_existing)
    );
  END IF;
  IF NOT coalesce(v_game.awaiting_next_round, false)
     OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_game.current_round IS DISTINCT FROM p_round_number THEN
    RAISE EXCEPTION 'three_five_seven_advance_round:predecessor_not_current';
  END IF;
  SELECT coalesce(defaults.decision_timer_seconds, 10) INTO v_timer
    FROM public.game_defaults defaults WHERE defaults.game_type = '3-5-7' LIMIT 1;
  PERFORM set_config('app.three_five_seven_authoritative_write', 'on', true);
  v_result := private.three_five_seven_create_round(
    p_game_id, p_dealer_game_id, v_next_round, v_next_hand, v_charge, v_label,
    clock_timestamp() + make_interval(secs => greatest(1, coalesce(v_timer, 10)) + 2)
  );
  IF v_next_round = 1 THEN
    v_opening_cursor := private.three_five_seven_commit_opening_transfer_claim(
      p_game_id, (v_result->>'round_id')::uuid, p_dealer_game_id, v_next_hand, v_charge
    );
    PERFORM private.three_five_seven_settle_instant_sweep(
      p_game_id, (v_result->>'round_id')::uuid, p_dealer_game_id, v_next_hand
    );
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id;
  SELECT * INTO v_round FROM public.rounds WHERE id = (v_result->>'round_id')::uuid;
  RETURN v_result || jsonb_build_object(
    'opening_transfer_cursor',v_opening_cursor,
    'opening_transfer_required',v_opening_cursor IS NOT NULL,
    'game',to_jsonb(v_game),'round',to_jsonb(v_round)
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.three_five_seven_advance_postgame(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_hand_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_claim private.three_five_seven_postgame_advances%ROWTYPE;
  v_resolution private.three_five_seven_round_resolutions%ROWTYPE;
  v_winner_id uuid;
  v_settlements integer;
  v_active integer;
  v_humans integer;
  v_allow_bots boolean := false;
  v_make_take boolean := false;
  v_positions integer[];
  v_index integer;
  v_next_position integer;
  v_target text;
  v_deadline timestamptz;
  v_result jsonb;
BEGIN
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN RAISE EXCEPTION 'three_five_seven_advance_postgame:not_in_session'; END IF;
  IF private.three_five_seven_round_concealed(p_round_id) THEN RETURN jsonb_build_object('outcome','disclosure_pending'); END IF;
  IF p_game_id IS NULL
     OR p_round_id IS NULL
     OR p_dealer_game_id IS NULL
     OR p_hand_number < 1 THEN
    RAISE EXCEPTION 'three_five_seven_advance_postgame:missing_identity';
  END IF;

  -- Preserve the established exact lock order: terminal round, then game.
  SELECT *
    INTO v_round
    FROM public.rounds
   WHERE id = p_round_id
   FOR UPDATE;

  IF NOT FOUND
     OR v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number THEN
    RAISE EXCEPTION 'three_five_seven_advance_postgame:round_identity_mismatch';
  END IF;

  SELECT *
    INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'three_five_seven_advance_postgame:game_not_found';
  END IF;

  SELECT *
    INTO v_claim
    FROM private.three_five_seven_postgame_advances claim
   WHERE claim.game_id = p_game_id
     AND claim.dealer_game_id = p_dealer_game_id
     AND claim.round_id = p_round_id
     AND claim.hand_number = p_hand_number;

  IF FOUND THEN
    -- The first committed handoff can mark a human participant left. That
    -- former participant must still receive the exact stored result, while an
    -- unrelated authenticated caller must not learn it.
    IF NOT private.three_five_seven_actor_allowed(p_game_id)
       AND NOT EXISTS (
         SELECT 1
           FROM public.players participant
          WHERE participant.game_id = p_game_id
            AND participant.user_id = auth.uid()
       ) THEN
      RAISE EXCEPTION 'three_five_seven_advance_postgame:not_in_session';
    END IF;
    RETURN v_claim.result || jsonb_build_object(
      'deduped', true,
      'outcome', 'already_advanced'
    );
  END IF;

  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN
    RAISE EXCEPTION 'three_five_seven_advance_postgame:not_in_session';
  END IF;

  IF v_game.game_type NOT IN ('3-5-7', '3-5-7-game', '357') THEN
    RETURN jsonb_build_object(
      'outcome', 'stale_identity',
      'deduped', true,
      'status', v_game.status,
      'current_dealer_game_id', v_game.current_game_uuid,
      'current_hand_number', v_game.total_hands
    );
  END IF;

  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_game.status NOT IN ('game_over', 'session_ended') THEN
    RETURN jsonb_build_object(
      'outcome', 'stale_identity',
      'deduped', true,
      'status', v_game.status,
      'current_dealer_game_id', v_game.current_game_uuid,
      'current_hand_number', v_game.total_hands
    );
  END IF;

  SELECT *
    INTO v_resolution
    FROM private.three_five_seven_round_resolutions resolution
   WHERE resolution.game_id = p_game_id
     AND resolution.dealer_game_id = p_dealer_game_id
     AND resolution.round_id = p_round_id
     AND resolution.hand_number = p_hand_number
     AND resolution.outcome IN ('terminal', 'instant_sweep');

  IF NOT FOUND
     OR v_round.status <> 'completed'
     OR v_resolution.winner_player_id IS NULL THEN
    RAISE EXCEPTION 'three_five_seven_advance_postgame:terminal_resolution_missing';
  END IF;

  v_winner_id := v_resolution.winner_player_id;

  SELECT count(*)
    INTO v_settlements
    FROM public.game_results result
   WHERE result.game_id = p_game_id
     AND result.dealer_game_id = p_dealer_game_id
     AND result.hand_number = p_hand_number
     AND result.settlement_key = 'three_five_seven_terminal'
     AND result.winner_player_id = v_winner_id;

  IF v_settlements <> 1 THEN
    RAISE EXCEPTION
      'three_five_seven_advance_postgame:settlement_not_committed:%',
      v_settlements;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.players player
     WHERE player.id = v_winner_id
       AND player.game_id = p_game_id
  ) THEN
    RAISE EXCEPTION 'three_five_seven_advance_postgame:winner_not_in_session';
  END IF;

  PERFORM set_config('app.three_five_seven_authoritative_write', 'on', true);

  -- Apply the same precedence as evaluatePlayerStatesEndOfGame, but do it
  -- under the exact terminal game lock before dealer/cohort derivation:
  -- stand up > sit out > 3-5-7 auto-fold > waiting/rejoin.
  DELETE FROM public.players player
   WHERE player.game_id = p_game_id
     AND coalesce(player.is_bot, false)
     AND coalesce(player.stand_up_next_hand, false);

  UPDATE public.players player
     SET status = CASE
           WHEN coalesce(player.stand_up_next_hand, false) THEN 'left'
           ELSE player.status
         END,
         sitting_out = CASE
           WHEN coalesce(player.stand_up_next_hand, false)
             OR coalesce(player.sit_out_next_hand, false)
             OR coalesce(player.auto_fold, false) THEN true
           WHEN coalesce(player.waiting, false) THEN false
           ELSE player.sitting_out
         END,
         waiting = false,
         stand_up_next_hand = false,
         sit_out_next_hand = false,
         auto_fold = false,
         current_decision = NULL,
         decision_locked = false,
         pre_fold = false,
         pre_stay = false,
         ante_decision = NULL,
         legs = 0
   WHERE player.game_id = p_game_id;

  SELECT
    count(*) FILTER (
      WHERE NOT coalesce(player.sitting_out, false)
        AND player.status NOT IN ('observer', 'left')
        AND player.position IS NOT NULL
    ),
    count(*) FILTER (
      WHERE NOT coalesce(player.sitting_out, false)
        AND player.status NOT IN ('observer', 'left')
        AND player.position IS NOT NULL
        AND NOT coalesce(player.is_bot, false)
    )
    INTO v_active, v_humans
    FROM public.players player
   WHERE player.game_id = p_game_id;

  IF v_game.status = 'session_ended' OR v_humans = 0 THEN
    v_target := 'session_ended';
  ELSIF v_active < 2 THEN
    v_target := 'waiting';
  ELSE
    SELECT coalesce(defaults.allow_bot_dealers, false)
      INTO v_allow_bots
      FROM public.game_defaults defaults
     WHERE defaults.game_type = 'holm'
     LIMIT 1;
    v_allow_bots := coalesce(v_allow_bots, false);

    SELECT coalesce((setting.value->>'enabled')::boolean, false)
      INTO v_make_take
      FROM public.system_settings setting
     WHERE setting.key = 'make_it_take_it'
     LIMIT 1;
    v_make_take := coalesce(v_make_take, false);

    IF v_make_take THEN
      SELECT player.position
        INTO v_next_position
        FROM public.players player
       WHERE player.id = v_winner_id
         AND player.game_id = p_game_id
         AND NOT coalesce(player.is_bot, false)
         AND NOT coalesce(player.sitting_out, false)
         AND player.status NOT IN ('observer', 'left')
         AND player.position IS NOT NULL;
    END IF;

    IF v_next_position IS NULL THEN
      SELECT array_agg(player.position ORDER BY player.position)
        INTO v_positions
        FROM public.players player
       WHERE player.game_id = p_game_id
         AND NOT coalesce(player.sitting_out, false)
         AND player.status NOT IN ('observer', 'left')
         AND player.position IS NOT NULL
         AND (v_allow_bots OR NOT coalesce(player.is_bot, false));

      IF coalesce(cardinality(v_positions), 0) = 0 THEN
        v_target := 'dealer_selection';
      ELSE
        v_index := array_position(
          v_positions,
          coalesce(v_game.dealer_position, 1)
        );
        v_next_position := CASE
          WHEN v_index IS NULL THEN v_positions[1]
          ELSE v_positions[(v_index % cardinality(v_positions)) + 1]
        END;
      END IF;
    END IF;

    IF v_target IS NULL THEN
      v_target := 'game_selection';
      v_deadline := clock_timestamp() + make_interval(
        secs => greatest(1, coalesce(v_game.game_setup_timer_seconds, 30))
      );
    END IF;
  END IF;

  UPDATE public.rounds
     SET status = 'completed'
   WHERE game_id = p_game_id
     AND dealer_game_id = p_dealer_game_id
     AND status <> 'completed';

  UPDATE public.games
     SET status = v_target,
         config_complete = false,
         config_deadline = v_deadline,
         last_round_result = NULL,
         current_round = NULL,
         awaiting_next_round = false,
         next_round_number = NULL,
         pot = 0,
         all_decisions_in = false,
         all_decisions_in_round_id = NULL,
         game_over_at = NULL,
         buck_position = NULL,
         total_hands = 0,
         is_first_hand = false,
         current_game_uuid = NULL,
         dealer_selection_state = NULL,
         dealer_position = CASE
           WHEN v_target = 'game_selection' THEN v_next_position
           ELSE dealer_position
         END,
         session_ended_at = CASE
           WHEN v_target = 'session_ended'
             THEN coalesce(session_ended_at, clock_timestamp())
           ELSE session_ended_at
         END
   WHERE id = p_game_id;

  v_result := jsonb_build_object(
    'outcome', 'advanced',
    'deduped', false,
    'winner_player_id', v_winner_id,
    'status', v_target,
    'dealer_position', CASE
      WHEN v_target = 'game_selection' THEN v_next_position
      ELSE NULL
    END,
    'config_deadline', v_deadline
  );

  INSERT INTO private.three_five_seven_postgame_advances (
    game_id,
    dealer_game_id,
    round_id,
    hand_number,
    winner_player_id,
    target_status,
    dealer_position,
    config_deadline,
    result
  ) VALUES (
    p_game_id,
    p_dealer_game_id,
    p_round_id,
    p_hand_number,
    v_winner_id,
    v_target,
    CASE WHEN v_target = 'game_selection' THEN v_next_position END,
    v_deadline,
    v_result
  );

  RETURN v_result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.three_five_seven_reveal_terminal_cards(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_hand_number integer, p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_round public.rounds%ROWTYPE; v_game public.games%ROWTYPE; v_resolution private.three_five_seven_round_resolutions%ROWTYPE; v_player public.players%ROWTYPE;
BEGIN
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN RAISE EXCEPTION 'three_five_seven_reveal_terminal_cards:not_in_session'; END IF;
  IF private.three_five_seven_round_concealed(p_round_id) THEN RETURN jsonb_build_object('outcome','disclosure_pending'); END IF;
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
$function$
;

-- The old mutator entry points remain unavailable (as on the deployed authority boundary).
DO $revoke_legacy$
DECLARE legacy_target record;
BEGIN
 FOR legacy_target IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN('advance_357_round_legacy','advance_357_round_unsafe_legacy') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',legacy_target.signature);
 END LOOP;
END $revoke_legacy$;

-- Shared privileged entry points can otherwise reveal already-settled state in their
-- replies/validation branches. Only the 3-5-7 concealed interval takes this guard.
-- The bodies for all other games are unchanged.
DO $shared_guard$
DECLARE f record; body text; param text;
BEGIN
 FOR f IN SELECT p.oid,p.proname,p.proargnames,pg_get_functiondef(p.oid) definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f' AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
 AND p.proname IN('set_session_player_intent','set_automatic_play','session_leave','session_take_seat',
 'transfer_session_host','request_session_end','three_five_seven_request_session_end',
 'stand_up_and_resolve_postgame','get_chat_flight_report','submit_ante_decision',
 'begin_session_dealer_selection','advance_session_dealer_selection','advance_ante_phase','configure_dealer_game','decline_session_setup') LOOP
  param:=CASE WHEN 'p_game_id'=ANY(f.proargnames) THEN 'p_game_id' WHEN '_game_id'=ANY(f.proargnames) THEN '_game_id' END;
  IF param IS NULL THEN RAISE EXCEPTION '357_concealment:shared_guard_signature:%',f.proname; END IF;
  body:=regexp_replace(f.definition,'\mBEGIN\M',
    'BEGIN
 IF private.three_five_seven_hidden_round('||param||',true) IS NOT NULL THEN
  RAISE EXCEPTION ''three_five_seven:disclosure_pending'' USING ERRCODE=''42501'';
 END IF;','i');
  IF body=f.definition THEN RAISE EXCEPTION '357_concealment:shared_guard_body:%',f.proname; END IF;
  EXECUTE body;
 END LOOP;
END $shared_guard$;

-- Privileged account totals must use the same visibility boundary as their rows.
DO $statement_guard$
DECLARE old_definition text; new_definition text;
BEGIN
 SELECT pg_get_functiondef('public.account_statement(uuid,integer,timestamptz,uuid)'::regprocedure) INTO old_definition;
 new_definition:=replace(old_definition,
  'FROM public.player_transactions t WHERE t.profile_id=p_profile_id',
  'FROM public.player_transactions t WHERE t.profile_id=p_profile_id AND public.three_five_seven_row_visible(t.source_game_id,true)');
 new_definition:=replace(new_definition,
  'FROM public.player_transactions WHERE profile_id=p_profile_id',
  'FROM public.player_transactions WHERE profile_id=p_profile_id AND public.three_five_seven_row_visible(source_game_id,true)');
 IF new_definition=old_definition THEN RAISE EXCEPTION '357_concealment:account_statement_contract'; END IF;
 EXECUTE new_definition;
END $statement_guard$;

-- Pause remains available; its public remaining time cannot expose the terminal
-- versus ordinary recovery deadline (30 versus 10 seconds).
DO $pause_projection$
DECLARE old_definition text; new_definition text;
BEGIN
 SELECT pg_get_functiondef('public.set_game_paused(uuid,boolean,uuid,bigint)'::regprocedure) INTO old_definition;
 new_definition:=replace(old_definition,
  'OR g.status IN (''session_ended'',''completed'') THEN',
  'OR (g.status IN (''session_ended'',''completed'') AND private.three_five_seven_hidden_round(g.id,true) IS NULL) THEN');
 new_definition:=replace(new_definition,
  'UPDATE public.games SET is_paused=true,timer_paused_at=now_at,paused_time_remaining=remaining',
  'IF private.three_five_seven_hidden_round(g.id,true) IS NOT NULL THEN
    SELECT greatest(0,ceil(extract(epoch FROM ((private.three_five_seven_decision_reveal(
      r.game_id,r.dealer_game_id,r.id,r.hand_number,r.round_number)->>''drop_at'')::timestamptz-now_at))))::integer
    INTO remaining FROM public.rounds r WHERE r.id=private.three_five_seven_hidden_round(g.id,true);
   END IF;
   UPDATE public.games SET is_paused=true,timer_paused_at=now_at,paused_time_remaining=remaining');
 IF new_definition=old_definition THEN RAISE EXCEPTION '357_concealment:pause_contract'; END IF;
 EXECUTE new_definition;
END $pause_projection$;
NOTIFY pgrst,'reload schema';
COMMIT;
