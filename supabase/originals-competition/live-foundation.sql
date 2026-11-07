CREATE TABLE private.originals_live_matches(
 dealer_game_id uuid PRIMARY KEY REFERENCES public.dealer_games(id),game_id uuid NOT NULL REFERENCES public.games(id),round_id uuid NOT NULL REFERENCES public.rounds(id),
 state jsonb NOT NULL,revision bigint NOT NULL DEFAULT 0,stake integer NOT NULL CHECK(stake BETWEEN 1 AND 9999),
 settlement jsonb,finished boolean NOT NULL DEFAULT false,paused_at bigint,player_controls jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX originals_live_due ON private.originals_live_matches(((state->>'deadline')::bigint)) WHERE NOT finished AND paused_at IS NULL;
CREATE TABLE private.originals_live_requests(dealer_game_id uuid NOT NULL REFERENCES private.originals_live_matches(dealer_game_id),request_id uuid NOT NULL,actor uuid NOT NULL,fingerprint text NOT NULL,PRIMARY KEY(dealer_game_id,request_id));
ALTER TABLE private.originals_live_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.originals_live_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.originals_live_matches,private.originals_live_requests FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.originals_live_revisions(dealer_game_id uuid PRIMARY KEY REFERENCES private.originals_live_matches(dealer_game_id),game_id uuid NOT NULL,revision bigint NOT NULL);
ALTER TABLE public.originals_live_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.originals_live_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.originals_live_revisions TO authenticated;
CREATE POLICY originals_live_members ON public.originals_live_revisions FOR SELECT TO authenticated USING(EXISTS(SELECT FROM public.players WHERE game_id=originals_live_revisions.game_id AND user_id=(SELECT auth.uid()) AND status<>'left'));
DO $$BEGIN IF EXISTS(SELECT FROM pg_publication WHERE pubname='supabase_realtime') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.originals_live_revisions;END IF;END $$;

CREATE FUNCTION private.originals_live_actor_allowed(actor uuid,session_id uuid DEFAULT NULL,match_id uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.profiles WHERE id=actor AND is_active) AND ((SELECT bool_and(live_enabled) FROM private.originals_release)
 OR EXISTS(SELECT FROM public.dealer_games d WHERE d.session_id=originals_live_actor_allowed.session_id AND d.game_type IN('crib-lab','chucky-showdown') AND (match_id IS NULL OR d.id=match_id)))
$$;
CREATE FUNCTION private.originals_live_admission_allowed(actor uuid,session_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.profiles WHERE id=actor AND is_active) AND (SELECT bool_and(live_enabled) FROM private.originals_release)
$$;
CREATE FUNCTION private.originals_live_supported_rules(rules jsonb) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT rules->>'game' IN('crib-lab','chucky-showdown') AND rules->>'rounds'='3' AND EXISTS(SELECT FROM private.arcade_rulesets WHERE game=rules->>'game' AND id=rules->>'ruleset' AND config=rules->'gameplay')
$$;
CREATE FUNCTION private.originals_live_record(m private.originals_live_matches,actor uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT to_jsonb(m)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000),'viewer',(SELECT id FROM public.players WHERE game_id=m.game_id AND user_id=actor AND NOT is_bot),
 'financial',jsonb_build_object('balances',CASE WHEN m.settlement IS NULL THEN (SELECT jsonb_object_agg(id::text,chips) FROM public.players WHERE game_id=m.game_id) ELSE (SELECT jsonb_object_agg(player_id::text,chips) FROM public.session_player_snapshots WHERE dealer_game_id=m.dealer_game_id AND hand_number=1) END,
 'resultId',(SELECT id FROM public.game_results WHERE dealer_game_id=m.dealer_game_id AND settlement_key='originals_live_terminal'),
 'batch',(SELECT to_jsonb(b) FROM public.gameplay_transfer_batches b WHERE dealer_game_id=m.dealer_game_id ORDER BY cursor DESC LIMIT 1)))
$$;
CREATE FUNCTION private.originals_live_authorize(m private.originals_live_matches,actor uuid,token uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF actor IS NULL THEN
  IF NOT EXISTS(SELECT FROM private.delayed_recovery_state r WHERE r.singleton AND r.claimed AND r.token=originals_live_authorize.token AND r.expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'originals:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.originals_live_actor_allowed(actor,m.game_id,m.dealer_game_id) OR NOT EXISTS(SELECT FROM public.players p WHERE p.game_id=m.game_id AND p.user_id=actor AND p.status<>'left') THEN RAISE EXCEPTION 'originals:participant_required' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION public.originals_live_load(p_match uuid,p_actor uuid,p_request uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.originals_live_matches;r private.originals_live_requests;
BEGIN
 SELECT * INTO STRICT m FROM private.originals_live_matches WHERE dealer_game_id=p_match;
 IF p_actor IS NULL THEN RAISE EXCEPTION 'originals:authentication_required';END IF;
 PERFORM private.originals_live_authorize(m,p_actor);
 SELECT * INTO r FROM private.originals_live_requests WHERE dealer_game_id=p_match AND request_id=p_request;
 RETURN private.originals_live_record(m,p_actor)||jsonb_build_object('receipt',CASE WHEN r.request_id IS NOT NULL THEN to_jsonb(r) END);
END $$;
CREATE FUNCTION private.originals_live_publish() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.originals_live_revisions VALUES(NEW.dealer_game_id,NEW.game_id,NEW.revision) ON CONFLICT(dealer_game_id) DO UPDATE SET revision=EXCLUDED.revision;
 RETURN NEW;
END $$;
CREATE TRIGGER originals_live_publish AFTER INSERT OR UPDATE ON private.originals_live_matches FOR EACH ROW EXECUTE FUNCTION private.originals_live_publish();

;
CREATE OR REPLACE FUNCTION public.originals_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.originals_live_actor_allowed(actor,p_game_id) OR p_game_type NOT IN('crib-lab','chucky-showdown') THEN RAISE EXCEPTION 'originals:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'originals:dealer_required' USING ERRCODE='42501';END IF;

 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'originals:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 IF (p_config-ARRAY['ante_amount'])<>'{}'::jsonb THEN RAISE EXCEPTION 'originals:configuration';END IF;
 IF g.real_money AND NOT EXISTS(SELECT FROM private.originals_release WHERE game=p_game_type AND live_real_qualified) THEN RAISE EXCEPTION 'originals:real_money_closed';END IF;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'originals:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'originals:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT private.originals_live_admission_allowed(actor,g.id) THEN RAISE EXCEPTION 'originals:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'originals:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.originals_live_admission_allowed(user_id,g.id)) THEN RAISE EXCEPTION 'originals:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'originals:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 7 THEN RAISE EXCEPTION 'originals:player_count';END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(people) p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'originals:humans_required';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'originals:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,p_game_type,jsonb_build_object('ante_amount',stake_i,'rules',private.originals_config(p_game_type))) RETURNING * INTO dg;
 -- Freeze already-authorized access for this match. Expiry/revocation prevents
 -- new matches, but cannot strand accepted liabilities or an unresolved offer.

 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type=p_game_type,current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$

;
CREATE OR REPLACE FUNCTION private.originals_live_begin(p_game uuid, p_dealer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; dg public.dealer_games; people jsonb; s jsonb; r uuid:=gen_random_uuid(); n integer; stake_i integer;
BEGIN
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game FOR UPDATE;
 SELECT * INTO STRICT dg FROM public.dealer_games WHERE id=p_dealer AND session_id=p_game;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer OR g.status<>'ante_decision' OR g.game_type NOT IN('crib-lab','chucky-showdown') OR g.is_paused THEN RAISE EXCEPTION 'originals:ante_identity';END IF;
 stake_i:=(dg.config->>'ante_amount')::integer;
 IF g.ante_amount IS DISTINCT FROM stake_i OR NOT private.originals_live_supported_rules(dg.config->'rules') THEN RAISE EXCEPTION 'originals:configuration_changed';END IF;
 PERFORM 1 FROM public.players WHERE game_id=p_game ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=p_game AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND ante_decision IS NULL) THEN RAISE EXCEPTION 'originals:acceptance_pending';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot,'chips',p.chips)
  ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id)
 INTO people FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.game_id=p_game AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL AND p.ante_decision='ante_up';
 n:=jsonb_array_length(people);
 IF n NOT BETWEEN 2 AND 7 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE NOT (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'originals:accepted_player_count';END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(people) p WHERE NOT (p->>'isBot')::boolean AND NOT private.originals_live_actor_allowed((p->>'userId')::uuid,g.id,dg.id)) THEN RAISE EXCEPTION 'originals:tester_required' USING ERRCODE='42501';END IF;
 UPDATE public.games SET status='in_progress',ante_decision_deadline=NULL,current_round=1,total_hands=1 WHERE id=p_game;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
 VALUES(r,p_game,p_dealer,1,1,0,'betting',0);
 s:=jsonb_build_object('identity',jsonb_build_object('sessionId',p_game,'dealerGameId',p_dealer,'roundId',r),'rules',dg.config->'rules',
  'players',people,'round',1,'dealerIndex',n-1,'scores',(SELECT jsonb_object_agg(p->>'id',0) FROM jsonb_array_elements(people) p),'rounds','[]'::jsonb);
 s:=s||jsonb_build_object('phase','ready','turnIndex',0,'deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint,'board',NULL,'runs','{}'::jsonb,'results','[]'::jsonb);
 INSERT INTO private.originals_live_matches(dealer_game_id,game_id,round_id,state,stake,player_controls)
 VALUES(p_dealer,p_game,r,s,stake_i,(SELECT jsonb_object_agg(p.id::text,jsonb_build_object('autoPlay',p.auto_fold,'sitOutNextHand',p.sit_out_next_hand,'intentVersion',p.intent_version)) FROM public.players p WHERE p.game_id=p_game AND p.id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(people) x)));
 RETURN jsonb_build_object('dealerGameId',p_dealer,'roundId',r);
END $function$

;
CREATE OR REPLACE FUNCTION private.originals_live_settle(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.originals_live_matches; g public.games; winners uuid[]; win_count integer; total integer; deltas jsonb; transfers jsonb:='[]';
 result_id uuid; player jsonb; winner uuid; loser uuid; amount integer; changes jsonb:='{}'; allocated integer;
BEGIN
 SELECT * INTO STRICT m FROM private.originals_live_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.game_type IS DISTINCT FROM m.state#>>'{rules,game}' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.status<>'in_progress' OR g.is_paused
  OR m.state->>'phase'<>'complete' OR jsonb_array_length(m.state->'rounds')<>3 OR (SELECT count(*) FROM jsonb_object_keys(m.state->'scores'))<>jsonb_array_length(m.state->'players') THEN RAISE EXCEPTION 'originals:not_terminal'; END IF;
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
  IF allocated<>0 THEN RAISE EXCEPTION 'originals:unbalanced_settlement'; END IF;
 END LOOP;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(m.game_id,m.dealer_game_id,1,'originals_live_terminal',m.state#>>'{rules,game}',CASE WHEN win_count=1 THEN winners[1] END,
  CASE WHEN win_count>1 THEN 'Tie' ELSE (SELECT p->>'name' FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=winners[1]::text) END,
  (m.state#>>'{rules,game}')||': '||(m.state->'scores')::text,total,changes,win_count>1) RETURNING id INTO result_id;
 IF jsonb_array_length(transfers)>0 THEN PERFORM public.settle_gameplay_chip_transfers(m.game_id,transfers,'win'); END IF;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
 UPDATE private.originals_live_matches SET settlement=changes,revision=revision+1,state=state||jsonb_build_object('terminal',jsonb_build_object('resultId',result_id,'winnerIds',to_jsonb(winners),'score',(SELECT max(value::bigint) FROM jsonb_each_text(m.state->'scores')),'startedAt',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,endsAt}')::bigint,0)),'deadline',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,endsAt}')::bigint,0))+3000)) WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result=(m.state#>>'{rules,game}')||' complete',awaiting_next_round=false WHERE id=m.game_id;
END $function$

;
CREATE OR REPLACE FUNCTION private.originals_live_finish_postgame(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.originals_live_matches; g public.games; positions integer[]; next_seat integer; target text; winner uuid; make_take boolean;
BEGIN
 SELECT * INTO STRICT m FROM private.originals_live_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.originals_live_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NULL THEN RAISE EXCEPTION 'originals:close_denied' USING ERRCODE='42501';END IF;
 IF m.finished OR g.is_paused OR m.paused_at IS NOT NULL THEN RETURN;END IF;
 IF coalesce((m.state#>>'{terminal,deadline}')::bigint,0)>floor(extract(epoch FROM clock_timestamp())*1000) THEN RETURN;END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM m.state#>>'{rules,game}' OR g.status NOT IN ('game_over','session_ended') THEN RAISE EXCEPTION 'originals:close_identity';END IF;
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
    SELECT winner_player_id INTO winner FROM public.game_results WHERE dealer_game_id=m.dealer_game_id AND settlement_key='originals_live_terminal';
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
 UPDATE private.originals_live_matches SET finished=true,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
END $function$

;
CREATE OR REPLACE FUNCTION private.originals_live_roster_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.originals_live_matches;
BEGIN
 IF TG_OP='INSERT' THEN
  IF EXISTS(SELECT 1 FROM private.originals_live_matches WHERE game_id=NEW.game_id AND settlement IS NULL AND NOT finished) THEN NEW.waiting:=true;END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO m FROM private.originals_live_matches WHERE game_id=OLD.game_id AND settlement IS NULL AND NOT finished
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(state->'players') p WHERE p->>'id'=OLD.id::text);
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'originals:match_liability_committed';END IF;
 IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.game_id IS DISTINCT FROM OLD.game_id OR NEW.is_bot IS DISTINCT FROM OLD.is_bot THEN RAISE EXCEPTION 'originals:participant_identity_frozen';END IF;
 IF NEW.position IS DISTINCT FROM OLD.position OR NEW.status IN ('left','observer') THEN
  NEW.position:=OLD.position;NEW.status:=OLD.status;NEW.stand_up_next_hand:=true;
 END IF;
 IF NEW.sitting_out AND NOT OLD.sitting_out THEN NEW.sitting_out:=OLD.sitting_out;NEW.sit_out_next_hand:=true;END IF;
 RETURN NEW;
END $function$

;
DO $$BEGIN IF md5(pg_get_functiondef('private.advance_ante_phase_exact(uuid,uuid,timestamp with time zone,timestamp with time zone)'::regprocedure))<>'bf7dbfd1c3bb18511faa7f3cb554e486' THEN RAISE EXCEPTION 'originals:owner_changed:private.advance_ante_phase_exact';END IF;END $$;
CREATE OR REPLACE FUNCTION private.advance_ante_phase_exact(p_game_id uuid, p_expected_dealer_game_id uuid, p_expected_deadline timestamp with time zone, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_unresolved integer;
  v_anted integer;
  v_outcome text;
  v_start jsonb;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'private.advance_ante_phase_exact',false,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
  IF v_game.status IS DISTINCT FROM 'ante_decision'
     OR v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
     OR v_game.ante_decision_deadline IS DISTINCT FROM p_expected_deadline THEN
    v_replay_return := jsonb_build_object('outcome','stale_identity','status',v_game.status);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    v_replay_return := jsonb_build_object('outcome','paused');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;

  IF v_game.game_type='farkle' THEN PERFORM private.farkle_claim_v1(v_game.id,v_game.current_game_uuid,NULL,'start'); END IF;
  UPDATE public.players player
     SET ante_decision='ante_up',sitting_out=false
   WHERE player.game_id=p_game_id
     AND coalesce(player.is_bot,false)
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.ante_decision IS NULL;

  UPDATE public.players player
     SET sitting_out=true,waiting=false
   WHERE player.game_id=p_game_id
     AND player.ante_decision='sit_out'
     AND NOT coalesce(player.sitting_out,false);

  IF p_expected_deadline<=p_now THEN
    UPDATE public.players player
       SET ante_decision='sit_out',sitting_out=true,waiting=false
     WHERE player.game_id=p_game_id
       AND NOT coalesce(player.is_bot,false)
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN ('observer','left')
       AND player.ante_decision IS NULL;
  END IF;

  SELECT count(*) INTO v_unresolved
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision IS NULL;
  IF v_unresolved>0 THEN
    v_replay_return := jsonb_build_object(
      'outcome','pending','unresolved',v_unresolved,
      'deadline',p_expected_deadline
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;

  UPDATE public.players player
     SET sitting_out_hands=CASE
           WHEN coalesce(player.sitting_out,false)
             THEN coalesce(player.sitting_out_hands,0)+1
           ELSE 0 END
   WHERE player.game_id=p_game_id
     AND player.status NOT IN ('observer','left');

  SELECT count(*) INTO v_anted
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision='ante_up';

  -- Both the not-enough-players disposition and normal game bootstrap are
  -- private database-owned transitions. Establish the existing trusted local
  -- claim before either branch so a fresh authenticated HTTP request does not
  -- depend on dealer setup's expired transaction-local authority flags.
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  IF v_anted<2 THEN
    IF coalesce(v_game.real_money,false) THEN
      v_outcome:=private.resolve_postgame_participation(p_game_id,p_now);
    ELSE
      UPDATE public.games
         SET status='waiting',current_game_uuid=NULL,config_complete=false,
             config_deadline=NULL,ante_decision_deadline=NULL,
             awaiting_next_round=false,last_round_result=NULL
       WHERE id=p_game_id;
      v_outcome:='waiting-not-enough-players';
    END IF;
    v_replay_return := jsonb_build_object('outcome','not_enough_players','reason',v_outcome);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;

  CASE
    WHEN v_game.game_type IN ('3-5-7','3-5-7-game','357') THEN
      SELECT public.three_five_seven_begin_game(p_game_id) INTO v_start;
    WHEN v_game.game_type IN ('holm','holm-game') THEN
      SELECT public.start_holm_initial_hand(p_game_id,false) INTO v_start;
    WHEN v_game.game_type='cribbage' THEN
      SELECT public.cribbage_begin_dealer_selection(p_game_id) INTO v_start;
    WHEN v_game.game_type='gin-rummy' THEN
      SELECT public.start_gin_rummy_initial_hand(p_game_id) INTO v_start;
    WHEN v_game.game_type IN ('ptown-words','quintzee','eleven-up','tri-towers','run21','royal-flash','take-two','trip-flip','boxdrop','race-poker','battle-31') THEN
      SELECT private.megatouch_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type IN('crib-lab','chucky-showdown') THEN
      SELECT private.originals_live_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='mega-card-golf' THEN
      SELECT private.mega_live_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='six-card-golf' THEN
      SELECT private.golf_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='canasta' THEN
      SELECT private.canasta_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='farkle' THEN
      SELECT private.farkle_begin_v1(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='yahtzee' THEN
      SELECT public.start_yahtzee_round(p_game_id,NULL) INTO v_start;
    WHEN v_game.game_type IN ('horses','ship-captain-crew') THEN
      SELECT private.start_horses_scc_initial_round(
        p_game_id,p_expected_dealer_game_id
      ) INTO v_start;
    ELSE
      RAISE EXCEPTION 'advance_ante_phase_exact:unsupported_game_type:%',v_game.game_type;
  END CASE;

  v_replay_return := jsonb_build_object(
    'outcome','advanced','game_type',v_game.game_type,'start',v_start
  );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
END;
$function$

;
DO $$BEGIN IF md5(pg_get_functiondef('private.megatouch_frozen_stake()'::regprocedure))<>'7cb8ab5438eefebc92518d8e3f2877bc' THEN RAISE EXCEPTION 'originals:owner_changed:private.megatouch_frozen_stake';END IF;END $$;
CREATE OR REPLACE FUNCTION private.megatouch_frozen_stake()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF OLD.game_type IN('ptown-words','quintzee','eleven-up','tri-towers','run21','royal-flash','take-two','trip-flip','boxdrop','race-poker','battle-31','six-card-golf','mega-card-golf','crib-lab','chucky-showdown') AND NEW.config IS DISTINCT FROM OLD.config THEN RAISE EXCEPTION 'megatouch:configuration_frozen';END IF;RETURN NEW;
END $function$

;
CREATE TRIGGER originals_live_roster_guard BEFORE UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION private.originals_live_roster_guard();
;
DO $$BEGIN IF md5(pg_get_functiondef('private.delayed_words_recover()'::regprocedure))<>'3a518efb050fc463ba5721c9aba240fb' THEN RAISE EXCEPTION 'originals:recovery_owner_changed';END IF;END $$;
CREATE OR REPLACE FUNCTION private.delayed_words_recover()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE s private.delayed_recovery_state;last_tick_i timestamptz;t uuid:=gen_random_uuid();n integer;
BEGIN
 PERFORM private.delayed_words_check_health();
 SELECT last_tick INTO last_tick_i FROM private.delayed_words_health WHERE singleton;
 n:=private.delayed_words_recover_local();
 SELECT * INTO STRICT s FROM private.delayed_recovery_state WHERE singleton FOR UPDATE;
 IF NOT s.enabled THEN RETURN n;END IF;
 IF s.token IS NOT NULL AND s.expires_at>clock_timestamp() THEN
  UPDATE private.delayed_words_health SET last_tick=last_tick_i WHERE singleton;RETURN n;
 END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_children c JOIN private.delayed_matches m ON m.id=c.match_id
  WHERE m.status='active' AND NOT private.delayed_held(m.id) AND NOT c.terminal AND c.game_type<>'ptown-words'
   AND least(c.expires_at,c.gameplay_due_at)<=clock_timestamp()) AND NOT EXISTS(SELECT FROM private.originals_live_matches WHERE NOT finished AND paused_at IS NULL AND CASE WHEN settlement IS NULL THEN (state->>'deadline')::bigint ELSE (state#>>'{terminal,deadline}')::bigint END<=floor(extract(epoch FROM clock_timestamp())*1000)) AND NOT EXISTS(SELECT FROM private.mega_live_matches WHERE NOT finished AND paused_at IS NULL AND CASE WHEN settlement IS NULL THEN (state->>'deadline')::bigint ELSE (state#>>'{terminal,deadline}')::bigint END<=floor(extract(epoch FROM clock_timestamp())*1000)) THEN RETURN n;END IF;
 UPDATE private.delayed_words_health SET last_tick=last_tick_i WHERE singleton;
 UPDATE private.delayed_recovery_state SET token=t,claimed=false,expires_at=clock_timestamp()+interval '25 seconds',
  failure=CASE WHEN s.token IS NOT NULL THEN 'delayed:lease_expired' ELSE failure END WHERE singleton;
 PERFORM net.http_post(url:='https://xvhmbuppghwmwpwrkzao.supabase.co/functions/v1/delayed-recovery',
  headers:=jsonb_build_object('Content-Type','application/json','x-delayed-dispatch',t::text),body:='{}'::jsonb,timeout_milliseconds:=20000);
 RETURN n;
END $function$
;
