BEGIN;
SET LOCAL lock_timeout='100ms';
SET LOCAL statement_timeout='10s';
DO $guard$ BEGIN
 IF md5(pg_get_functiondef('public.tri_towers_configure(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure))<>'8b9f3aaaa816f27054009567f51db10b'
  OR md5(pg_get_functiondef('private.tri_towers_recover()'::regprocedure))<>'55191a871e50b211f396a4fb0db37db3' THEN
  RAISE EXCEPTION 'tri_towers:bot_migration_authority_changed';
 END IF;
END $guard$;
ALTER TABLE private.tri_towers_matches ADD COLUMN bot_due_at bigint;
CREATE INDEX tri_towers_matches_due ON private.tri_towers_matches(least((state->>'deadline')::bigint,bot_due_at),dealer_game_id)
 WHERE NOT finished AND settlement IS NULL AND paused_at IS NULL;
CREATE OR REPLACE FUNCTION private.tri_towers_bot_choice(v jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE i integer; j integer; k integer; r jsonb; rr jsonb; uncovered integer; options integer; followups integer;
 value_i integer; best_value integer:=-1; best_i integer; rank_i integer; peak_count integer;
BEGIN
 IF v ? 'deck' THEN RAISE EXCEPTION 'tri_towers:bot_private_input';END IF;
 IF v->>'phase'='ready' THEN RETURN jsonb_build_object('action','start');END IF;
 IF v->>'phase'<>'playing' THEN RETURN NULL;END IF;
 -- Points cannot be lost by drawing. Bank before timeout forfeits later stages.
 IF (v->>'deadline')::bigint-at_ms<=5000 THEN RETURN jsonb_build_object('action','take_score');END IF;
 FOR i IN 0..27 LOOP
  IF v->'cards'->i='null'::jsonb OR v->'cards'->i IS NULL OR v->'removed' @> to_jsonb(i) THEN CONTINUE;END IF;
  rank_i:=(v->'cards'->>i)::integer%13;
  IF abs(rank_i-(v->>'waste')::integer%13) NOT IN (1,12) THEN CONTINUE;END IF;
  r:=v||jsonb_build_object('removed',(v->'removed')||to_jsonb(i));
  SELECT count(*) INTO uncovered FROM generate_series(0,27) x WHERE private.tri_towers_exposed(r,x) AND NOT private.tri_towers_exposed(v,x);
  options:=0;followups:=0;
  FOR j IN 0..27 LOOP
   IF j=i OR v->'cards'->j='null'::jsonb OR v->'cards'->j IS NULL OR v->'removed' @> to_jsonb(j) THEN CONTINUE;END IF;
   IF abs((v->'cards'->>j)::integer%13-rank_i) NOT IN (1,12) THEN CONTINUE;END IF;
   options:=options+1;
   rr:=r||jsonb_build_object('removed',(r->'removed')||to_jsonb(j));
   SELECT count(*) INTO k FROM generate_series(0,27) x
    WHERE x<>i AND x<>j AND v->'cards'->x<>'null'::jsonb AND private.tri_towers_exposed(rr,x)
     AND abs((v->'cards'->>x)::integer%13-(v->'cards'->>j)::integer%13) IN (1,12);
   followups:=greatest(followups,k);
  END LOOP;
  value_i:=((v->>'run')::integer+1)*(v#>>'{rules,runStep}')::integer+uncovered*2000+options*900+followups*400;
  IF i<3 THEN
   SELECT count(*) INTO peak_count FROM jsonb_array_elements_text(v->'removed') x WHERE x::integer<3;
   value_i:=value_i+(v->'rules'->'peakBonuses'->>peak_count)::integer;
  END IF;
  IF value_i>best_value THEN best_value:=value_i;best_i:=i;END IF;
 END LOOP;
 IF best_i IS NOT NULL THEN RETURN jsonb_build_object('action','remove','index',best_i);END IF;
 RETURN jsonb_build_object('action',CASE WHEN (v->>'stockRemaining')::integer>0 THEN 'draw' ELSE 'take_score' END);
END $$;

CREATE OR REPLACE FUNCTION private.tri_towers_schedule_bot() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.finished OR NEW.settlement IS NOT NULL OR NEW.paused_at IS NOT NULL
  OR NEW.state->>'phase' NOT IN ('ready','playing')
  OR NOT coalesce((NEW.state->'players'->(NEW.state->>'turnIndex')::integer->>'isBot')::boolean,false) THEN
  NEW.bot_due_at:=NULL;
 ELSIF TG_OP='INSERT' THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSIF OLD.paused_at IS NOT NULL OR NEW.state IS DISTINCT FROM OLD.state THEN
  NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSE NEW.bot_due_at:=OLD.bot_due_at;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.tri_towers_recover() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate record; m private.tri_towers_matches; g public.games; at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000); count_i integer:=0; choice jsonb; actor uuid;
BEGIN
 FOR candidate IN SELECT work.dealer_game_id,work.game_id,work.round_id,work.revision,work.state->>'phase' phase,work.state->>'stage' stage,
   work.state->'players'->(work.state->>'turnIndex')::integer->>'id' player_id
  FROM private.tri_towers_matches work JOIN public.games live ON live.id=work.game_id
  WHERE NOT work.finished AND work.settlement IS NULL AND work.paused_at IS NULL
   AND least((work.state->>'deadline')::bigint,work.bot_due_at)<=at_ms
   AND live.real_money=false AND live.status='in_progress' AND live.game_type='tri-towers'
   AND live.current_game_uuid=work.dealer_game_id AND NOT live.is_paused
  ORDER BY least((work.state->>'deadline')::bigint,work.bot_due_at),work.dealer_game_id LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=candidate.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO g FROM public.games WHERE id=candidate.game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR g.real_money IS DISTINCT FROM false OR g.is_paused OR g.status<>'in_progress'
   OR g.game_type IS DISTINCT FROM 'tri-towers' OR g.current_game_uuid IS DISTINCT FROM candidate.dealer_game_id THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.tri_towers_matches WHERE dealer_game_id=candidate.dealer_game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE;END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  IF m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL OR m.revision<>candidate.revision
   OR m.game_id<>candidate.game_id OR m.round_id<>candidate.round_id OR m.state->>'phase' IS DISTINCT FROM candidate.phase
   OR m.state->>'stage' IS DISTINCT FROM candidate.stage
   OR m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM candidate.player_id
   OR least((m.state->>'deadline')::bigint,m.bot_due_at)>at_ms THEN CONTINUE;END IF;
  IF (m.state->>'deadline')::bigint<=at_ms THEN
   m.state:=private.tri_towers_reduce(m.state,'tick',NULL,at_ms);
  ELSE
   actor:=candidate.player_id::uuid;
   IF m.bot_due_at IS NULL OR m.bot_due_at>at_ms
    OR NOT coalesce((m.state->'players'->(m.state->>'turnIndex')::integer->>'isBot')::boolean,false)
    OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=actor AND game_id=m.game_id AND is_bot) THEN CONTINUE;END IF;
   choice:=private.tri_towers_bot_choice(private.tri_towers_visible(m.state),at_ms);
   IF choice IS NULL THEN CONTINUE;END IF;
   m.state:=private.tri_towers_reduce(m.state,choice->>'action',(choice->>'index')::integer,at_ms);
  END IF;
  UPDATE private.tri_towers_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id AND revision=candidate.revision;
  IF m.state->>'phase'='complete' THEN PERFORM private.tri_towers_settle(m.dealer_game_id);END IF;
  count_i:=count_i+1;
 END LOOP;
 RETURN count_i;
END $$;
CREATE TRIGGER tri_towers_schedule_bot BEFORE INSERT OR UPDATE ON private.tri_towers_matches FOR EACH ROW EXECUTE FUNCTION private.tri_towers_schedule_bot();
CREATE OR REPLACE FUNCTION public.tri_towers_configure(p_game_id uuid,p_dealer_player_id uuid,p_expected_dealer_position integer,p_game_type text,p_config jsonb,p_expected_config_deadline timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.tri_towers_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'tri-towers' THEN RAISE EXCEPTION 'tri_towers:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'tri_towers:dealer_required' USING ERRCODE='42501';END IF;
 -- No real-money creation in this release, including direct RPC calls.
 IF g.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION 'tri_towers:real_money_closed' USING ERRCODE='42501';END IF;
 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'tri_towers:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'tri_towers:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'tri_towers:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'tri_towers:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.tri_towers_actor_allowed(user_id)) THEN RAISE EXCEPTION 'tri_towers:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'tri_towers:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 7 THEN RAISE EXCEPTION 'tri_towers:player_count';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'tri_towers:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'tri-towers',jsonb_build_object('ante_amount',stake_i,'rules',private.tri_towers_rules())) RETURNING * INTO dg;
 UPDATE public.players SET ante_decision='ante_up',current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='tri-towers',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=NULL,status='in_progress',ante_amount=stake_i,current_round=1,total_hands=1,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot) VALUES(r,g.id,dg.id,1,1,0,'betting',0);
 s:=private.tri_towers_deal(jsonb_build_object('identity',jsonb_build_object('sessionId',g.id,'dealerGameId',dg.id,'roundId',r),
  'players',people,'rules',private.tri_towers_rules(),'turnIndex',0,'stage',1,'score',0,'scores','{}'::jsonb,'stages','[]'::jsonb),floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
 INSERT INTO private.tri_towers_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(dg.id,g.id,r,s,stake_i);
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.tri_towers_bot_choice(jsonb,bigint),private.tri_towers_schedule_bot(),private.tri_towers_recover() FROM PUBLIC,anon,authenticated,service_role;
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='tri-towers-recovery'),schedule:='1 second');
NOTIFY pgrst,'reload schema';
COMMIT;
