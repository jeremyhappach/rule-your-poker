-- UNAPPLIED. Activate only after the complete qualification and worker heartbeat.
CREATE TABLE private.run21_production_release(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),qualified boolean NOT NULL DEFAULT false);
INSERT INTO private.run21_production_release(singleton) VALUES(true);
ALTER TABLE private.run21_production_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.run21_production_release FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.run21_actor_allowed(p_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_user_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND is_active)
$$;
CREATE FUNCTION private.run21_require_production() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.run21_production_release WHERE singleton AND qualified) THEN RAISE EXCEPTION 'run21:release_unqualified' USING ERRCODE='55000'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.run21_require_production() FROM PUBLIC,anon,authenticated,service_role;
-- Compatibility name used inside service-only RPCs. Their EXECUTE privileges,
-- fresh actor checks and per-match admission remain the security boundary.
-- Qualification gates new setup, never recovery/readability of existing matches.
CREATE OR REPLACE FUNCTION private.run21_require_local() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RETURN; END $$;
CREATE OR REPLACE FUNCTION public.run21_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  g public.games;
  d public.players;
  dg public.dealer_games;
  r uuid:=gen_random_uuid();
  actor uuid:=auth.uid();
  claim private.dealer_game_setup_commits;
  request_hash text;
  stake integer; first_seconds integer;
  people jsonb;
  balances jsonb;
  result jsonb;
  setup_players jsonb;
BEGIN
  PERFORM private.run21_require_production();
  IF actor IS NULL OR NOT private.run21_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'run21' THEN
    RAISE EXCEPTION 'run21:authenticated_player_required' USING ERRCODE='42501';
  END IF;

  SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT EXISTS(
    SELECT 1 FROM public.players
    WHERE game_id=g.id AND user_id=actor AND NOT is_bot AND status='active' AND NOT sitting_out
  ) THEN
    RAISE EXCEPTION 'run21:participant_required' USING ERRCODE='42501';
  END IF;

  IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,5}$' OR p_expected_config_deadline IS NULL THEN
    RAISE EXCEPTION 'run21:invalid_setup';
  END IF;
  stake:=(p_config->>'ante_amount')::integer;
  request_hash:=md5(jsonb_build_array(
    p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline
  )::text);

  SELECT * INTO claim
  FROM private.dealer_game_setup_commits
  WHERE game_id=g.id
    AND expected_config_deadline=p_expected_config_deadline
    AND expected_dealer_position=p_expected_dealer_position;
  IF FOUND THEN
    IF claim.request_hash<>request_hash THEN
      RAISE EXCEPTION 'run21:setup_replay_conflict';
    END IF;
    RETURN claim.result||jsonb_build_object('outcome','already_configured','deduped',true);
  END IF;

  SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
  IF g.status NOT IN ('game_selection','configuring')
    OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline
    OR clock_timestamp()>g.config_deadline
    OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position
    OR d.position IS DISTINCT FROM p_expected_dealer_position
    OR d.sitting_out
    OR d.status<>'active'
    OR (d.user_id<>actor AND NOT(d.is_bot AND g.current_host=actor))
    OR coalesce(g.is_paused,false)
    OR coalesce(g.pending_session_end,false) THEN
    RAISE EXCEPTION 'run21:setup_identity';
  END IF;

  IF g.real_money THEN PERFORM private.run21_assert_recovery_health(g.id); END IF;
  IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'run21:outstanding_pot'; END IF;
  PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
  IF g.real_money AND EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND is_bot) THEN
    RAISE EXCEPTION 'run21:real_money_humans_required';
  END IF;
  SELECT coalesce(decision_timer_seconds,30) INTO first_seconds FROM public.game_defaults WHERE game_type='run21';
  IF first_seconds IS NULL OR first_seconds NOT BETWEEN 5 AND 60 THEN RAISE EXCEPTION 'run21:invalid_first_placement_timer'; END IF;
  IF (SELECT count(*) FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out)<>2
    OR EXISTS(
      SELECT 1 FROM public.players
      WHERE game_id=g.id AND status<>'left' AND NOT is_bot
        AND NOT private.run21_actor_allowed(user_id)
    ) THEN
    RAISE EXCEPTION 'run21:two_eligible_players_required';
  END IF;

  -- Historical Run21 dealer-games remain in the session, but only a match
  -- that has not completed its authoritative close, lacks its settlement
  -- receipt, or is still the canonical live pointer may block continuation.
  IF EXISTS(
    SELECT 1
    FROM public.dealer_games prior
    JOIN private.run21_matches m ON m.dealer_game_id=prior.id
    WHERE prior.session_id=g.id
      AND prior.game_type='run21'
      AND (
        m.finished IS DISTINCT FROM true
        OR NOT EXISTS(
          SELECT 1 FROM private.run21_settlements settlement
          WHERE settlement.dealer_game_id=prior.id
        )
        OR g.current_game_uuid=prior.id
      )
  ) THEN
    RAISE EXCEPTION 'run21:live_game_exists';
  END IF;

  SELECT
    jsonb_agg(jsonb_build_object(
      'id',p.id,
      'userId',p.user_id,
      'seat',p.position,
      'name',CASE WHEN p.is_bot THEN 'Run21 bot' ELSE coalesce(pr.username,'Player') END,
      'kind',CASE WHEN p.is_bot THEN 'bot' ELSE 'human' END,
      'chips',p.chips
    ) ORDER BY p.position),
    jsonb_object_agg(p.id,p.chips)
  INTO people,balances
  FROM public.players p
  JOIN public.profiles pr ON pr.id=p.user_id
  WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out;

  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config)
    VALUES(g.id,d.user_id,'run21',jsonb_build_object('ante_amount',stake,'run21_authority',2,'first_placement_seconds',first_seconds))
    RETURNING * INTO dg;

  -- Normal setup authority transitions may retire a prior family's presentation.
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.players
  SET ante_decision='ante_up',current_decision=NULL,decision_locked=false,auto_fold=false
  WHERE game_id=g.id AND status='active' AND NOT sitting_out;

  UPDATE public.games
  SET game_type='run21',
      current_game_uuid=dg.id,
      config_complete=true,
      config_deadline=NULL,
      ante_decision_deadline=NULL,
      status='in_progress',
      ante_amount=stake,
      current_round=1,
      total_hands=1,
      replay_contract_version=NULL,
      all_decisions_in=false,
      all_decisions_in_round_id=NULL
  WHERE id=g.id
  RETURNING * INTO g;

  INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
    VALUES(r,g.id,dg.id,1,1,0,'betting',0);
  INSERT INTO private.run21_matches(
    dealer_game_id,game_id,first_round_id,participants,stake,initial_balances,balances,financial_version,real_money,first_placement_seconds
  ) VALUES(dg.id,g.id,r,people,stake,balances,balances,2,g.real_money,first_seconds);

  SELECT jsonb_agg(to_jsonb(p) ORDER BY position)
  INTO setup_players
  FROM public.players p
  WHERE game_id=g.id;
  result:=jsonb_build_object(
    'outcome','configured',
    'deduped',false,
    'setup_identity',jsonb_build_object(
      'game_id',g.id,
      'dealer_position',p_expected_dealer_position,
      'expected_config_deadline',p_expected_config_deadline
    ),
    'game',to_jsonb(g),
    'dealer_game',to_jsonb(dg),
    'players',setup_players
  );
  INSERT INTO private.dealer_game_setup_commits(
    game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result
  ) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,request_hash,dg.id,result);
  RETURN result;
END $function$
;
REVOKE ALL ON FUNCTION public.run21_configure(uuid,uuid,integer,text,jsonb,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run21_configure(uuid,uuid,integer,text,jsonb,timestamptz) TO authenticated;
-- Existing clients use the same financially authoritative owner after activation.
CREATE OR REPLACE FUNCTION public.run21_configure_local(p_game_id uuid,p_dealer_player_id uuid,p_expected_dealer_position integer,p_game_type text,p_config jsonb,p_expected_config_deadline timestamptz) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT public.run21_configure(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_game_type,p_config,p_expected_config_deadline)
$$;
CREATE OR REPLACE FUNCTION private.run21_release_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE is_run21 boolean;
BEGIN
 IF TG_TABLE_NAME='games' THEN
   is_run21:=NEW.game_type='run21';
   IF is_run21 AND (EXISTS(
     SELECT 1 FROM public.players WHERE game_id=NEW.id AND NOT is_bot AND status<>'left' AND NOT private.run21_actor_allowed(user_id))) THEN
     RAISE EXCEPTION 'run21:release_denied' USING ERRCODE='42501'; END IF;
 ELSE
   SELECT game_type='run21' INTO is_run21 FROM public.games WHERE id=NEW.game_id;
   IF is_run21 AND NOT NEW.is_bot AND NOT private.run21_actor_allowed(NEW.user_id) THEN
     RAISE EXCEPTION 'run21:release_denied' USING ERRCODE='42501'; END IF;
 END IF;
 IF is_run21 AND auth.uid() IS NOT NULL AND NOT private.run21_actor_allowed(auth.uid()) THEN
   RAISE EXCEPTION 'run21:release_denied' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.run21_server_load(p_game_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 PERFORM private.run21_require_local();
 RETURN coalesce((SELECT jsonb_agg(CASE WHEN m.state IS NULL THEN to_jsonb(m) ELSE
 jsonb_set(to_jsonb(m),'{state,events}',coalesce((SELECT jsonb_agg(e.event ORDER BY e.sequence)
 FROM private.run21_events e WHERE e.dealer_game_id=m.dealer_game_id),'[]'::jsonb)) #- '{state,eventSequence}' END ORDER BY m.created_at)
 FROM private.run21_matches m JOIN public.games g ON g.id=m.game_id
 WHERE (p_game_id IS NULL OR m.game_id=p_game_id)
 AND (p_game_id IS NOT NULL OR NOT m.finished)),'[]'::jsonb);
END $function$
;
CREATE OR REPLACE FUNCTION public.run21_server_load_current(p_game_id uuid DEFAULT NULL::uuid, p_after_sequence bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 PERFORM private.run21_require_local();
 RETURN coalesce((SELECT jsonb_agg(CASE WHEN p_after_sequence IS NULL OR m.state IS NULL THEN to_jsonb(m) ELSE
 jsonb_set(to_jsonb(m),'{state,events}',coalesce((SELECT jsonb_agg(e.event ORDER BY e.sequence)
 FROM private.run21_events e WHERE e.dealer_game_id=m.dealer_game_id AND e.sequence>p_after_sequence),'[]'::jsonb)) END
 ORDER BY m.created_at) FROM private.run21_matches m
 JOIN public.games g ON g.id=m.game_id WHERE (p_game_id IS NULL OR m.game_id=p_game_id)
 AND (p_game_id IS NOT NULL OR NOT m.finished)),'[]'::jsonb);
END $function$
;
CREATE OR REPLACE FUNCTION public.run21_server_admit(p_user_id uuid, p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE allowed boolean; record jsonb; started timestamptz:=clock_timestamp(); gate_ms numeric; member_ms numeric;
BEGIN
 allowed:=private.run21_actor_allowed(p_user_id);
 gate_ms:=extract(epoch FROM clock_timestamp()-started)*1000;
 IF NOT coalesce(allowed,false) THEN RETURN jsonb_build_object('allowed',false); END IF;
 started:=clock_timestamp();
 SELECT to_jsonb(m)||jsonb_build_object('dealer_user_id',d.dealer_user_id) INTO record
 FROM private.run21_matches m JOIN public.games g ON g.id=m.game_id
 JOIN public.dealer_games d ON d.id=m.dealer_game_id
 WHERE m.game_id=p_game_id
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) p WHERE p->>'userId'=p_user_id::text AND p->>'kind'='human')
 ORDER BY m.created_at DESC LIMIT 1;
 member_ms:=extract(epoch FROM clock_timestamp()-started)*1000;
 RETURN jsonb_build_object('allowed',true,'record',record,'gateMs',gate_ms,'membershipMs',member_ms);
END $function$
;
CREATE FUNCTION public.run21_capabilities(p_session_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed boolean:=private.run21_actor_allowed(auth.uid());
BEGIN
 allowed:=allowed AND EXISTS(SELECT 1 FROM private.run21_production_release WHERE singleton AND qualified);
 IF p_session_id IS NOT NULL THEN allowed:=allowed AND EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND user_id=auth.uid() AND status<>'left' AND NOT is_bot); END IF;
 RETURN jsonb_build_object('version',2,'enabled',allowed,'user_id',auth.uid(),'session_id',p_session_id,'project_ref','xvhmbuppghwmwpwrkzao','fake_money_only',false);
END $$;
REVOKE ALL ON FUNCTION public.run21_capabilities(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run21_capabilities(uuid) TO authenticated;
-- Cached version-one clients reject this production capability and must refresh.
CREATE OR REPLACE FUNCTION public.run21_app_test_capabilities(p_session_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.run21_capabilities(p_session_id)
$$;
UPDATE public.game_defaults SET decision_timer_seconds=30 WHERE game_type='run21';
