-- Local candidate only. Admission remains closed in both money modes.
CREATE TABLE private.mega_competition_release(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),schema_revision text NOT NULL DEFAULT 'mega-competition/1',live_enabled boolean NOT NULL DEFAULT false,async_enabled boolean NOT NULL DEFAULT false);
INSERT INTO private.mega_competition_release DEFAULT VALUES;
ALTER TABLE private.mega_competition_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.mega_competition_release FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.game_defaults ADD COLUMN mega_course text NOT NULL DEFAULT 'sunny-meadows',ADD COLUMN mega_holes integer NOT NULL DEFAULT 9 CHECK(mega_holes IN(3,6,9,18));
INSERT INTO public.game_defaults(game_type,ante_amount) VALUES('mega-card-golf',5) ON CONFLICT(game_type) DO NOTHING;
UPDATE public.game_defaults SET presentation_mode='fullscreen' WHERE game_type='mega-card-golf';

CREATE FUNCTION private.mega_competition_config(selection jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE c private.arcade_mega_configs;course_i text;holes_i integer;answer jsonb;ruleset_i text;
BEGIN
 SELECT coalesce(selection#>>'{course,id}',mega_course),coalesce((selection#>>'{course,holes}')::integer,mega_holes) INTO course_i,holes_i FROM public.game_defaults WHERE game_type='mega-card-golf';
 SELECT cfg.* INTO c FROM private.arcade_mega_courses catalog JOIN private.arcade_mega_configs cfg ON cfg.id=catalog.config_id WHERE catalog.id=course_i;
 IF NOT FOUND OR NOT coalesce((c.settings->>'enabled')::boolean,false) OR holes_i NOT IN(3,6,9,18) THEN RAISE EXCEPTION 'mega:invalid_course';END IF;
 SELECT id INTO ruleset_i FROM private.arcade_rulesets WHERE game='mega-card-golf' AND id IN('mega-card-golf/1','mega-card-golf/2','mega-card-golf/3','mega-card-golf/4') AND enabled ORDER BY id DESC LIMIT 1;
 IF ruleset_i IS NULL THEN RAISE EXCEPTION 'mega:rules_unavailable';END IF;
 answer:=jsonb_build_object('version',ruleset_i,'course',private.mega_config(c)||jsonb_build_object('holes',holes_i));
 IF selection IS NOT NULL AND selection IS DISTINCT FROM answer THEN RAISE EXCEPTION 'mega:configuration_changed';END IF;
 RETURN answer;
END $$;
CREATE FUNCTION private.mega_competition_courses() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(private.mega_config(c) ORDER BY c.course),'[]') FROM private.arcade_mega_courses a JOIN private.arcade_mega_configs c ON c.id=a.config_id
$$;
CREATE FUNCTION public.mega_competition_catalog(p_game uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM public.profiles WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'mega:authentication_required' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('courses',private.mega_competition_courses(),'defaults',private.mega_competition_config(),'enabled',
  (SELECT live_enabled FROM private.mega_competition_release WHERE singleton) AND (p_game IS NULL OR EXISTS(SELECT FROM public.players WHERE game_id=p_game AND user_id=auth.uid() AND status<>'left')));
END $$;
REVOKE ALL ON FUNCTION private.mega_competition_config(jsonb),private.mega_competition_courses(),public.mega_competition_catalog(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mega_competition_catalog(uuid) TO authenticated;

CREATE FUNCTION private.mega_assert_board(b jsonb,cfg jsonb,prior jsonb DEFAULT NULL) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb;i integer:=0;total bigint:=0;d jsonb;
BEGIN
 IF b->'config' IS DISTINCT FROM cfg->'course' OR b->>'ruleset' IS DISTINCT FROM cfg->>'version' OR jsonb_typeof(b->'results') IS DISTINCT FROM 'array'
 OR jsonb_typeof(b->'decks') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'decks')<>(cfg#>>'{course,holes}')::integer THEN RAISE EXCEPTION 'mega:invalid_board';END IF;
 IF prior IS NOT NULL AND (b->>'id' IS DISTINCT FROM prior->>'id' OR b->>'owner' IS DISTINCT FROM prior->>'owner' OR b->'decks' IS DISTINCT FROM prior->'decks') THEN RAISE EXCEPTION 'mega:board_identity_changed';END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(b->'decks') LOOP
  IF jsonb_array_length(d)<>52 OR (SELECT count(DISTINCT value::integer) FROM jsonb_array_elements_text(d) WHERE value::integer BETWEEN 0 AND 51)<>52 THEN RAISE EXCEPTION 'mega:invalid_deck';END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(b->'results') LOOP
  i:=i+1;total:=total+private.golf_score(r->'cards');
  IF (r->>'hole')::integer IS DISTINCT FROM i OR (r->>'score')::bigint IS DISTINCT FROM private.golf_score(r->'cards') OR (r->>'total')::bigint IS DISTINCT FROM total
   OR (i<=jsonb_array_length(coalesce(prior->'results','[]')) AND r IS DISTINCT FROM prior->'results'->(i-1)) THEN RAISE EXCEPTION 'mega:invalid_hole_result';END IF;
 END LOOP;
 IF (b->>'score')::bigint IS DISTINCT FROM total OR i<jsonb_array_length(coalesce(prior->'results','[]')) OR i>(cfg#>>'{course,holes}')::integer THEN RAISE EXCEPTION 'mega:invalid_total';END IF;
END $$;
REVOKE ALL ON FUNCTION private.mega_assert_board(jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.mega_live_matches(
 dealer_game_id uuid PRIMARY KEY REFERENCES public.dealer_games(id),game_id uuid NOT NULL REFERENCES public.games(id),round_id uuid NOT NULL REFERENCES public.rounds(id),
 state jsonb NOT NULL,revision bigint NOT NULL DEFAULT 0,stake integer NOT NULL CHECK(stake BETWEEN 1 AND 9999),
 settlement jsonb,finished boolean NOT NULL DEFAULT false,paused_at bigint,player_controls jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX mega_live_due ON private.mega_live_matches(((state->>'deadline')::bigint)) WHERE NOT finished AND paused_at IS NULL;
CREATE TABLE private.mega_live_requests(dealer_game_id uuid NOT NULL REFERENCES private.mega_live_matches(dealer_game_id),request_id uuid NOT NULL,actor uuid NOT NULL,fingerprint text NOT NULL,PRIMARY KEY(dealer_game_id,request_id));
ALTER TABLE private.mega_live_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.mega_live_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.mega_live_matches,private.mega_live_requests FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.mega_live_revisions(dealer_game_id uuid PRIMARY KEY REFERENCES private.mega_live_matches(dealer_game_id),game_id uuid NOT NULL,revision bigint NOT NULL);
ALTER TABLE public.mega_live_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mega_live_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.mega_live_revisions TO authenticated;
CREATE POLICY mega_live_members ON public.mega_live_revisions FOR SELECT TO authenticated USING(EXISTS(SELECT FROM public.players WHERE game_id=mega_live_revisions.game_id AND user_id=(SELECT auth.uid()) AND status<>'left'));
DO $$BEGIN IF EXISTS(SELECT FROM pg_publication WHERE pubname='supabase_realtime') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.mega_live_revisions;END IF;END $$;

CREATE FUNCTION private.mega_live_actor_allowed(actor uuid,session_id uuid DEFAULT NULL,match_id uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.profiles WHERE id=actor AND is_active) AND ((SELECT live_enabled FROM private.mega_competition_release WHERE singleton)
 OR EXISTS(SELECT FROM public.dealer_games d WHERE d.session_id=mega_live_actor_allowed.session_id AND d.game_type='mega-card-golf' AND (match_id IS NULL OR d.id=match_id)))
$$;
CREATE FUNCTION private.mega_live_admission_allowed(actor uuid,session_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.profiles WHERE id=actor AND is_active) AND (SELECT live_enabled FROM private.mega_competition_release WHERE singleton)
$$;
CREATE FUNCTION private.mega_live_supported_rules(rules jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT rules->>'version' IN('mega-card-golf/1','mega-card-golf/2','mega-card-golf/3','mega-card-golf/4') AND rules#>'{course,holes}' IN('3'::jsonb,'6'::jsonb,'9'::jsonb,'18'::jsonb) AND rules->'holes'=rules#>'{course,holes}'
$$;
CREATE FUNCTION private.mega_live_record(m private.mega_live_matches,actor uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT to_jsonb(m)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000),'viewer',(SELECT id FROM public.players WHERE game_id=m.game_id AND user_id=actor AND NOT is_bot),
 'financial',jsonb_build_object('balances',CASE WHEN m.settlement IS NULL THEN (SELECT jsonb_object_agg(id::text,chips) FROM public.players WHERE game_id=m.game_id) ELSE (SELECT jsonb_object_agg(player_id::text,chips) FROM public.session_player_snapshots WHERE dealer_game_id=m.dealer_game_id AND hand_number=1) END,
 'resultId',(SELECT id FROM public.game_results WHERE dealer_game_id=m.dealer_game_id AND settlement_key='mega_live_terminal'),
 'batch',(SELECT to_jsonb(b) FROM public.gameplay_transfer_batches b WHERE dealer_game_id=m.dealer_game_id ORDER BY cursor DESC LIMIT 1)))
$$;
CREATE FUNCTION private.mega_live_authorize(m private.mega_live_matches,actor uuid,token uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF actor IS NULL THEN
  IF NOT EXISTS(SELECT FROM private.delayed_recovery_state r WHERE r.singleton AND r.claimed AND r.token=mega_live_authorize.token AND r.expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'mega:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.mega_live_actor_allowed(actor,m.game_id,m.dealer_game_id) OR NOT EXISTS(SELECT FROM public.players p WHERE p.game_id=m.game_id AND p.user_id=actor AND p.status<>'left') THEN RAISE EXCEPTION 'mega:participant_required' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION public.mega_live_load(p_match uuid,p_actor uuid,p_request uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.mega_live_matches;r private.mega_live_requests;
BEGIN
 SELECT * INTO STRICT m FROM private.mega_live_matches WHERE dealer_game_id=p_match;
 IF p_actor IS NULL THEN RAISE EXCEPTION 'mega:authentication_required';END IF;
 PERFORM private.mega_live_authorize(m,p_actor);
 SELECT * INTO r FROM private.mega_live_requests WHERE dealer_game_id=p_match AND request_id=p_request;
 RETURN private.mega_live_record(m,p_actor)||jsonb_build_object('receipt',CASE WHEN r.request_id IS NOT NULL THEN to_jsonb(r) END);
END $$;
CREATE FUNCTION private.mega_live_publish() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.mega_live_revisions VALUES(NEW.dealer_game_id,NEW.game_id,NEW.revision) ON CONFLICT(dealer_game_id) DO UPDATE SET revision=EXCLUDED.revision;
 RETURN NEW;
END $$;
CREATE TRIGGER mega_live_publish AFTER INSERT OR UPDATE ON private.mega_live_matches FOR EACH ROW EXECUTE FUNCTION private.mega_live_publish();
CREATE FUNCTION private.mega_live_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.game_id IS DISTINCT FROM OLD.game_id OR NEW.dealer_game_id IS DISTINCT FROM OLD.dealer_game_id OR NEW.stake IS DISTINCT FROM OLD.stake OR NEW.round_id IS DISTINCT FROM OLD.round_id
 OR NEW.state->'identity' IS DISTINCT FROM OLD.state->'identity' OR NEW.state->'rules' IS DISTINCT FROM OLD.state->'rules' OR NEW.state->'players' IS DISTINCT FROM OLD.state->'players'
 OR (OLD.settlement IS NOT NULL AND (NEW.settlement IS DISTINCT FROM OLD.settlement OR NEW.state-ARRAY['terminal','presentation','deadline','board'] IS DISTINCT FROM OLD.state-ARRAY['terminal','presentation','deadline','board']
 OR (NEW.state->'terminal')-ARRAY['startedAt','deadline'] IS DISTINCT FROM (OLD.state->'terminal')-ARRAY['startedAt','deadline']
 OR (NEW.state->'board')-ARRAY['deadline','revision'] IS DISTINCT FROM (OLD.state->'board')-ARRAY['deadline','revision'])) THEN RAISE EXCEPTION 'mega:immutable_match';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mega_live_guard BEFORE UPDATE ON private.mega_live_matches FOR EACH ROW EXECUTE FUNCTION private.mega_live_guard();


CREATE OR REPLACE FUNCTION public.mega_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.mega_live_actor_allowed(actor,p_game_id) OR p_game_type IS DISTINCT FROM 'mega-card-golf' THEN RAISE EXCEPTION 'mega:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'mega:dealer_required' USING ERRCODE='42501';END IF;

 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'mega:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 IF p_config ? 'holes' AND p_config->'holes' NOT IN ('3'::jsonb,'6'::jsonb,'9'::jsonb,'18'::jsonb) THEN RAISE EXCEPTION 'mega:holes';END IF;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'mega:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'mega:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT private.mega_live_admission_allowed(actor,g.id) THEN RAISE EXCEPTION 'mega:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'mega:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.mega_live_admission_allowed(user_id,g.id)) THEN RAISE EXCEPTION 'mega:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'mega:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 8 THEN RAISE EXCEPTION 'mega:player_count';END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(people) p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'mega:humans_required';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'mega:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'mega-card-golf',jsonb_build_object('ante_amount',stake_i,'rules',private.mega_competition_config(p_config->'mega')||jsonb_build_object('holes',coalesce(p_config#>'{mega,course,holes}','9'::jsonb)))) RETURNING * INTO dg;
 -- Freeze already-authorized access for this match. Expiry/revocation prevents
 -- new matches, but cannot strand accepted liabilities or an unresolved offer.

 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='mega-card-golf',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$
;

CREATE OR REPLACE FUNCTION private.mega_live_begin(p_game uuid, p_dealer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; dg public.dealer_games; people jsonb; s jsonb; r uuid:=gen_random_uuid(); n integer; stake_i integer;
BEGIN
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game FOR UPDATE;
 SELECT * INTO STRICT dg FROM public.dealer_games WHERE id=p_dealer AND session_id=p_game;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer OR g.status<>'ante_decision' OR g.game_type IS DISTINCT FROM 'mega-card-golf' OR g.is_paused THEN RAISE EXCEPTION 'mega:ante_identity';END IF;
 stake_i:=(dg.config->>'ante_amount')::integer;
 IF g.ante_amount IS DISTINCT FROM stake_i OR NOT private.mega_live_supported_rules(dg.config->'rules') THEN RAISE EXCEPTION 'mega:configuration_changed';END IF;
 PERFORM 1 FROM public.players WHERE game_id=p_game ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=p_game AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND ante_decision IS NULL) THEN RAISE EXCEPTION 'mega:acceptance_pending';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot,'chips',p.chips)
  ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id)
 INTO people FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.game_id=p_game AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL AND p.ante_decision='ante_up';
 n:=jsonb_array_length(people);
 IF n NOT BETWEEN 2 AND 8 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE NOT (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'mega:accepted_player_count';END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(people) p WHERE NOT (p->>'isBot')::boolean AND NOT private.mega_live_actor_allowed((p->>'userId')::uuid,g.id,dg.id)) THEN RAISE EXCEPTION 'mega:tester_required' USING ERRCODE='42501';END IF;
 UPDATE public.games SET status='in_progress',ante_decision_deadline=NULL,current_round=1,total_hands=1 WHERE id=p_game;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
 VALUES(r,p_game,p_dealer,1,1,0,'betting',0);
 s:=jsonb_build_object('identity',jsonb_build_object('sessionId',p_game,'dealerGameId',p_dealer,'roundId',r),'rules',dg.config->'rules',
  'players',people,'hole',1,'dealerIndex',n-1,'scores',(SELECT jsonb_object_agg(p->>'id',0) FROM jsonb_array_elements(people) p),'holes','[]'::jsonb);
 s:=s||jsonb_build_object('phase','ready','turnIndex',0,'deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint,'board',NULL,'runs','{}'::jsonb,'results','[]'::jsonb);
 INSERT INTO private.mega_live_matches(dealer_game_id,game_id,round_id,state,stake,player_controls)
 VALUES(p_dealer,p_game,r,s,stake_i,(SELECT jsonb_object_agg(p.id::text,jsonb_build_object('autoPlay',p.auto_fold,'sitOutNextHand',p.sit_out_next_hand,'intentVersion',p.intent_version)) FROM public.players p WHERE p.game_id=p_game AND p.id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(people) x)));
 RETURN jsonb_build_object('dealerGameId',p_dealer,'roundId',r);
END $function$
;

CREATE OR REPLACE FUNCTION private.mega_live_settle(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.mega_live_matches; g public.games; winners uuid[]; win_count integer; total integer; deltas jsonb; transfers jsonb:='[]';
 result_id uuid; player jsonb; winner uuid; loser uuid; amount integer; changes jsonb:='{}'; allocated integer;
BEGIN
 SELECT * INTO STRICT m FROM private.mega_live_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.game_type IS DISTINCT FROM 'mega-card-golf' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.status<>'in_progress' OR g.is_paused
  OR m.state->>'phase'<>'complete' OR jsonb_array_length(m.state->'holes')<>coalesce((m.state#>>'{rules,holes}')::integer,9) OR (SELECT count(*) FROM jsonb_object_keys(m.state->'scores'))<>jsonb_array_length(m.state->'players') THEN RAISE EXCEPTION 'mega:not_terminal'; END IF;
 SELECT array_agg(key::uuid ORDER BY key) INTO winners FROM jsonb_each_text(m.state->'scores') WHERE value::integer=(SELECT min(value::integer) FROM jsonb_each_text(m.state->'scores'));
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
  IF allocated<>0 THEN RAISE EXCEPTION 'mega:unbalanced_settlement'; END IF;
 END LOOP;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(m.game_id,m.dealer_game_id,1,'mega_live_terminal','mega-card-golf',CASE WHEN win_count=1 THEN winners[1] END,
  CASE WHEN win_count>1 THEN 'Tie' ELSE (SELECT p->>'name' FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=winners[1]::text) END,
  'Mega Card Golf: '||(m.state->'scores')::text,total,changes,win_count>1) RETURNING id INTO result_id;
 IF jsonb_array_length(transfers)>0 THEN PERFORM public.settle_gameplay_chip_transfers(m.game_id,transfers,'win'); END IF;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
 UPDATE private.mega_live_matches SET settlement=changes,revision=revision+1,state=state||jsonb_build_object('terminal',jsonb_build_object('resultId',result_id,'winnerIds',to_jsonb(winners),'score',(SELECT min(value::bigint) FROM jsonb_each_text(m.state->'scores')),'startedAt',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,endsAt}')::bigint,0)),'deadline',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,endsAt}')::bigint,0))+3000)) WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result='Mega Card Golf complete',awaiting_next_round=false WHERE id=m.game_id;
END $function$
;

CREATE OR REPLACE FUNCTION private.mega_live_finish_postgame(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.mega_live_matches; g public.games; positions integer[]; next_seat integer; target text; winner uuid; make_take boolean;
BEGIN
 SELECT * INTO STRICT m FROM private.mega_live_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.mega_live_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NULL THEN RAISE EXCEPTION 'mega:close_denied' USING ERRCODE='42501';END IF;
 IF m.finished OR g.is_paused OR m.paused_at IS NOT NULL THEN RETURN;END IF;
 IF coalesce((m.state#>>'{terminal,deadline}')::bigint,0)>floor(extract(epoch FROM clock_timestamp())*1000) THEN RETURN;END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'mega-card-golf' OR g.status NOT IN ('game_over','session_ended') THEN RAISE EXCEPTION 'mega:close_identity';END IF;
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
    SELECT winner_player_id INTO winner FROM public.game_results WHERE dealer_game_id=m.dealer_game_id AND settlement_key='mega_live_terminal';
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
 UPDATE private.mega_live_matches SET finished=true,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
END $function$
;

CREATE FUNCTION public.mega_live_commit(p_match uuid,p_actor uuid,p_revision bigint,p_state jsonb,p_request uuid DEFAULT NULL,p_fingerprint text DEFAULT NULL,p_token uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.mega_live_matches;g public.games;r private.mega_live_requests;at_ms bigint;i integer:=0;result jsonb;person jsonb;prior jsonb;total bigint;
BEGIN
 SELECT * INTO STRICT m FROM private.mega_live_matches WHERE dealer_game_id=p_match;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.mega_live_matches WHERE dealer_game_id=p_match FOR UPDATE;
 PERFORM private.mega_live_authorize(m,p_actor,p_token);
 IF p_request IS NOT NULL THEN
  SELECT * INTO r FROM private.mega_live_requests WHERE dealer_game_id=p_match AND request_id=p_request;
  IF FOUND THEN
   IF r.actor IS DISTINCT FROM p_actor OR r.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'mega:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.mega_live_record(m,p_actor));
  END IF;
 END IF;
 IF m.revision IS DISTINCT FROM p_revision OR m.settlement IS NOT NULL OR m.finished THEN RETURN jsonb_build_object('outcome','conflict','record',private.mega_live_record(m,p_actor));END IF;
 IF g.is_paused OR g.status<>'in_progress' OR g.current_game_uuid IS DISTINCT FROM p_match OR g.game_type IS DISTINCT FROM 'mega-card-golf' THEN RAISE EXCEPTION 'mega:inactive';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_request IS NOT NULL THEN
  IF p_actor IS NULL OR p_fingerprint IS NULL OR m.state->'players'->(m.state->>'turnIndex')::integer->>'userId' IS DISTINCT FROM p_actor::text THEN RAISE EXCEPTION 'mega:not_actor';END IF;
  IF at_ms>=(m.state->>'deadline')::bigint THEN RETURN jsonb_build_object('outcome','deadline','record',private.mega_live_record(m,p_actor));END IF;
 ELSE IF at_ms<(m.state->>'deadline')::bigint THEN RAISE EXCEPTION 'mega:early_recovery';END IF;END IF;
 IF p_state->'identity' IS DISTINCT FROM m.state->'identity' OR p_state->'rules' IS DISTINCT FROM m.state->'rules' OR p_state->'players' IS DISTINCT FROM m.state->'players' THEN RAISE EXCEPTION 'mega:identity_changed';END IF;
 IF p_state->'board' IS NOT NULL AND p_state->'board'<>'null'::jsonb THEN
  prior:=CASE WHEN p_state#>>'{board,id}'=m.state#>>'{board,id}' THEN m.state->'board' ELSE m.state->'runs'->(p_state#>>'{board,owner}') END;
  PERFORM private.mega_assert_board(p_state->'board',p_state->'rules',prior);
 END IF;
 FOR result IN SELECT value FROM jsonb_array_elements(p_state->'results') LOOP
  i:=i+1;
  IF (result->>'score')::bigint IS DISTINCT FROM private.golf_score(result->'cards') OR (i<=jsonb_array_length(m.state->'results') AND result IS DISTINCT FROM m.state->'results'->(i-1)) THEN RAISE EXCEPTION 'mega:invalid_result';END IF;
 END LOOP;
 IF i<jsonb_array_length(m.state->'results') OR i>jsonb_array_length(m.state->'results')+1 THEN RAISE EXCEPTION 'mega:result_count';END IF;
 FOR person IN SELECT value FROM jsonb_array_elements(p_state->'players') LOOP
  SELECT coalesce(sum((value->>'score')::bigint),0) INTO total FROM jsonb_array_elements(p_state->'results') WHERE value->>'actor'=person->>'id';
  IF (p_state->'scores'->>(person->>'id'))::bigint IS DISTINCT FROM total THEN RAISE EXCEPTION 'mega:invalid_total';END IF;
 END LOOP;
 IF p_state->>'phase'='complete' AND (i<>(p_state#>>'{rules,course,holes}')::int*jsonb_array_length(p_state->'players') OR jsonb_array_length(p_state->'holes')<>(p_state#>>'{rules,course,holes}')::int) THEN RAISE EXCEPTION 'mega:incomplete';END IF;
 UPDATE private.mega_live_matches SET state=p_state,revision=revision+1 WHERE dealer_game_id=p_match RETURNING * INTO m;
 IF p_request IS NOT NULL THEN INSERT INTO private.mega_live_requests VALUES(p_match,p_request,p_actor,p_fingerprint);END IF;
 IF p_state->>'phase'='complete' THEN PERFORM private.mega_live_settle(p_match);SELECT * INTO m FROM private.mega_live_matches WHERE dealer_game_id=p_match;END IF;
 RETURN jsonb_build_object('outcome','committed','record',private.mega_live_record(m,p_actor));
END $$;
CREATE FUNCTION public.mega_live_finish(p_match uuid,p_actor uuid,p_token uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.mega_live_matches;
BEGIN
 SELECT * INTO STRICT m FROM private.mega_live_matches WHERE dealer_game_id=p_match;
 PERFORM private.mega_live_authorize(m,p_actor,p_token);
 PERFORM private.mega_live_finish_postgame(p_match);
 SELECT * INTO m FROM private.mega_live_matches WHERE dealer_game_id=p_match;
 RETURN private.mega_live_record(m,p_actor);
END $$;
CREATE FUNCTION private.mega_live_pause() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.mega_live_matches;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);delta bigint;
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'mega-card-golf' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 SELECT * INTO m FROM private.mega_live_matches WHERE dealer_game_id=NEW.current_game_uuid AND NOT finished FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN UPDATE private.mega_live_matches SET paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 ELSIF m.paused_at IS NOT NULL THEN
  delta:=at_ms-m.paused_at;m.state:=jsonb_set(m.state,'{deadline}',to_jsonb((m.state->>'deadline')::bigint+delta));
  IF m.state->'board'<>'null'::jsonb THEN m.state:=jsonb_set(jsonb_set(m.state,'{board,deadline}',to_jsonb((m.state#>>'{board,deadline}')::bigint+delta)),'{board,revision}',to_jsonb((m.state#>>'{board,revision}')::bigint+1));END IF;
  IF m.state ? 'presentation' THEN m.state:=jsonb_set(m.state,'{presentation}',jsonb_build_object('startedAt',(m.state#>>'{presentation,startedAt}')::bigint+delta,'endsAt',(m.state#>>'{presentation,endsAt}')::bigint+delta));END IF;
  IF m.state ? 'terminal' THEN m.state:=jsonb_set(jsonb_set(m.state,'{terminal,startedAt}',to_jsonb((m.state#>>'{terminal,startedAt}')::bigint+delta)),'{terminal,deadline}',to_jsonb((m.state#>>'{terminal,deadline}')::bigint+delta));END IF;
  UPDATE private.mega_live_matches SET state=m.state,paused_at=NULL,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER mega_live_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW WHEN(NEW.game_type='mega-card-golf') EXECUTE FUNCTION private.mega_live_pause();
-- Explicit service-only full-state boundary; browser clients submit typed actions via Auth API.
REVOKE ALL ON FUNCTION public.mega_live_load(uuid,uuid,uuid),public.mega_live_commit(uuid,uuid,bigint,jsonb,uuid,text,uuid),public.mega_live_finish(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mega_live_load(uuid,uuid,uuid),public.mega_live_commit(uuid,uuid,bigint,jsonb,uuid,text,uuid),public.mega_live_finish(uuid,uuid,uuid) TO service_role;
DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'mega_live_%' LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;END $$;


CREATE OR REPLACE FUNCTION private.mega_live_roster_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.mega_live_matches;
BEGIN
 IF TG_OP='INSERT' THEN
  IF EXISTS(SELECT 1 FROM private.mega_live_matches WHERE game_id=NEW.game_id AND settlement IS NULL AND NOT finished) THEN NEW.waiting:=true;END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO m FROM private.mega_live_matches WHERE game_id=OLD.game_id AND settlement IS NULL AND NOT finished
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(state->'players') p WHERE p->>'id'=OLD.id::text);
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'mega:match_liability_committed';END IF;
 IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.game_id IS DISTINCT FROM OLD.game_id OR NEW.is_bot IS DISTINCT FROM OLD.is_bot THEN RAISE EXCEPTION 'mega:participant_identity_frozen';END IF;
 IF NEW.position IS DISTINCT FROM OLD.position OR NEW.status IN ('left','observer') THEN
  NEW.position:=OLD.position;NEW.status:=OLD.status;NEW.stand_up_next_hand:=true;
 END IF;
 IF NEW.sitting_out AND NOT OLD.sitting_out THEN NEW.sitting_out:=OLD.sitting_out;NEW.sit_out_next_hand:=true;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mega_live_committed_roster BEFORE INSERT OR UPDATE OR DELETE ON public.players FOR EACH ROW EXECUTE FUNCTION private.mega_live_roster_guard();


ALTER TABLE private.delayed_children DROP CONSTRAINT delayed_children_game_type_check; ALTER TABLE private.delayed_children ADD CONSTRAINT delayed_children_game_type_check CHECK(game_type IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf'));

DO $guard$ BEGIN IF md5(pg_get_functiondef('private.advance_ante_phase_exact(uuid,uuid,timestamp with time zone,timestamp with time zone)'::regprocedure)) IS DISTINCT FROM '500feda0618a8fc3d87a9962ecde2733' THEN RAISE EXCEPTION 'mega:owner_changed:private.advance_ante_phase_exact(uuid,uuid,timestamp with time zone,timestamp with time zone)';END IF;END $guard$;
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

DO $guard$ BEGIN IF md5(pg_get_functiondef('private.megatouch_frozen_stake()'::regprocedure)) IS DISTINCT FROM '7de30f9264a963eab60046c48c3a9de8' THEN RAISE EXCEPTION 'mega:owner_changed:private.megatouch_frozen_stake()';END IF;END $guard$;
CREATE OR REPLACE FUNCTION private.megatouch_frozen_stake()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF OLD.game_type IN('ptown-words','quintzee','eleven-up','tri-towers','run21','royal-flash','take-two','trip-flip','boxdrop','race-poker','battle-31','six-card-golf','mega-card-golf') AND NEW.config IS DISTINCT FROM OLD.config THEN RAISE EXCEPTION 'megatouch:configuration_frozen';END IF;RETURN NEW;
END $function$
;

DO $guard$ BEGIN IF md5(pg_get_functiondef('delayed_load(uuid,uuid,uuid)'::regprocedure)) IS DISTINCT FROM '5bbd2de0f555eb64d28033b5e1f6a19d' THEN RAISE EXCEPTION 'mega:owner_changed:delayed_load(uuid,uuid,uuid)';END IF;END $guard$;
CREATE OR REPLACE FUNCTION public.delayed_load(p_child uuid, p_actor uuid, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;
BEGIN
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  PERFORM private.delayed_actor(p_actor);
  IF p_actor NOT IN(m.organizer,m.opponent) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 END IF;
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop','mega-card-golf') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
 IF m.status NOT IN('active','settled') THEN RAISE EXCEPTION 'delayed:not_active';END IF;
 SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
 RETURN private.delayed_child_record(c)||jsonb_build_object('reviewed',(SELECT coalesce(jsonb_agg(e.actor::text||':'||e.round),'[]') FROM private.delayed_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=p_actor WHERE e.child_id=c.id AND e.kind='attempt'),'receipt',CASE WHEN r.request_id IS NOT NULL THEN to_jsonb(r) END);
END $function$
;

DO $guard$ BEGIN IF md5(pg_get_functiondef('delayed_commit(uuid,uuid,bigint,jsonb,text,bigint,boolean,uuid,jsonb)'::regprocedure)) IS DISTINCT FROM '7b2905adc4c1fe7f870ca34e511548b7' THEN RAISE EXCEPTION 'mega:owner_changed:delayed_commit(uuid,uuid,bigint,jsonb,text,bigint,boolean,uuid,jsonb)';END IF;END $guard$;
CREATE OR REPLACE FUNCTION public.delayed_commit(p_child uuid, p_actor uuid, p_revision bigint, p_state jsonb, p_event text, p_at bigint, p_advanced boolean, p_request uuid DEFAULT NULL::uuid, p_fingerprint jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;now_i timestamptz;event_time timestamptz;
 done boolean;next_actor uuid;next_due bigint;expected_due timestamptz;
BEGIN
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 IF p_actor IS NOT NULL AND p_request IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,319));
 END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  PERFORM private.delayed_actor(p_actor);
  IF p_actor NOT IN(m.organizer,m.opponent) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501';END IF;
 END IF;
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop','mega-card-golf') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
 IF p_request IS NOT NULL THEN
  SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
  IF FOUND THEN
   IF r.child_id IS DISTINCT FROM p_child OR r.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.delayed_child_record(c));
  END IF;
 END IF;
 IF c.revision IS DISTINCT FROM p_revision OR c.terminal THEN RETURN jsonb_build_object('outcome','conflict','record',private.delayed_child_record(c)); END IF;
 IF m.status<>'active' OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:held';END IF;
 now_i:=clock_timestamp();event_time:=to_timestamp(p_at/1000.0);
 expected_due:=least(c.expires_at,c.gameplay_due_at);
 IF p_event='action' THEN
  IF p_actor IS DISTINCT FROM c.actor OR p_request IS NULL OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'delayed:not_your_turn';END IF;
  IF now_i>=expected_due THEN RETURN jsonb_build_object('outcome','deadline','record',private.delayed_child_record(c)); END IF;
 ELSIF p_event='tick' THEN
  IF p_request IS NOT NULL OR now_i<expected_due OR abs(extract(epoch FROM expected_due)*1000-p_at)>=1 THEN RAISE EXCEPTION 'delayed:invalid_tick'; END IF;
  IF c.expires_at<=coalesce(c.gameplay_due_at,c.expires_at) THEN
   PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);
   SELECT * INTO c FROM private.delayed_children WHERE id=p_child;
   RETURN jsonb_build_object('outcome','committed','record',private.delayed_child_record(c));
  END IF;
 ELSE RAISE EXCEPTION 'delayed:invalid_event';END IF;
 IF event_time>now_i OR event_time<c.available_at-interval '1 millisecond' OR p_state->>'version' IS DISTINCT FROM 'delayed/1'
  OR p_state->>'child' IS DISTINCT FROM c.id::text OR p_state->>'game' IS DISTINCT FROM c.game_type
  OR p_advanced IS NULL THEN RAISE EXCEPTION 'delayed:invalid_state';END IF;
 done:=coalesce((p_state->>'completed')::boolean,false);
 next_actor:=(p_state->'players'->>(p_state->>'turn')::integer)::uuid;
 IF next_actor IS NULL OR next_actor NOT IN(m.organizer,m.opponent) OR (NOT p_advanced AND next_actor<>c.actor) OR (done AND NOT p_advanced)
 THEN RAISE EXCEPTION 'delayed:invalid_actor';END IF;
 next_due:=(p_state#>>'{board,deadline}')::bigint;
 UPDATE private.delayed_children SET state=p_state,revision=revision+1,
  actor=next_actor,segment=segment+CASE WHEN p_advanced THEN 1 ELSE 0 END,
  available_at=CASE WHEN p_advanced THEN event_time ELSE available_at END,
  last_call_at=CASE WHEN p_advanced THEN event_time+interval '24 hours' ELSE last_call_at END,
  expires_at=CASE WHEN p_advanced THEN event_time+interval '36 hours' ELSE expires_at END,
  started_at=to_timestamp((p_state->>'segmentStartedAt')::bigint/1000.0),gameplay_due_at=to_timestamp(next_due/1000.0)
 WHERE id=c.id RETURNING * INTO c;
 IF done THEN
  PERFORM private.delayed_record_outcome(c.id,c.revision,CASE WHEN p_state->>'winner' IS NULL THEN 'draw' ELSE 'normal' END,
   (p_state->>'winner')::uuid,jsonb_build_object('rules',c.config,'finalState',p_state));
 ELSE
  UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
  PERFORM private.delayed_notify(m.id);
 END IF;
 SELECT * INTO c FROM private.delayed_children WHERE id=p_child;
 IF p_request IS NOT NULL THEN INSERT INTO private.delayed_commands VALUES(p_actor,p_request,p_child,p_fingerprint,c.revision);END IF;
 RETURN jsonb_build_object('outcome','committed','record',private.delayed_child_record(c));
END $function$
;

DO $guard$ BEGIN IF md5(pg_get_functiondef('delayed_create(uuid,uuid,boolean,jsonb)'::regprocedure)) IS DISTINCT FROM '9da1b8a1efceb779d86edb1730f5d7f4' THEN RAISE EXCEPTION 'mega:owner_changed:delayed_create(uuid,uuid,boolean,jsonb)';END IF;END $guard$;
CREATE OR REPLACE FUNCTION public.delayed_create(p_request uuid, p_opponent uuid, p_real_money boolean, p_lineup jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor_i uuid:=auth.uid(); receipt private.delayed_requests; fingerprint jsonb; parent uuid:=gen_random_uuid(); item jsonb; i integer:=0;
 cfg jsonb; frozen jsonb:='[]';
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM private.delayed_actor(actor_i);
 fingerprint:=jsonb_build_object('op','create','opponent',p_opponent,'realMoney',p_real_money,'lineup',p_lineup);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor_i::text||p_request::text,317));
 SELECT * INTO receipt FROM private.delayed_requests WHERE delayed_requests.actor=actor_i AND request_id=p_request;
 IF FOUND THEN IF receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF; RETURN receipt.match_id; END IF;
 PERFORM private.delayed_actor(p_opponent);
 IF actor_i=p_opponent OR p_real_money IS NULL OR jsonb_typeof(p_lineup) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lineup) NOT BETWEEN 1 AND 32
 THEN RAISE EXCEPTION 'delayed:invalid_offer'; END IF;
 IF NOT private.delayed_multi_enabled() AND (jsonb_array_length(p_lineup)<>1 OR p_lineup->0->>'game'<>'ptown-words') THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
 IF p_real_money AND NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND real_qualified) THEN RAISE EXCEPTION 'delayed:real_money_closed';END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND admission_enabled) THEN RAISE EXCEPTION 'delayed:admission_closed'; END IF;
 IF EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') THEN RAISE EXCEPTION 'delayed:maintenance'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_lineup) LOOP
  IF coalesce(item->>'game','') NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf') OR coalesce(item->>'stake','') !~ '^[1-9][0-9]{0,3}$'
   OR (item-ARRAY['game','stake','config'])<>'{}'::jsonb OR jsonb_typeof(item)<>'object' THEN RAISE EXCEPTION 'delayed:invalid_child'; END IF;
  CASE item->>'game'
  WHEN 'ptown-words' THEN cfg:=private.ptown_words_rules_for('ptown-words/3');
  WHEN 'run21' THEN SELECT config INTO STRICT cfg FROM private.gameplay_rulesets WHERE id='run21/3' AND game='run21';
  WHEN 'tri-towers' THEN cfg:=private.tri_towers_rules();
  WHEN 'quintzee' THEN cfg:=private.quintzee_default_rules();
  WHEN 'boxdrop' THEN cfg:=private.boxdrop_rules();
  WHEN 'mega-card-golf' THEN
   IF NOT (SELECT async_enabled FROM private.mega_competition_release WHERE singleton) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
   cfg:=private.mega_competition_config(item->'config');END CASE;
  IF item ? 'config' AND item->'config' IS DISTINCT FROM cfg THEN RAISE EXCEPTION 'delayed:unsupported_configuration'; END IF;
  frozen:=frozen||jsonb_build_array(item||jsonb_build_object('config',cfg));
 END LOOP;
 INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash)
 VALUES(parent,actor_i,p_opponent,p_real_money,frozen,md5(frozen::text));
 FOR item IN SELECT value FROM jsonb_array_elements(frozen) LOOP
  i:=i+1;INSERT INTO private.delayed_children(match_id,ordinal,game_type,stake,config) VALUES(parent,i,item->>'game',(item->>'stake')::integer,item->'config');
 END LOOP;
 INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,parent,jsonb_build_object('id',parent));
 PERFORM private.delayed_notify(parent);
 RETURN parent;
END $function$
;

DO $guard$ BEGIN IF md5(pg_get_functiondef('delayed_respond(uuid,uuid,text,text)'::regprocedure)) IS DISTINCT FROM '7c0d42a325f2b24e07e1607f257962af' THEN RAISE EXCEPTION 'mega:owner_changed:delayed_respond(uuid,uuid,text,text)';END IF;END $guard$;
CREATE OR REPLACE FUNCTION public.delayed_respond(p_match uuid, p_request uuid, p_offer_hash text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor_i uuid:=auth.uid(); m private.delayed_matches; receipt private.delayed_requests; fingerprint jsonb;
 c private.delayed_children; first_actor uuid; at_time timestamptz; response jsonb; dealt jsonb;
BEGIN
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM private.delayed_actor(actor_i);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required'; END IF;
 fingerprint:=jsonb_build_object('op',p_action,'match',p_match,'hash',p_offer_hash);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor_i::text||p_request::text,317));
 SELECT * INTO receipt FROM private.delayed_requests WHERE delayed_requests.actor=actor_i AND request_id=p_request;
 IF FOUND THEN IF receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF; RETURN receipt.response; END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=p_match FOR UPDATE;
 IF p_action IS NULL OR p_action NOT IN('accept','decline','cancel') OR
  actor_i IS DISTINCT FROM (CASE WHEN p_action='cancel' THEN m.organizer ELSE m.opponent END) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 IF m.status<>'invited' OR p_offer_hash IS DISTINCT FROM m.offer_hash THEN RAISE EXCEPTION 'delayed:offer_changed'; END IF;
 at_time:=clock_timestamp();
 IF at_time>=m.expires_at THEN UPDATE private.delayed_matches SET status='expired',revision=revision+1 WHERE id=m.id; response:='{"status":"expired"}';
 ELSIF p_action='accept' THEN
  PERFORM private.delayed_actor(m.organizer);
  IF EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') THEN RAISE EXCEPTION 'delayed:maintenance'; END IF;
  IF NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND admission_enabled) OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:admission_closed'; END IF;
  IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type='mega-card-golf') AND NOT (SELECT async_enabled FROM private.mega_competition_release WHERE singleton) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
 IF m.real_money AND NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND real_qualified) THEN RAISE EXCEPTION 'delayed:real_money_closed';END IF;
  IF NOT private.delayed_multi_enabled() AND ((SELECT count(*) FROM private.delayed_children WHERE match_id=m.id)<>1 OR EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type<>'ptown-words')) THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=m.id ORDER BY ordinal FOR UPDATE LOOP
   IF c.game_type NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf') THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
   dealt:=NULL;
   IF c.game_type='ptown-words' THEN dealt:=private.ptown_words_deal(jsonb_build_object('rules',c.config,'players',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.id,'name',p.username,'seat',CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END,'isBot',false) ORDER BY CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END) FROM public.profiles p WHERE p.id IN(m.organizer,m.opponent))),floor(extract(epoch FROM at_time)*1000)::bigint);
   first_actor:=(dealt->'players'->(dealt->>'turnIndex')::int->>'id')::uuid;
   ELSE first_actor:=CASE WHEN get_byte(extensions.gen_random_bytes(1),0)%2=0 THEN m.organizer ELSE m.opponent END;END IF;
   UPDATE private.delayed_children SET state=dealt,starter=first_actor,actor=first_actor,segment=1,revision=1,
    available_at=at_time,last_call_at=at_time+interval '24 hours',expires_at=at_time+interval '36 hours' WHERE id=c.id;
  END LOOP;
  UPDATE private.delayed_matches SET status='active',accepted_at=at_time,revision=revision+1 WHERE id=m.id;
  response:='{"status":"active"}';
 ELSE
  UPDATE private.delayed_matches SET status=CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END,revision=revision+1 WHERE id=m.id;
  response:=jsonb_build_object('status',CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END);
 END IF;
 INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,m.id,response);
 PERFORM private.delayed_notify(m.id); RETURN response;
END $function$
;

DO $guard$ BEGIN IF md5(pg_get_functiondef('delayed_capabilities()'::regprocedure)) IS DISTINCT FROM '86939eae7d86c985823c611cbb4810d8' THEN RAISE EXCEPTION 'mega:owner_changed:delayed_capabilities()';END IF;END $guard$;
CREATE OR REPLACE FUNCTION public.delayed_capabilities()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object('enabled',coalesce((SELECT admission_enabled FROM private.delayed_release WHERE singleton),false),
 'fake_money_only',NOT coalesce((SELECT real_qualified FROM private.delayed_release WHERE singleton),false),'max_children',CASE WHEN private.delayed_multi_enabled() THEN 32 ELSE 1 END,'games',CASE WHEN NOT private.delayed_multi_enabled() THEN jsonb_build_array(jsonb_build_object('id','ptown-words','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='ptown-words'),'rules',private.ptown_words_rules_for('ptown-words/3'))) ELSE jsonb_build_array(
 jsonb_build_object('id','ptown-words','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='ptown-words'),'rules',private.ptown_words_rules_for('ptown-words/3')),
 jsonb_build_object('id','run21','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='run21'),'rules',(SELECT config FROM private.gameplay_rulesets WHERE id='run21/3' AND game='run21')),
 jsonb_build_object('id','tri-towers','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='tri-towers'),'rules',private.tri_towers_rules()),
 jsonb_build_object('id','quintzee','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='quintzee'),'rules',private.quintzee_default_rules()),
 jsonb_build_object('id','boxdrop','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='boxdrop'),'rules',private.boxdrop_rules()))||CASE WHEN (SELECT async_enabled FROM private.mega_competition_release WHERE singleton) THEN jsonb_build_array(jsonb_build_object('id','mega-card-golf','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='mega-card-golf'),'rules',private.mega_competition_config(),'courses',private.mega_competition_courses())) ELSE '[]'::jsonb END END) WHERE auth.uid() IS NOT NULL
$function$
;

DO $guard$ BEGIN IF md5(pg_get_functiondef('private.delayed_review_board(text,jsonb)'::regprocedure)) IS DISTINCT FROM '6873c81734ced63edf5978a0afac0aec' THEN RAISE EXCEPTION 'mega:owner_changed:private.delayed_review_board(text,jsonb)';END IF;END $guard$;
CREATE OR REPLACE FUNCTION private.delayed_review_board(game text, b jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT CASE game WHEN 'run21' THEN (SELECT jsonb_object_agg(key,value) FROM jsonb_each(b) WHERE key=ANY(ARRAY['playerId','columns','passesUsed','presented','current','cardIndex','revision','startedAt','deadline','result']))
 WHEN 'tri-towers' THEN private.tri_towers_visible(b)
 WHEN 'quintzee' THEN private.quintzee_present_board(b)
 WHEN 'boxdrop' THEN private.boxdrop_visible(b)
 WHEN 'mega-card-golf' THEN b-ARRAY['decks','owner']||jsonb_build_object('serverAt',0,'dueAt',(b->>'deadline')::bigint,'stockRemaining',(b#>>'{config,stockAllowance}')::int-(b->>'draws')::int,'discardsRemaining',(b#>>'{config,discardAllowance}')::int-(b->>'discards')::int)
 WHEN 'ptown-words' THEN private.ptown_words_visible(b,NULL)-ARRAY['rack','rackCounts'] END
$function$
;

DO $guard$ BEGIN IF md5(pg_get_functiondef('delayed_home(uuid)'::regprocedure)) IS DISTINCT FROM '72be78168ee2b215bb1f67c17f94bce5' THEN RAISE EXCEPTION 'mega:owner_changed:delayed_home(uuid)';END IF;END $guard$;
CREATE OR REPLACE FUNCTION public.delayed_home(p_match uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE h jsonb;c private.delayed_children;item jsonb;lineup jsonb:='[]';who uuid:=auth.uid();scores jsonb;progress jsonb;pending_counts jsonb;person text;pts bigint;shown bigint;pending_count int;seen_count int;next_round int;required int;f uuid;viewed boolean;
BEGIN
 h:=public.delayed_home_before_reviews(p_match);
 FOR item IN SELECT value FROM jsonb_array_elements(h->'lineup') LOOP
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=(item->>'id')::uuid;
  SELECT id INTO f FROM private.delayed_review_events WHERE child_id=c.id AND kind='child';
  viewed:=f IS NULL OR EXISTS(SELECT FROM private.delayed_review_seen WHERE event_id=f AND viewer=who);
  scores:='{}';progress:='{}';pending_counts:='{}';
  IF c.game_type='ptown-words' THEN scores:=c.state->'scores';
  ELSE
   FOR person IN SELECT jsonb_array_elements_text(coalesce(c.state->'players',jsonb_build_array(h->>'organizer',h->>'opponent'))) LOOP
    SELECT coalesce(sum((a->>'score')::bigint),0),coalesce(max((a->>'round')::int),0)+1 INTO pts,next_round FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person;
    SELECT coalesce(sum((a->>'score')::bigint) FILTER(WHERE visible),0),count(*) FILTER(WHERE visible),count(*) FILTER(WHERE NOT visible)
     INTO shown,seen_count,pending_count FROM (
      SELECT a,person=who::text OR EXISTS(SELECT FROM private.delayed_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=who
       WHERE e.child_id=c.id AND e.kind='attempt' AND e.actor::text=person AND e.round=(a->>'round')::int) visible
      FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person
     ) visible_attempts;
    scores:=scores||jsonb_build_object(person,CASE WHEN pending_count>0 AND seen_count=0 THEN NULL ELSE shown END);
    pending_counts:=pending_counts||jsonb_build_object(person,pending_count);
    required:=CASE c.game_type WHEN 'tri-towers' THEN (c.config->>'stages')::int+CASE WHEN private.tri_towers_bonus_qualified_v2(pts,c.config) THEN (c.config->>'maxBonusStages')::int ELSE 0 END
     WHEN 'quintzee' THEN private.quintzee_required_rounds(pts)
     WHEN 'boxdrop' THEN private.boxdrop_required_rounds(pts)
     WHEN 'mega-card-golf' THEN (c.config#>>'{course,holes}')::int
     ELSE greatest((c.config->>'rounds')::int,coalesce((c.state->>'round')::int,1)) END;
    progress:=progress||jsonb_build_object(person,CASE WHEN c.terminal OR next_round>required THEN 'Complete' ELSE 'Next Round: '||next_round END);
   END LOOP;
  END IF;
  lineup:=lineup||jsonb_build_array(item||jsonb_build_object('scores',scores,'holeResults',CASE WHEN c.game_type='mega-card-golf' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('actor',a->>'actor','hole',a->'round','score',a->'score','at',a->'at')),'[]') FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=who::text OR EXISTS(SELECT FROM private.delayed_review_events e JOIN private.delayed_review_seen seen ON seen.event_id=e.id AND seen.viewer=who WHERE e.child_id=c.id AND e.actor::text=a->>'actor' AND e.round=(a->>'round')::int)) END,'pendingResults',pending_counts,'progress',progress,'bagCount',CASE WHEN c.game_type='ptown-words' THEN jsonb_array_length(c.state->'bag') END,'reviewId',f,'viewed',viewed,'result',CASE WHEN viewed THEN item->'result' ELSE NULL END));
 END LOOP;
 RETURN h||jsonb_build_object('lineup',lineup,'unsettled',(SELECT coalesce(sum(stake),0) FROM private.delayed_children WHERE match_id=p_match AND NOT terminal),
  'reviewsComplete',private.delayed_reviews_complete(p_match,who),'finaleViewed',EXISTS(SELECT FROM private.delayed_finale_seen WHERE match_id=p_match AND viewer=who));
END $function$
;

DO $guard$ BEGIN IF md5(pg_get_functiondef('private.delayed_words_recover()'::regprocedure)) IS DISTINCT FROM 'a8fa85aa8993b08d9ad8ca7935ec303b' THEN RAISE EXCEPTION 'mega:owner_changed:private.delayed_words_recover()';END IF;END $guard$;
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
   AND least(c.expires_at,c.gameplay_due_at)<=clock_timestamp()) AND NOT EXISTS(SELECT FROM private.mega_live_matches WHERE NOT finished AND paused_at IS NULL AND CASE WHEN settlement IS NULL THEN (state->>'deadline')::bigint ELSE (state#>>'{terminal,deadline}')::bigint END<=floor(extract(epoch FROM clock_timestamp())*1000)) THEN RETURN n;END IF;
 UPDATE private.delayed_words_health SET last_tick=last_tick_i WHERE singleton;
 UPDATE private.delayed_recovery_state SET token=t,claimed=false,expires_at=clock_timestamp()+interval '25 seconds',
  failure=CASE WHEN s.token IS NOT NULL THEN 'delayed:lease_expired' ELSE failure END WHERE singleton;
 PERFORM net.http_post(url:='https://xvhmbuppghwmwpwrkzao.supabase.co/functions/v1/delayed-recovery',
  headers:=jsonb_build_object('Content-Type','application/json','x-delayed-dispatch',t::text),body:='{}'::jsonb,timeout_milliseconds:=20000);
 RETURN n;
END $function$
;

CREATE FUNCTION private.mega_delayed_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE attempt jsonb;person text;prior jsonb;i integer:=0;total bigint;count_i integer;low bigint;winners jsonb;
BEGIN
 IF NEW.game_type<>'mega-card-golf' OR NEW.state IS NULL THEN RETURN NEW;END IF;
 IF NEW.config IS DISTINCT FROM OLD.config OR NEW.match_id IS DISTINCT FROM OLD.match_id OR NEW.stake IS DISTINCT FROM OLD.stake THEN RAISE EXCEPTION 'mega:immutable_configuration';END IF;
 IF NEW.state->>'child' IS DISTINCT FROM NEW.id::text OR NEW.state->>'game' IS DISTINCT FROM 'mega-card-golf' OR NEW.state->'players' IS DISTINCT FROM coalesce(OLD.state->'players',jsonb_build_array(NEW.starter,CASE WHEN NEW.starter=(SELECT organizer FROM private.delayed_matches WHERE id=NEW.match_id) THEN (SELECT opponent FROM private.delayed_matches WHERE id=NEW.match_id) ELSE (SELECT organizer FROM private.delayed_matches WHERE id=NEW.match_id) END)) THEN RAISE EXCEPTION 'mega:invalid_identity';END IF;
 IF NEW.state->'board' IS NOT NULL AND NEW.state->'board'<>'null'::jsonb THEN
  SELECT value->'board' INTO prior FROM jsonb_array_elements(coalesce(OLD.state->'attempts','[]')) WHERE value->>'actor'=NEW.actor::text ORDER BY (value->>'round')::integer DESC LIMIT 1;
  PERFORM private.mega_assert_board(NEW.state->'board',NEW.config,CASE WHEN OLD.state->'board'<>'null'::jsonb THEN OLD.state->'board' ELSE prior END);
 END IF;
 FOR attempt IN SELECT value FROM jsonb_array_elements(NEW.state->'attempts') LOOP
  i:=i+1;
  IF i<=jsonb_array_length(coalesce(OLD.state->'attempts','[]')) THEN
   IF attempt IS DISTINCT FROM OLD.state->'attempts'->(i-1) THEN RAISE EXCEPTION 'mega:immutable_hole';END IF;
  ELSE
   IF attempt->>'actor' IS DISTINCT FROM OLD.actor::text OR (attempt->>'round')::integer IS DISTINCT FROM coalesce((OLD.state->>'round')::integer,1) THEN RAISE EXCEPTION 'mega:invalid_turn';END IF;
   PERFORM private.mega_assert_board(attempt->'board',NEW.config,OLD.state->'board');
   IF (attempt->>'score')::bigint IS DISTINCT FROM (attempt#>>'{board,results,-1,score}')::bigint OR attempt#>>'{board,phase}' IS DISTINCT FROM 'scoring' THEN RAISE EXCEPTION 'mega:invalid_hole_score';END IF;
  END IF;
 END LOOP;
 IF i<jsonb_array_length(coalesce(OLD.state->'attempts','[]')) OR i>jsonb_array_length(coalesce(OLD.state->'attempts','[]'))+1 THEN RAISE EXCEPTION 'mega:invalid_transition';END IF;
 FOR person IN SELECT jsonb_array_elements_text(NEW.state->'players') LOOP
  SELECT coalesce(sum((value->>'score')::bigint),0),count(*) INTO total,count_i FROM jsonb_array_elements(NEW.state->'attempts') WHERE value->>'actor'=person;
  IF (NEW.state->'totals'->>person)::bigint IS DISTINCT FROM total OR count_i>(NEW.config#>>'{course,holes}')::integer THEN RAISE EXCEPTION 'mega:invalid_total';END IF;
 END LOOP;
 IF (NEW.state->>'completed')::boolean THEN
  IF i<>2*(NEW.config#>>'{course,holes}')::integer THEN RAISE EXCEPTION 'mega:incomplete_course';END IF;
  SELECT min(value::bigint) INTO low FROM jsonb_each_text(NEW.state->'totals');
  SELECT jsonb_agg(key) INTO winners FROM jsonb_each_text(NEW.state->'totals') WHERE value::bigint=low;
  IF NEW.state->>'winner' IS DISTINCT FROM (CASE WHEN jsonb_array_length(winners)=1 THEN winners->>0 END) THEN RAISE EXCEPTION 'mega:invalid_winner';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER mega_delayed_guard BEFORE UPDATE OF state ON private.delayed_children FOR EACH ROW EXECUTE FUNCTION private.mega_delayed_guard();
REVOKE ALL ON FUNCTION private.mega_delayed_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.mega_live_recovery_claim(p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM private.delayed_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'mega:recovery_denied';END IF;
 RETURN coalesce((SELECT jsonb_agg(private.mega_live_record(m,NULL)) FROM (SELECT * FROM private.mega_live_matches WHERE NOT finished AND paused_at IS NULL AND CASE WHEN settlement IS NULL THEN (state->>'deadline')::bigint ELSE (state#>>'{terminal,deadline}')::bigint END<=floor(extract(epoch FROM clock_timestamp())*1000) ORDER BY created_at LIMIT 20)m),'[]');
END $$;
REVOKE ALL ON FUNCTION public.mega_live_recovery_claim(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mega_live_recovery_claim(uuid) TO service_role;


REVOKE ALL ON FUNCTION public.mega_configure(uuid,uuid,integer,text,jsonb,timestamptz) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.mega_configure(uuid,uuid,integer,text,jsonb,timestamptz) TO authenticated;

DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'mega_live_%' LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;END $$;