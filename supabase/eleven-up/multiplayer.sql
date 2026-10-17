-- Additive authority source. Activation is in the versioned migration.
SET LOCAL lock_timeout = '100ms';
SET LOCAL statement_timeout = '10s';
CREATE TABLE private.eleven_up_release (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false, admission_enabled boolean NOT NULL DEFAULT false);
INSERT INTO private.eleven_up_release DEFAULT VALUES;
ALTER TABLE private.eleven_up_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.eleven_up_release FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.eleven_up_matches (
 dealer_game_id uuid PRIMARY KEY,
 game_id uuid NOT NULL, round_id uuid NOT NULL,
 state jsonb NOT NULL, revision bigint NOT NULL DEFAULT 0, stake integer NOT NULL CHECK(stake>0),
 settlement jsonb, finished boolean NOT NULL DEFAULT false, paused_at bigint,

 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX eleven_up_matches_session ON private.eleven_up_matches(game_id);
CREATE INDEX eleven_up_matches_pending ON private.eleven_up_matches(((state->>'deadline')::bigint)) WHERE NOT finished AND settlement IS NULL;

CREATE TABLE private.eleven_up_requests (
 dealer_game_id uuid NOT NULL REFERENCES private.eleven_up_matches(dealer_game_id),
 request_id uuid NOT NULL, actor uuid NOT NULL, command jsonb NOT NULL,
 PRIMARY KEY(dealer_game_id,request_id)
);
CREATE TABLE private.eleven_up_history (
 dealer_game_id uuid NOT NULL REFERENCES private.eleven_up_matches(dealer_game_id),
 revision bigint NOT NULL, frame jsonb NOT NULL, PRIMARY KEY(dealer_game_id,revision)
);
ALTER TABLE private.eleven_up_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.eleven_up_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.eleven_up_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.eleven_up_matches,private.eleven_up_requests,private.eleven_up_history FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.eleven_up_revisions (
 dealer_game_id uuid PRIMARY KEY REFERENCES private.eleven_up_matches(dealer_game_id),
 game_id uuid NOT NULL, revision bigint NOT NULL
);
ALTER TABLE public.eleven_up_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.eleven_up_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.eleven_up_revisions TO authenticated;
CREATE POLICY eleven_up_member_read ON public.eleven_up_revisions FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=eleven_up_revisions.game_id AND p.user_id=(SELECT auth.uid()) AND p.status<>'left'));

-- Same approved-account eligibility as Run21; independent game release gate.
CREATE FUNCTION private.eleven_up_actor_allowed(actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active)
  AND EXISTS(SELECT 1 FROM private.eleven_up_release WHERE singleton AND enabled)
$$;
CREATE FUNCTION public.eleven_up_capabilities(p_session_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); allowed boolean:=private.eleven_up_actor_allowed(actor);
BEGIN
 allowed:=allowed AND EXISTS(SELECT 1 FROM private.eleven_up_release WHERE singleton AND admission_enabled);
 IF p_session_id IS NOT NULL THEN
  allowed:=allowed AND EXISTS(SELECT 1 FROM public.games WHERE id=p_session_id AND real_money=false)
   AND EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND user_id=actor AND status<>'left')
   AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND status<>'left' AND NOT is_bot AND NOT private.eleven_up_actor_allowed(user_id));
 END IF;
 RETURN jsonb_build_object('version',1,'enabled',allowed,'user_id',actor,'session_id',p_session_id,'fake_money_only',true);
END $$;


CREATE OR REPLACE FUNCTION private.eleven_up_deal(s jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE totals jsonb;
BEGIN
 SELECT jsonb_object_agg(p->>'id',coalesce(s->'scores'->(p->>'id'),'0'::jsonb)) INTO totals FROM jsonb_array_elements(s->'players') p;
 RETURN private.eleven_up_board_deal(s||jsonb_build_object('scores',totals,'score',coalesce(totals->(s->'players'->(s->>'turnIndex')::integer->>'id'),'0'::jsonb)),at_ms);
END $$;
CREATE OR REPLACE FUNCTION private.eleven_up_reduce(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE board jsonb; player text:=s->'players'->(s->>'turnIndex')::integer->>'id'; next_i integer:=(s->>'turnIndex')::integer+1;
 round_i integer:=(s->>'stage')::integer; n integer:=jsonb_array_length(s->'players'); qualified jsonb; result jsonb;
BEGIN
 IF s->>'phase'='complete' THEN RAISE EXCEPTION 'eleven_up:complete';END IF;
 IF s->>'phase'='stage_complete' THEN
  IF action NOT IN ('tick','continue') THEN RAISE EXCEPTION 'eleven_up:phase';END IF;
  IF at_ms<(s->>'deadline')::bigint THEN RETURN s;END IF;
  IF next_i>=n AND round_i<2 THEN next_i:=0;round_i:=round_i+1;
  ELSIF next_i>=n AND round_i=2 THEN
   SELECT coalesce(jsonb_agg(p->>'id' ORDER BY ord),'[]'::jsonb) INTO qualified FROM jsonb_array_elements(s->'players') WITH ORDINALITY a(p,ord)
    WHERE private.eleven_up_bonus_qualified((s->'scores'->>(p->>'id'))::bigint,s->'rules');
   s:=s||jsonb_build_object('qualified',qualified);round_i:=3;next_i:=0;
  END IF;
  IF round_i=3 THEN
   WHILE next_i<n AND NOT coalesce(s->'qualified','[]'::jsonb) ? (s->'players'->next_i->>'id') LOOP next_i:=next_i+1;END LOOP;
  END IF;
  IF next_i>=n THEN RETURN s||jsonb_build_object('phase','complete','deadline',0,'turnIndex',n,'event',jsonb_build_object('label','Competition complete','points',0));END IF;
  RETURN private.eleven_up_deal(s||jsonb_build_object('turnIndex',next_i,'stage',round_i),(s->>'deadline')::bigint);
 END IF;
 -- Board operations do not own or inspect the multiplayer schedule.
 board:=s-ARRAY['players','scores','stages','qualified','turnIndex','stage','identity'];
 board:=private.eleven_up_board_reduce(board,action,items,at_ms);
 s:=s||board;
 s:=jsonb_set(s,ARRAY['scores',player],s->'score');
 IF s->>'phase'='stage_complete' THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'stages') r WHERE r->>'playerId'=player AND (r->>'stage')::integer=round_i) THEN RAISE EXCEPTION 'eleven_up:stage_already_final';END IF;
  result:=s->'result'||jsonb_build_object('id',concat_ws(':',s#>>'{identity,dealerGameId}',s#>>'{identity,roundId}',player,round_i),'playerId',player,'stage',round_i);
  s:=s||jsonb_build_object('stages',(s->'stages')||jsonb_build_array(result));
 END IF;
 RETURN s;
END $$;
CREATE FUNCTION private.eleven_up_publish() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.eleven_up_revisions VALUES(NEW.dealer_game_id,NEW.game_id,NEW.revision)
 ON CONFLICT(dealer_game_id) DO UPDATE SET revision=EXCLUDED.revision;
 INSERT INTO private.eleven_up_history VALUES(NEW.dealer_game_id,NEW.revision,private.eleven_up_visible(NEW.state)) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;

CREATE FUNCTION public.eleven_up_snapshot(p_dealer_game_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.eleven_up_matches; viewer uuid; paused boolean; balances jsonb; batch public.gameplay_transfer_batches; result_id uuid;
BEGIN
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id;
 SELECT id INTO viewer FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND status<>'left' AND NOT is_bot;
 IF viewer IS NULL OR NOT private.eleven_up_actor_allowed(auth.uid()) THEN RAISE EXCEPTION 'eleven_up:membership_required' USING ERRCODE='42501'; END IF;
 SELECT is_paused INTO paused FROM public.games WHERE id=m.game_id;
 IF m.settlement IS NOT NULL THEN
  SELECT jsonb_object_agg(player_id::text,chips) INTO balances FROM public.session_player_snapshots WHERE dealer_game_id=p_dealer_game_id;
 ELSE SELECT jsonb_object_agg(id::text,chips) INTO balances FROM public.players WHERE game_id=m.game_id;END IF;
 SELECT * INTO batch FROM public.gameplay_transfer_batches WHERE dealer_game_id=p_dealer_game_id ORDER BY cursor DESC LIMIT 1;
 SELECT id INTO result_id FROM public.game_results WHERE dealer_game_id=p_dealer_game_id AND settlement_key='eleven_up_terminal';
 RETURN private.eleven_up_visible(m.state)||jsonb_build_object('revision',m.revision,'viewerId',viewer,
  'canAct',NOT coalesce(paused,false) AND m.state->>'phase'<>'complete' AND m.state->'players'->(m.state->>'turnIndex')::integer->>'id'=viewer::text,
  'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),'settlement',m.settlement,'paused',coalesce(paused,false),'finished',m.finished,'pausedAt',m.paused_at,'financial',jsonb_build_object('balances',coalesce(balances,'{}'::jsonb),'resultId',result_id,'batch',CASE WHEN batch.id IS NOT NULL THEN to_jsonb(batch) ELSE NULL END))
  -- Add new presentation metadata only with a newly committed result/revision.
  -- Existing clients compare equal revisions strictly; installation alone must not change their snapshot shape.
  ||CASE WHEN m.state->>'phase'='stage_complete' AND (m.state->'stages'->-1) ? 'id' THEN jsonb_build_object('pausedAt',m.paused_at) ELSE '{}'::jsonb END;
END $$;

CREATE FUNCTION public.eleven_up_history(p_dealer_game_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.eleven_up_snapshot(p_dealer_game_id);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('revision',revision,'frame',frame) ORDER BY revision) FROM private.eleven_up_history WHERE dealer_game_id=p_dealer_game_id),'[]'::jsonb);
END $$;

CREATE FUNCTION private.eleven_up_settle(p_dealer_game_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.eleven_up_matches; g public.games; winners uuid[]; win_count integer; total integer; deltas jsonb; transfers jsonb:='[]';
 result_id uuid; player jsonb; winner uuid; loser uuid; amount integer; changes jsonb:='{}'; allocated integer;
BEGIN
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.real_money IS DISTINCT FROM false OR g.game_type IS DISTINCT FROM 'eleven-up' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.status<>'in_progress' OR g.is_paused
  OR m.state->>'phase'<>'complete' OR (SELECT count(*) FROM jsonb_object_keys(m.state->'scores'))<>jsonb_array_length(m.state->'players') THEN RAISE EXCEPTION 'eleven_up:not_terminal'; END IF;
 SELECT array_agg(key::uuid ORDER BY key) INTO winners FROM jsonb_each_text(m.state->'scores') WHERE value::integer=(SELECT max(value::integer) FROM jsonb_each_text(m.state->'scores'));
 win_count:=cardinality(winners);total:=(jsonb_array_length(m.state->'players')-win_count)*m.stake;
 deltas:=private.split_whole_chips_clockwise(m.game_id,winners,total,g.dealer_position);
 FOR player IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
  loser:=(player->>'id')::uuid;
  IF NOT loser=ANY(winners) THEN changes:=changes||jsonb_build_object(loser::text,-m.stake); END IF;
 END LOOP;
 changes:=changes||deltas;
 -- Existing signed session chip accounting and transfer journal; no alternate ledger.
 -- Allocate each loser's stake across winners according to the canonical split.
 FOR player IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
  loser:=(player->>'id')::uuid;IF loser=ANY(winners) THEN CONTINUE; END IF;allocated:=m.stake;
  FOREACH winner IN ARRAY winners LOOP
   amount:=least(allocated,(deltas->>winner::text)::integer);
   IF amount>0 THEN transfers:=transfers||jsonb_build_array(jsonb_build_object('from',jsonb_build_object('kind','player','playerId',loser),'to',jsonb_build_object('kind','player','playerId',winner),'amount',amount));
    deltas:=jsonb_set(deltas,ARRAY[winner::text],to_jsonb((deltas->>winner::text)::integer-amount));allocated:=allocated-amount;END IF;
  END LOOP;
  IF allocated<>0 THEN RAISE EXCEPTION 'eleven_up:unbalanced_settlement'; END IF;
 END LOOP;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(m.game_id,m.dealer_game_id,1,'eleven_up_terminal','eleven-up',CASE WHEN win_count=1 THEN winners[1] END,
  CASE WHEN win_count>1 THEN 'Tie' ELSE (SELECT p->>'name' FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=winners[1]::text) END,
  '11 Up: '||(m.state->'scores')::text,total,changes,win_count>1) RETURNING id INTO result_id;
 IF jsonb_array_length(transfers)>0 THEN PERFORM public.settle_gameplay_chip_transfers(m.game_id,transfers,'win'); END IF;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
 UPDATE private.eleven_up_matches SET settlement=changes,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result='11 Up complete',awaiting_next_round=false WHERE id=m.game_id;
END $$;

CREATE FUNCTION public.eleven_up_action(p_dealer_game_id uuid,p_request_id uuid,p_revision bigint,p_action text,p_items integer[] DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.eleven_up_matches; g public.games; actor uuid:=auth.uid(); player uuid; prior private.eleven_up_requests;
 command jsonb:=jsonb_build_object('revision',p_revision,'action',p_action,'items',p_items); at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 SELECT id INTO player FROM public.players WHERE game_id=m.game_id AND user_id=actor AND status<>'left' AND NOT is_bot;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF player IS NULL OR NOT private.eleven_up_actor_allowed(actor) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=player::text) THEN RAISE EXCEPTION 'eleven_up:participant_required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_revision IS NULL OR p_action IS NULL OR p_action NOT IN ('group','pass','continue','take_score') THEN RAISE EXCEPTION 'eleven_up:invalid_command'; END IF;
 SELECT * INTO prior FROM private.eleven_up_requests WHERE dealer_game_id=p_dealer_game_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor<>actor OR prior.command<>command THEN RAISE EXCEPTION 'eleven_up:replay_conflict'; END IF;
  RETURN public.eleven_up_snapshot(p_dealer_game_id);
 END IF;
 IF g.real_money IS DISTINCT FROM false OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'eleven-up' OR g.status<>'in_progress' OR m.finished OR g.is_paused THEN RAISE EXCEPTION 'eleven_up:inactive'; END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION 'eleven_up:stale_revision'; END IF;
 IF m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM player::text THEN RAISE EXCEPTION 'eleven_up:spectator' USING ERRCODE='42501'; END IF;
 m.state:=private.eleven_up_reduce(m.state,p_action,p_items,at_ms);
 INSERT INTO private.eleven_up_requests VALUES(m.dealer_game_id,p_request_id,actor,command);
 UPDATE private.eleven_up_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 IF m.state->>'phase'='complete' THEN PERFORM private.eleven_up_settle(m.dealer_game_id); END IF;
 RETURN public.eleven_up_snapshot(m.dealer_game_id);
END $$;

CREATE FUNCTION public.eleven_up_configure(p_game_id uuid,p_dealer_player_id uuid,p_expected_dealer_position integer,p_game_type text,p_config jsonb,p_expected_config_deadline timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.eleven_up_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'eleven-up' THEN RAISE EXCEPTION 'eleven_up:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'eleven_up:dealer_required' USING ERRCODE='42501';END IF;
 -- No real-money creation in this release, including direct RPC calls.
 IF g.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION 'eleven_up:real_money_closed' USING ERRCODE='42501';END IF;
 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'eleven_up:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'eleven_up:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'eleven_up:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT EXISTS(SELECT 1 FROM private.eleven_up_release WHERE singleton AND admission_enabled) THEN RAISE EXCEPTION 'eleven_up:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'eleven_up:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.eleven_up_actor_allowed(user_id)) THEN RAISE EXCEPTION 'eleven_up:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'eleven_up:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'eleven_up:bots_not_supported';END IF;
 IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 7 THEN RAISE EXCEPTION 'eleven_up:player_count';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'eleven_up:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'eleven-up',jsonb_build_object('ante_amount',stake_i,'rules',private.eleven_up_rules())) RETURNING * INTO dg;
 UPDATE public.players SET ante_decision='ante_up',current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='eleven-up',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=NULL,status='in_progress',ante_amount=stake_i,current_round=1,total_hands=1,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot) VALUES(r,g.id,dg.id,1,1,0,'betting',0);
 s:=private.eleven_up_deal(jsonb_build_object('identity',jsonb_build_object('sessionId',g.id,'dealerGameId',dg.id,'roundId',r),
  'players',people,'rules',private.eleven_up_rules(),'turnIndex',0,'stage',1,'score',0,'scores','{}'::jsonb,'stages','[]'::jsonb),floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
 INSERT INTO private.eleven_up_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(dg.id,g.id,r,s,stake_i);
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $$;

CREATE FUNCTION public.eleven_up_close(p_dealer_game_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.eleven_up_matches; g public.games; positions integer[]; next_seat integer; target text; winner uuid; make_take boolean;
BEGIN
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF NOT private.eleven_up_actor_allowed(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND status<>'left' AND NOT is_bot)
 OR m.settlement IS NULL THEN RAISE EXCEPTION 'eleven_up:close_denied' USING ERRCODE='42501';END IF;
 IF m.finished THEN RETURN;END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'eleven-up' OR g.status NOT IN ('game_over','session_ended') THEN RAISE EXCEPTION 'eleven_up:close_identity';END IF;
 IF g.status<>'session_ended' THEN
  PERFORM 1 FROM public.players WHERE game_id=m.game_id ORDER BY id FOR UPDATE;
  UPDATE public.players SET status=CASE WHEN stand_up_next_hand THEN 'left' ELSE status END,
   sitting_out=CASE WHEN stand_up_next_hand OR sit_out_next_hand THEN true WHEN waiting THEN false ELSE sitting_out END,
   waiting=false,stand_up_next_hand=false,sit_out_next_hand=false,auto_fold=false,auto_play_stop_round_id=NULL,
   current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,ante_decision=NULL,auto_ante=false,auto_ante_runback=false WHERE game_id=m.game_id;
  IF g.pending_session_end THEN target:='session_ended';
  ELSIF (SELECT count(*) FROM public.players WHERE game_id=m.game_id AND status NOT IN ('left','observer') AND NOT sitting_out AND position IS NOT NULL)<2 THEN
   PERFORM private.resolve_postgame_participation(m.game_id,clock_timestamp());SELECT status INTO target FROM public.games WHERE id=m.game_id;
  ELSE
   SELECT array_agg(position ORDER BY position DESC) INTO positions FROM public.players WHERE game_id=m.game_id AND status NOT IN ('left','observer') AND NOT sitting_out AND position IS NOT NULL AND NOT is_bot;
   SELECT coalesce((value->>'enabled')::boolean,false) INTO make_take FROM public.system_settings WHERE key='make_it_take_it';
   IF coalesce(make_take,false) THEN
    SELECT winner_player_id INTO winner FROM public.game_results WHERE dealer_game_id=m.dealer_game_id AND settlement_key='eleven_up_terminal';
    SELECT position INTO next_seat FROM public.players WHERE id=winner AND game_id=m.game_id AND NOT is_bot AND NOT sitting_out AND status NOT IN ('left','observer') AND position IS NOT NULL;
    IF next_seat IS NULL THEN IF cardinality(positions)=1 THEN next_seat:=positions[1];ELSE target:='dealer_selection';END IF;END IF;
   END IF;
   IF target IS NULL THEN
    IF next_seat IS NULL THEN SELECT max(p) INTO next_seat FROM unnest(positions) p WHERE p<g.dealer_position;next_seat:=coalesce(next_seat,positions[1]);END IF;
    target:=CASE WHEN next_seat IS NULL THEN 'dealer_selection' ELSE 'game_selection' END;
   END IF;
  END IF;
  UPDATE public.games SET status=target,game_type=CASE WHEN target='session_ended' THEN game_type END,
   current_game_uuid=NULL,config_complete=false,current_round=NULL,total_hands=0,all_decisions_in=false,all_decisions_in_round_id=NULL,
   last_round_result=NULL,awaiting_next_round=false,next_round_number=NULL,game_over_at=NULL,pot=0,
   ante_decision_deadline=NULL,buck_position=NULL,is_first_hand=false,dealer_selection_state=NULL,
   dealer_position=coalesce(next_seat,dealer_position),config_deadline=CASE WHEN target='game_selection' THEN clock_timestamp()+make_interval(secs=>greatest(1,game_setup_timer_seconds)) END,
   pending_session_end=CASE WHEN target='session_ended' THEN false ELSE pending_session_end END,
   session_ended_at=CASE WHEN target='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END WHERE id=m.game_id;
 END IF;
 UPDATE private.eleven_up_matches SET finished=true,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
END $$;

CREATE FUNCTION private.eleven_up_pause() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'eleven-up' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN UPDATE private.eleven_up_matches SET paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND settlement IS NULL;
 ELSE UPDATE private.eleven_up_matches SET state=state||jsonb_build_object('deadline',(state->>'deadline')::bigint+at_ms-paused_at)||CASE WHEN state ? 'startedAt' THEN jsonb_build_object('startedAt',(state->>'startedAt')::bigint+at_ms-paused_at) ELSE '{}'::jsonb END,paused_at=NULL,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND paused_at IS NOT NULL AND settlement IS NULL;END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION private.eleven_up_recover() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate record;m private.eleven_up_matches;g public.games;at_ms bigint;count_i integer:=0;i integer;
BEGIN
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 FOR candidate IN SELECT dealer_game_id,game_id,round_id FROM private.eleven_up_matches WHERE NOT finished AND settlement IS NULL AND paused_at IS NULL AND (state->>'deadline')::bigint<=at_ms ORDER BY (state->>'deadline')::bigint LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=candidate.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO g FROM public.games WHERE id=candidate.game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR g.real_money IS DISTINCT FROM false OR g.is_paused OR g.status<>'in_progress' OR g.game_type IS DISTINCT FROM 'eleven-up' OR g.current_game_uuid IS DISTINCT FROM candidate.dealer_game_id THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=candidate.dealer_game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL THEN CONTINUE;END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  FOR i IN 1..64 LOOP
   EXIT WHEN m.state->>'phase'='complete' OR (m.state->>'deadline')::bigint>at_ms;
   m.state:=private.eleven_up_reduce(m.state,'tick',NULL,(m.state->>'deadline')::bigint);
  END LOOP;
  UPDATE private.eleven_up_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
  IF m.state->>'phase'='complete' THEN PERFORM private.eleven_up_settle(m.dealer_game_id);END IF;count_i:=count_i+1;
 END LOOP;RETURN count_i;
END $$;
-- Explicit grants only. All raw state/decks/helpers remain private.
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public') AND p.proname LIKE 'eleven_up_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.eleven_up_capabilities(uuid),public.eleven_up_snapshot(uuid),public.eleven_up_history(uuid),public.eleven_up_action(uuid,uuid,bigint,text,integer[]),public.eleven_up_configure(uuid,uuid,integer,text,jsonb,timestamptz),public.eleven_up_close(uuid) TO authenticated;

-- Acquire shared-table locks last. NOWAIT never queues behind live writes.
LOCK TABLE public.games,public.dealer_games,public.rounds IN SHARE ROW EXCLUSIVE MODE NOWAIT;
ALTER TABLE private.eleven_up_matches
 ADD FOREIGN KEY(dealer_game_id) REFERENCES public.dealer_games(id),
 ADD FOREIGN KEY(game_id) REFERENCES public.games(id),
 ADD FOREIGN KEY(round_id) REFERENCES public.rounds(id);
ALTER TABLE public.eleven_up_revisions ADD FOREIGN KEY(game_id) REFERENCES public.games(id);
CREATE TRIGGER eleven_up_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW
 WHEN(NEW.game_type='eleven-up') EXECUTE FUNCTION private.eleven_up_pause();

CREATE TRIGGER eleven_up_publish AFTER INSERT OR UPDATE ON private.eleven_up_matches FOR EACH ROW EXECUTE FUNCTION private.eleven_up_publish();
