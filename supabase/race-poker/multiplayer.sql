-- Additive authority source. Activation is in the versioned migration.
SET LOCAL lock_timeout = '100ms';
SET LOCAL statement_timeout = '10s';
CREATE TABLE private.race_poker_release (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false, admission_enabled boolean NOT NULL DEFAULT false, fake_qualified boolean NOT NULL DEFAULT false, real_qualified boolean NOT NULL DEFAULT false);
INSERT INTO private.race_poker_release DEFAULT VALUES;
ALTER TABLE private.race_poker_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.race_poker_release FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.race_poker_matches (
 dealer_game_id uuid PRIMARY KEY,
 game_id uuid NOT NULL, round_id uuid NOT NULL,
 state jsonb NOT NULL, revision bigint NOT NULL DEFAULT 0, stake integer NOT NULL CHECK(stake>0),
 settlement jsonb, finished boolean NOT NULL DEFAULT false, paused_at bigint, bot_due_at bigint, real_money boolean NOT NULL DEFAULT false,

 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX race_poker_matches_session ON private.race_poker_matches(game_id);
CREATE INDEX race_poker_matches_pending ON private.race_poker_matches(((state->>'deadline')::bigint)) WHERE NOT finished AND settlement IS NULL;

CREATE TABLE private.race_poker_requests (
 dealer_game_id uuid NOT NULL REFERENCES private.race_poker_matches(dealer_game_id) ON DELETE CASCADE,
 request_id uuid NOT NULL, actor uuid NOT NULL, command jsonb NOT NULL, receipt jsonb NOT NULL,
 PRIMARY KEY(dealer_game_id,request_id)
);
CREATE TABLE private.race_poker_history (
 dealer_game_id uuid NOT NULL REFERENCES private.race_poker_matches(dealer_game_id) ON DELETE CASCADE,
 revision bigint NOT NULL, frame jsonb NOT NULL, PRIMARY KEY(dealer_game_id,revision)
);
ALTER TABLE private.race_poker_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.race_poker_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.race_poker_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.race_poker_matches,private.race_poker_requests,private.race_poker_history FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.race_poker_revisions (
 dealer_game_id uuid PRIMARY KEY REFERENCES private.race_poker_matches(dealer_game_id) ON DELETE CASCADE,
 game_id uuid NOT NULL, revision bigint NOT NULL
);
ALTER TABLE public.race_poker_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.race_poker_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.race_poker_revisions TO authenticated;
CREATE POLICY race_poker_member_read ON public.race_poker_revisions FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=race_poker_revisions.game_id AND p.user_id=(SELECT auth.uid()) AND p.status<>'left'));

-- Same approved-account eligibility as Run21; independent game release gate.
CREATE OR REPLACE FUNCTION private.race_poker_actor_allowed(actor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active)
  AND EXISTS(SELECT 1 FROM private.race_poker_release WHERE singleton AND enabled)
$function$
;
CREATE OR REPLACE FUNCTION public.race_poker_capabilities(p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=auth.uid(); allowed boolean:=private.race_poker_actor_allowed(actor);
BEGIN
 allowed:=allowed AND EXISTS(SELECT 1 FROM private.race_poker_release WHERE singleton AND admission_enabled);
 IF p_session_id IS NOT NULL THEN
  allowed:=allowed AND EXISTS(SELECT 1 FROM public.games WHERE id=p_session_id)
   AND EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND user_id=actor AND status<>'left')
   AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND status<>'left' AND NOT is_bot AND NOT private.race_poker_actor_allowed(user_id));
 END IF;
 RETURN jsonb_build_object('version',2,'enabled',allowed,'user_id',actor,'session_id',p_session_id,'fake_money_only',false);
END $function$
;
CREATE OR REPLACE FUNCTION private.race_poker_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 INSERT INTO public.race_poker_revisions VALUES(NEW.dealer_game_id,NEW.game_id,NEW.revision)
 ON CONFLICT(dealer_game_id) DO UPDATE SET revision=EXCLUDED.revision;
 INSERT INTO private.race_poker_history VALUES(NEW.dealer_game_id,NEW.revision,private.race_poker_visible(NEW.state)) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.race_poker_snapshot(p_dealer_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.race_poker_matches; viewer uuid; paused boolean; balances jsonb; batch public.gameplay_transfer_batches; result_id uuid;
BEGIN
 SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=p_dealer_game_id;
 SELECT id INTO viewer FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND (status<>'left' OR m.finished) AND NOT is_bot;
 IF viewer IS NULL OR NOT private.race_poker_actor_allowed(auth.uid()) THEN RAISE EXCEPTION 'race_poker:membership_required' USING ERRCODE='42501'; END IF;
 SELECT is_paused INTO paused FROM public.games WHERE id=m.game_id;
 IF m.settlement IS NOT NULL THEN
  SELECT jsonb_object_agg(player_id::text,chips) INTO balances FROM public.session_player_snapshots WHERE dealer_game_id=p_dealer_game_id;
 ELSE SELECT jsonb_object_agg(id::text,chips) INTO balances FROM public.players WHERE game_id=m.game_id;END IF;
 SELECT * INTO batch FROM public.gameplay_transfer_batches WHERE dealer_game_id=p_dealer_game_id ORDER BY cursor DESC LIMIT 1;
 SELECT id INTO result_id FROM public.game_results WHERE dealer_game_id=p_dealer_game_id AND settlement_key='race_poker_terminal';
 RETURN private.race_poker_visible(m.state)||jsonb_build_object('revision',m.revision,'viewerId',viewer,
  'canAct',NOT coalesce(paused,false) AND m.state->>'phase'<>'complete' AND m.state->'players'->(m.state->>'turnIndex')::integer->>'id'=viewer::text,
  'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),'settlement',m.settlement,'paused',coalesce(paused,false),'finished',m.finished,'pausedAt',m.paused_at,'financial',jsonb_build_object('balances',coalesce(balances,'{}'::jsonb),'resultId',result_id,'batch',CASE WHEN batch.id IS NOT NULL THEN to_jsonb(batch) ELSE NULL END))
  -- Add new presentation metadata only with a newly committed result/revision.
  -- Existing clients compare equal revisions strictly; installation alone must not change their snapshot shape.
  ||CASE WHEN m.state->>'phase'='stage_complete' AND (m.state->'stages'->-1) ? 'id' THEN jsonb_build_object('pausedAt',m.paused_at) ELSE '{}'::jsonb END;
END $function$
;
CREATE OR REPLACE FUNCTION public.race_poker_history(p_dealer_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 PERFORM public.race_poker_snapshot(p_dealer_game_id);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('revision',revision,'frame',frame) ORDER BY revision) FROM private.race_poker_history WHERE dealer_game_id=p_dealer_game_id),'[]'::jsonb);
END $function$
;
CREATE OR REPLACE FUNCTION private.race_poker_settle(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.race_poker_matches; g public.games; winners uuid[]; win_count integer; total integer; deltas jsonb; transfers jsonb:='[]';
 result_id uuid; player jsonb; winner uuid; loser uuid; amount integer; changes jsonb:='{}'; allocated integer;
BEGIN
 SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.game_type IS DISTINCT FROM 'race-poker' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.status<>'in_progress' OR g.is_paused
  OR m.stake IS DISTINCT FROM (SELECT (config->>'ante_amount')::integer FROM public.dealer_games WHERE id=m.dealer_game_id) OR g.real_money IS DISTINCT FROM m.real_money
  OR m.state->>'phase'<>'complete' OR (SELECT count(*) FROM jsonb_object_keys(m.state->'scores'))<>jsonb_array_length(m.state->'players') THEN RAISE EXCEPTION 'race_poker:not_terminal'; END IF;
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
  IF allocated<>0 THEN RAISE EXCEPTION 'race_poker:unbalanced_settlement'; END IF;
 END LOOP;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(m.game_id,m.dealer_game_id,1,'race_poker_terminal','race-poker',CASE WHEN win_count=1 THEN winners[1] END,
  CASE WHEN win_count>1 THEN 'Tie' ELSE (SELECT p->>'name' FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=winners[1]::text) END,
  'Race Poker: '||(m.state->'scores')::text,total,changes,win_count>1) RETURNING id INTO result_id;
 IF jsonb_array_length(transfers)>0 THEN PERFORM public.settle_gameplay_chip_transfers(m.game_id,transfers,'win'); END IF;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
 UPDATE private.race_poker_matches SET settlement=changes,revision=revision+1,state=state||jsonb_build_object('terminal',jsonb_build_object('resultId',result_id,'winnerIds',to_jsonb(winners),'score',(SELECT max(value::bigint) FROM jsonb_each_text(m.state->'scores')),'startedAt',floor(extract(epoch FROM clock_timestamp())*1000)::bigint,'deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+3000,'achievements','{}'::jsonb)) WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result='Race Poker complete',awaiting_next_round=false WHERE id=m.game_id;
END $function$
;
CREATE OR REPLACE FUNCTION public.race_poker_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.race_poker_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'race-poker' THEN RAISE EXCEPTION 'race_poker:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'race_poker:dealer_required' USING ERRCODE='42501';END IF;

 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'race_poker:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'race_poker:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'race_poker:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT EXISTS(SELECT 1 FROM private.race_poker_release WHERE singleton AND admission_enabled) THEN RAISE EXCEPTION 'race_poker:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'race_poker:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.race_poker_actor_allowed(user_id)) THEN RAISE EXCEPTION 'race_poker:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'race_poker:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) <>2 THEN RAISE EXCEPTION 'race_poker:player_count';END IF;
 IF NOT EXISTS(SELECT 1 FROM private.race_poker_release WHERE singleton AND CASE WHEN g.real_money THEN real_qualified ELSE fake_qualified END) THEN RAISE EXCEPTION 'race_poker:money_mode_closed';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'race_poker:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'race-poker',jsonb_build_object('ante_amount',stake_i,'rules',private.race_poker_rules())) RETURNING * INTO dg;
 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='race-poker',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION private.race_poker_finish_postgame(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.race_poker_matches; g public.games; positions integer[]; next_seat integer; target text; winner uuid; make_take boolean;
BEGIN
 SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.race_poker_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NULL THEN RAISE EXCEPTION 'race_poker:close_denied' USING ERRCODE='42501';END IF;
 IF m.finished THEN RETURN;END IF;
 IF coalesce((m.state#>>'{terminal,deadline}')::bigint,0)>floor(extract(epoch FROM clock_timestamp())*1000) THEN RETURN;END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'race-poker' OR g.status NOT IN ('game_over','session_ended') THEN RAISE EXCEPTION 'race_poker:close_identity';END IF;
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
    SELECT winner_player_id INTO winner FROM public.game_results WHERE dealer_game_id=m.dealer_game_id AND settlement_key='race_poker_terminal';
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
 UPDATE private.race_poker_matches SET finished=true,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
END $function$
;
CREATE OR REPLACE FUNCTION public.race_poker_close(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE session uuid; BEGIN SELECT game_id INTO STRICT session FROM private.race_poker_matches WHERE dealer_game_id=p_dealer_game_id;
IF NOT private.race_poker_actor_allowed(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=session AND user_id=auth.uid() AND status<>'left' AND NOT is_bot) THEN RAISE EXCEPTION 'race_poker:close_denied' USING ERRCODE='42501';END IF;
PERFORM private.race_poker_finish_postgame(p_dealer_game_id);END $function$
;
CREATE OR REPLACE FUNCTION private.race_poker_pause()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'race-poker' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN UPDATE private.race_poker_matches SET paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND settlement IS NULL;
 ELSE UPDATE private.race_poker_matches SET state=state||jsonb_build_object('deadline',(state->>'deadline')::bigint+at_ms-paused_at)||CASE WHEN state ? 'startedAt' THEN jsonb_build_object('startedAt',(state->>'startedAt')::bigint+at_ms-paused_at) ELSE '{}'::jsonb END,paused_at=NULL,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND paused_at IS NOT NULL AND settlement IS NULL;END IF;
 RETURN NEW;
END $function$
;
-- Explicit grants only. All raw state/decks/helpers remain private.
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public') AND p.proname LIKE 'race_poker_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.race_poker_capabilities(uuid),public.race_poker_snapshot(uuid),public.race_poker_history(uuid),public.race_poker_configure(uuid,uuid,integer,text,jsonb,timestamptz),public.race_poker_close(uuid) TO authenticated;

-- Acquire shared-table locks last. NOWAIT never queues behind live writes.
LOCK TABLE public.games,public.dealer_games,public.rounds IN SHARE ROW EXCLUSIVE MODE NOWAIT;
ALTER TABLE private.race_poker_matches
 ADD FOREIGN KEY(dealer_game_id) REFERENCES public.dealer_games(id) ON DELETE CASCADE,
 ADD FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE CASCADE,
 ADD FOREIGN KEY(round_id) REFERENCES public.rounds(id) ON DELETE CASCADE;
ALTER TABLE public.race_poker_revisions ADD FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE CASCADE;
CREATE TRIGGER race_poker_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW
 WHEN(NEW.game_type='race-poker') EXECUTE FUNCTION private.race_poker_pause();

CREATE TRIGGER race_poker_publish AFTER INSERT OR UPDATE ON private.race_poker_matches FOR EACH ROW EXECUTE FUNCTION private.race_poker_publish();
