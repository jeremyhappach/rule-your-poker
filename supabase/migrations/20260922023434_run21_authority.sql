-- Local development authority adapter. The release gate stays closed by default.
-- Existing game functions and all production financial ledgers are untouched.
CREATE TABLE private.run21_matches (
  dealer_game_id uuid PRIMARY KEY REFERENCES public.dealer_games(id),
  game_id uuid NOT NULL REFERENCES public.games(id),
  first_round_id uuid NOT NULL REFERENCES public.rounds(id),
  participants jsonb NOT NULL,
  stake integer NOT NULL CHECK (stake>0),
  initial_balances jsonb NOT NULL,
  balances jsonb NOT NULL,
  state jsonb,
  revision bigint NOT NULL DEFAULT 0,
  bot_due_at bigint,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished boolean NOT NULL DEFAULT false
);
CREATE INDEX run21_matches_session ON private.run21_matches(game_id,created_at DESC);
ALTER TABLE private.run21_matches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.run21_matches FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE private.run21_settlements (
  id uuid PRIMARY KEY,
  transfer_batch_id uuid NOT NULL UNIQUE,
  dealer_game_id uuid NOT NULL UNIQUE REFERENCES private.run21_matches(dealer_game_id),
  settlement_key text NOT NULL UNIQUE,
  winner_id uuid NOT NULL REFERENCES public.players(id),
  loser_id uuid NOT NULL REFERENCES public.players(id),
  amount integer NOT NULL CHECK(amount>0),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(winner_id<>loser_id)
);
ALTER TABLE private.run21_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.run21_settlements FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE private.run21_settlements IS 'Isolated fake-money Run21 test ledger. Never writes account, player-transaction or gameplay-transfer ledgers.';

CREATE FUNCTION private.run21_require_local() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.run21_app_test_release WHERE singleton AND enabled AND qualified AND project_ref='local') THEN
    RAISE EXCEPTION 'run21:local_release_disabled' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION private.run21_require_local() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.run21_configure_local(
  p_game_id uuid,p_dealer_player_id uuid,p_expected_dealer_position integer,
  p_game_type text,p_config jsonb,p_expected_config_deadline timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid();
  actor uuid:=auth.uid(); claim private.dealer_game_setup_commits; request_hash text;
  stake integer; people jsonb; balances jsonb; result jsonb; setup_players jsonb;
BEGIN
  PERFORM private.run21_require_local();
  IF actor IS NULL OR NOT coalesce(public.is_admin(actor),false) OR p_game_type IS DISTINCT FROM 'run21' THEN
    RAISE EXCEPTION 'run21:admin_required' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF g.real_money IS DISTINCT FROM false OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=actor AND NOT is_bot AND status='active' AND NOT sitting_out) THEN
    RAISE EXCEPTION 'run21:fake_money_participant_required' USING ERRCODE='42501'; END IF;
  IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,5}$' OR p_expected_config_deadline IS NULL THEN
    RAISE EXCEPTION 'run21:invalid_setup'; END IF;
  stake:=(p_config->>'ante_amount')::integer;
  request_hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
  SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
  IF FOUND THEN
    IF claim.request_hash<>request_hash THEN RAISE EXCEPTION 'run21:setup_replay_conflict'; END IF;
    RETURN claim.result||jsonb_build_object('outcome','already_configured','deduped',true);
  END IF;
  SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
  IF g.status NOT IN ('game_selection','configuring') OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline
    OR clock_timestamp()>g.config_deadline OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position
    OR d.position IS DISTINCT FROM p_expected_dealer_position OR d.sitting_out OR d.status<>'active'
    OR (d.user_id<>actor AND NOT(d.is_bot AND g.current_host=actor)) OR coalesce(g.is_paused,false) OR coalesce(g.pending_session_end,false) THEN
    RAISE EXCEPTION 'run21:setup_identity'; END IF;
  PERFORM 1 FROM public.players WHERE game_id=g.id FOR UPDATE;
  IF (SELECT count(*) FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out)<>2
    OR (SELECT count(*) FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND is_bot)<>1
    OR EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT coalesce(public.is_admin(user_id),false)) THEN
    RAISE EXCEPTION 'run21:one_admin_and_one_bot_required'; END IF;
  IF EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=g.id) THEN
    RAISE EXCEPTION 'run21:new_local_session_required'; END IF;
  SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'seat',p.position,
      'name',CASE WHEN p.is_bot THEN 'Run21 bot' ELSE coalesce(pr.username,'Player') END,
      'kind',CASE WHEN p.is_bot THEN 'bot' ELSE 'human' END,'chips',p.chips) ORDER BY p.position),
    jsonb_object_agg(p.id,p.chips) INTO people,balances
    FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out;
  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config)
    VALUES(g.id,d.user_id,'run21',jsonb_build_object('ante_amount',stake,'run21_local',true)) RETURNING * INTO dg;
  -- Normal setup authority transitions may retire a prior family's presentation.
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.players SET ante_decision='ante_up',current_decision=NULL,decision_locked=false,auto_fold=false
    WHERE game_id=g.id AND status='active' AND NOT sitting_out;
  UPDATE public.games SET game_type='run21',current_game_uuid=dg.id,config_complete=true,
    config_deadline=NULL,ante_decision_deadline=NULL,status='in_progress',ante_amount=stake,
    current_round=1,total_hands=1,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL
    WHERE id=g.id RETURNING * INTO g;
  INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
    VALUES(r,g.id,dg.id,1,1,0,'betting',0);
  INSERT INTO private.run21_matches(dealer_game_id,game_id,first_round_id,participants,stake,initial_balances,balances)
    VALUES(dg.id,g.id,r,people,stake,balances,balances);
  SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
  result:=jsonb_build_object('outcome','configured','deduped',false,
    'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),
    'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
  INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result)
    VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,request_hash,dg.id,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.run21_configure_local(uuid,uuid,integer,text,jsonb,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run21_configure_local(uuid,uuid,integer,text,jsonb,timestamptz) TO authenticated;

-- Only the loopback server holds the local service role; browsers never see raw state.
CREATE FUNCTION public.run21_server_load(p_game_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM private.run21_require_local();
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at) FROM private.run21_matches m
    JOIN public.games g ON g.id=m.game_id WHERE g.real_money=false AND (p_game_id IS NULL OR m.game_id=p_game_id)
    AND (p_game_id IS NOT NULL OR NOT m.finished)),'[]'::jsonb);
END $$;
CREATE FUNCTION public.run21_server_commit(p_dealer_game_id uuid,p_expected_revision bigint,p_state jsonb,p_bot_due_at bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m private.run21_matches; g public.games; last_round jsonb; receipt jsonb; winner uuid; loser uuid;
BEGIN
  PERFORM private.run21_require_local();
  SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
  SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
  IF g.real_money IS DISTINCT FROM false OR g.game_type IS DISTINCT FROM 'run21' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR m.finished THEN
    RAISE EXCEPTION 'run21:inactive_identity'; END IF;
  IF m.revision<>p_expected_revision THEN RETURN jsonb_build_object('outcome','conflict','revision',m.revision); END IF;
  IF p_state#>>'{identity,sessionId}' IS DISTINCT FROM m.game_id::text OR p_state#>>'{identity,dealerGameId}' IS DISTINCT FROM m.dealer_game_id::text
    OR p_state#>>'{identity,handNumber}' IS DISTINCT FROM '1' OR p_state->>'stake' IS DISTINCT FROM m.stake::text
    OR jsonb_array_length(p_state->'players')<>2 OR jsonb_array_length(p_state->'rounds')<1
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_state->'players') p WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) q WHERE q->>'id'=p->>'id'))
    OR (m.state IS NOT NULL AND (p_state->'config' IS DISTINCT FROM m.state->'config' OR (p_state->>'updatedAt')::bigint<(m.state->>'updatedAt')::bigint)) THEN
    RAISE EXCEPTION 'run21:commit_identity'; END IF;
  last_round:=p_state->'rounds'->-1;
  IF NOT EXISTS(SELECT 1 FROM public.rounds WHERE id=(last_round->>'id')::uuid) THEN
    INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
      VALUES((last_round->>'id')::uuid,g.id,m.dealer_game_id,1,(last_round->>'number')::integer,0,'betting',0);
  END IF;
  UPDATE public.rounds SET status='completed' WHERE dealer_game_id=m.dealer_game_id
    AND id IN(SELECT (r->>'id')::uuid FROM jsonb_array_elements(p_state->'rounds') r WHERE (r->>'revealed')::boolean) AND status<>'completed';
  UPDATE public.games SET current_round=(last_round->>'number')::integer WHERE id=g.id AND current_round IS DISTINCT FROM (last_round->>'number')::integer;
  receipt:=nullif(p_state->'settlement','null'::jsonb);
  IF receipt IS NOT NULL THEN
    winner:=(receipt->>'winnerId')::uuid;loser:=(receipt->>'loserId')::uuid;
    IF receipt->>'key' IS DISTINCT FROM 'run21:'||m.dealer_game_id||':1' OR receipt->>'winnerId' IS DISTINCT FROM p_state->>'winnerId'
      OR receipt->>'amount' IS DISTINCT FROM m.stake::text OR winner=loser OR m.initial_balances->>winner::text IS NULL OR m.initial_balances->>loser::text IS NULL
      OR (last_round->>'number')::integer<3 OR NOT(last_round->>'revealed')::boolean
      OR (p_state#>>ARRAY['cumulative',winner::text])::bigint<=(p_state#>>ARRAY['cumulative',loser::text])::bigint THEN
      RAISE EXCEPTION 'run21:settlement_identity'; END IF;
    INSERT INTO private.run21_settlements(id,transfer_batch_id,dealer_game_id,settlement_key,winner_id,loser_id,amount)
      VALUES((receipt->>'resultId')::uuid,(receipt->>'transferBatchId')::uuid,m.dealer_game_id,receipt->>'key',winner,loser,m.stake)
      ON CONFLICT(dealer_game_id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM private.run21_settlements WHERE dealer_game_id=m.dealer_game_id AND id=(receipt->>'resultId')::uuid AND transfer_batch_id=(receipt->>'transferBatchId')::uuid AND winner_id=winner AND loser_id=loser AND amount=m.stake) THEN
      RAISE EXCEPTION 'run21:settlement_conflict'; END IF;
    m.balances:=jsonb_set(jsonb_set(m.initial_balances,ARRAY[winner::text],to_jsonb((m.initial_balances->>winner::text)::numeric+m.stake)),ARRAY[loser::text],to_jsonb((m.initial_balances->>loser::text)::numeric-m.stake));
  ELSIF m.state->'settlement' IS NOT NULL AND m.state->'settlement'<>'null'::jsonb THEN
    RAISE EXCEPTION 'run21:settlement_cannot_regress';
  END IF;
  UPDATE private.run21_matches SET state=p_state,revision=revision+1,bot_due_at=p_bot_due_at,balances=m.balances
    WHERE dealer_game_id=m.dealer_game_id RETURNING * INTO m;
  RETURN jsonb_build_object('outcome','committed','record',to_jsonb(m));
END $$;
CREATE FUNCTION public.run21_server_close(p_dealer_game_id uuid,p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m private.run21_matches;
BEGIN
  PERFORM private.run21_require_local();
  SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) p WHERE p->>'userId'=p_user_id::text AND p->>'kind'='human')
    OR NOT coalesce(public.is_admin(p_user_id),false) OR NOT EXISTS(SELECT 1 FROM private.run21_settlements WHERE dealer_game_id=m.dealer_game_id) THEN
    RAISE EXCEPTION 'run21:close_denied' USING ERRCODE='42501'; END IF;
  IF m.finished THEN RETURN; END IF;
  UPDATE private.run21_matches SET finished=true WHERE dealer_game_id=m.dealer_game_id;
  UPDATE public.games SET status='session_ended',session_ended_at=clock_timestamp(),last_round_result='Run21 match complete'
    WHERE id=m.game_id AND real_money=false AND current_game_uuid=m.dealer_game_id;
END $$;
REVOKE ALL ON FUNCTION public.run21_server_load(uuid),public.run21_server_commit(uuid,bigint,jsonb,bigint),public.run21_server_close(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run21_server_load(uuid),public.run21_server_commit(uuid,bigint,jsonb,bigint),public.run21_server_close(uuid,uuid) TO service_role;

CREATE FUNCTION private.run21_guard_browser() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF current_user IN ('anon','authenticated') AND (NEW.game_type='run21' OR OLD.game_type='run21') THEN
    RAISE EXCEPTION 'run21:server_authority_required' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.run21_guard_browser() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER run21_guard_browser BEFORE UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION private.run21_guard_browser();
