SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Owner-approved Golf match lengths. Preserve existing admission and money eligibility.
-- Configuration extends /2 using the existing frozen rules JSON; /1 remains nine.
ALTER TABLE public.game_defaults ADD COLUMN IF NOT EXISTS golf_holes integer NOT NULL DEFAULT 9;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.game_defaults'::regclass AND conname='game_defaults_golf_holes_check') THEN
  ALTER TABLE public.game_defaults ADD CONSTRAINT game_defaults_golf_holes_check CHECK(golf_holes IN (3,6,9,18));
 END IF;
END $$;

DO $guard$ BEGIN
 IF replace(pg_get_functiondef('private.golf_supported_rules(jsonb)'::regprocedure),chr(13),'') IS DISTINCT FROM $before$CREATE OR REPLACE FUNCTION private.golf_supported_rules(r jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE p jsonb:=r->'presentation';BEGIN
 IF r IN (private.golf_rules(),private.golf_rules_v2()) THEN RETURN true;END IF;
 RETURN coalesce(r-'presentation' IN (private.golf_rules(),private.golf_rules_v2()) AND p=jsonb_build_object('version',1,'scoringDelayMs',(p->>'scoringDelayMs')::integer,'resultsDurationMs',(p->>'resultsDurationMs')::integer)
 AND (p->>'scoringDelayMs')::integer BETWEEN 200 AND 5000 AND (p->>'resultsDurationMs')::integer BETWEEN 1000 AND 30000,false);
 EXCEPTION WHEN OTHERS THEN RETURN false;
END $function$
$before$ AND (SELECT replace(prosrc,chr(13),'') FROM pg_proc WHERE oid='private.golf_supported_rules(jsonb)'::regprocedure) IS DISTINCT FROM $body$
DECLARE p jsonb:=r->'presentation'; base jsonb; holes jsonb:=coalesce(r->'holes','9'::jsonb);
BEGIN
 IF holes NOT IN ('3'::jsonb,'6'::jsonb,'9'::jsonb,'18'::jsonb) OR (r->>'version'='six-card-golf/1' AND holes<>'9'::jsonb) THEN RETURN false;END IF;
 base:=r||'{"holes":9}'::jsonb;
 IF base IN (private.golf_rules(),private.golf_rules_v2()) THEN RETURN true;END IF;
 RETURN coalesce(base-'presentation' IN (private.golf_rules(),private.golf_rules_v2()) AND p=jsonb_build_object('version',1,'scoringDelayMs',(p->>'scoringDelayMs')::integer,'resultsDurationMs',(p->>'resultsDurationMs')::integer)
 AND (p->>'scoringDelayMs')::integer BETWEEN 200 AND 5000 AND (p->>'resultsDurationMs')::integer BETWEEN 1000 AND 30000,false);
 EXCEPTION WHEN OTHERS THEN RETURN false;
END $body$ THEN RAISE EXCEPTION 'Golf match-length preimage changed: private.golf_supported_rules(jsonb)';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.golf_supported_rules(r jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $function$
DECLARE p jsonb:=r->'presentation'; base jsonb; holes jsonb:=coalesce(r->'holes','9'::jsonb);
BEGIN
 IF holes NOT IN ('3'::jsonb,'6'::jsonb,'9'::jsonb,'18'::jsonb) OR (r->>'version'='six-card-golf/1' AND holes<>'9'::jsonb) THEN RETURN false;END IF;
 base:=r||'{"holes":9}'::jsonb;
 IF base IN (private.golf_rules(),private.golf_rules_v2()) THEN RETURN true;END IF;
 RETURN coalesce(base-'presentation' IN (private.golf_rules(),private.golf_rules_v2()) AND p=jsonb_build_object('version',1,'scoringDelayMs',(p->>'scoringDelayMs')::integer,'resultsDurationMs',(p->>'resultsDurationMs')::integer)
 AND (p->>'scoringDelayMs')::integer BETWEEN 200 AND 5000 AND (p->>'resultsDurationMs')::integer BETWEEN 1000 AND 30000,false);
 EXCEPTION WHEN OTHERS THEN RETURN false;
END $function$;

DO $guard$ BEGIN
 IF replace(pg_get_functiondef('private.golf_admission_rules()'::regprocedure),chr(13),'') IS DISTINCT FROM $before$CREATE OR REPLACE FUNCTION private.golf_admission_rules()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE d public.game_defaults;BEGIN
 SELECT * INTO STRICT d FROM public.game_defaults WHERE game_type='six-card-golf';
 RETURN private.golf_rules_v2()||jsonb_build_object('presentation',jsonb_build_object('version',1,'scoringDelayMs',d.golf_scoring_delay_ms,'resultsDurationMs',d.golf_results_duration_ms));
END $function$
$before$ AND (SELECT replace(prosrc,chr(13),'') FROM pg_proc WHERE oid='private.golf_admission_rules()'::regprocedure) IS DISTINCT FROM $body$
DECLARE d public.game_defaults;BEGIN
 SELECT * INTO STRICT d FROM public.game_defaults WHERE game_type='six-card-golf';
 RETURN private.golf_rules_v2()||jsonb_build_object('holes',d.golf_holes,'presentation',jsonb_build_object('version',1,'scoringDelayMs',d.golf_scoring_delay_ms,'resultsDurationMs',d.golf_results_duration_ms));
END $body$ THEN RAISE EXCEPTION 'Golf match-length preimage changed: private.golf_admission_rules()';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.golf_admission_rules()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE d public.game_defaults;BEGIN
 SELECT * INTO STRICT d FROM public.game_defaults WHERE game_type='six-card-golf';
 RETURN private.golf_rules_v2()||jsonb_build_object('holes',d.golf_holes,'presentation',jsonb_build_object('version',1,'scoringDelayMs',d.golf_scoring_delay_ms,'resultsDurationMs',d.golf_results_duration_ms));
END $function$
;

DO $guard$ BEGIN
 IF replace(pg_get_functiondef('golf_configure(uuid,uuid,integer,text,jsonb,timestamp with time zone)'::regprocedure),chr(13),'') IS DISTINCT FROM $before$CREATE OR REPLACE FUNCTION public.golf_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.golf_actor_allowed(actor,p_game_id) OR p_game_type IS DISTINCT FROM 'six-card-golf' THEN RAISE EXCEPTION 'golf:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'golf:dealer_required' USING ERRCODE='42501';END IF;

 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'golf:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'golf:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'golf:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT private.golf_admission_allowed(actor,g.id) THEN RAISE EXCEPTION 'golf:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'golf:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.golf_admission_allowed(user_id,g.id)) THEN RAISE EXCEPTION 'golf:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'golf:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 4 THEN RAISE EXCEPTION 'golf:player_count';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'golf:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'six-card-golf',jsonb_build_object('ante_amount',stake_i,'rules',private.golf_admission_rules())) RETURNING * INTO dg;
 -- Freeze already-authorized access for this match. Expiry/revocation prevents
 -- new matches, but cannot strand accepted liabilities or an unresolved offer.
 INSERT INTO private.golf_qualified_matches(dealer_game_id,game_id,user_id)
 SELECT dg.id,g.id,(p->>'userId')::uuid FROM jsonb_array_elements(people) p
 WHERE NOT (p->>'isBot')::boolean;
 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='six-card-golf',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$
$before$ AND (SELECT replace(prosrc,chr(13),'') FROM pg_proc WHERE oid='golf_configure(uuid,uuid,integer,text,jsonb,timestamp with time zone)'::regprocedure) IS DISTINCT FROM $body$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.golf_actor_allowed(actor,p_game_id) OR p_game_type IS DISTINCT FROM 'six-card-golf' THEN RAISE EXCEPTION 'golf:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'golf:dealer_required' USING ERRCODE='42501';END IF;

 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'golf:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 IF p_config ? 'holes' AND p_config->'holes' NOT IN ('3'::jsonb,'6'::jsonb,'9'::jsonb,'18'::jsonb) THEN RAISE EXCEPTION 'golf:holes';END IF;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'golf:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'golf:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT private.golf_admission_allowed(actor,g.id) THEN RAISE EXCEPTION 'golf:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'golf:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.golf_admission_allowed(user_id,g.id)) THEN RAISE EXCEPTION 'golf:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'golf:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 4 THEN RAISE EXCEPTION 'golf:player_count';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'golf:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'six-card-golf',jsonb_build_object('ante_amount',stake_i,'rules',private.golf_admission_rules()||jsonb_build_object('holes',coalesce(p_config->'holes','9'::jsonb)))) RETURNING * INTO dg;
 -- Freeze already-authorized access for this match. Expiry/revocation prevents
 -- new matches, but cannot strand accepted liabilities or an unresolved offer.
 INSERT INTO private.golf_qualified_matches(dealer_game_id,game_id,user_id)
 SELECT dg.id,g.id,(p->>'userId')::uuid FROM jsonb_array_elements(people) p
 WHERE NOT (p->>'isBot')::boolean;
 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='six-card-golf',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $body$ THEN RAISE EXCEPTION 'Golf match-length preimage changed: golf_configure(uuid,uuid,integer,text,jsonb,timestamp with time zone)';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.golf_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.golf_actor_allowed(actor,p_game_id) OR p_game_type IS DISTINCT FROM 'six-card-golf' THEN RAISE EXCEPTION 'golf:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'golf:dealer_required' USING ERRCODE='42501';END IF;

 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'golf:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 IF p_config ? 'holes' AND p_config->'holes' NOT IN ('3'::jsonb,'6'::jsonb,'9'::jsonb,'18'::jsonb) THEN RAISE EXCEPTION 'golf:holes';END IF;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'golf:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'golf:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT private.golf_admission_allowed(actor,g.id) THEN RAISE EXCEPTION 'golf:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'golf:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.golf_admission_allowed(user_id,g.id)) THEN RAISE EXCEPTION 'golf:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'golf:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 4 THEN RAISE EXCEPTION 'golf:player_count';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'golf:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'six-card-golf',jsonb_build_object('ante_amount',stake_i,'rules',private.golf_admission_rules()||jsonb_build_object('holes',coalesce(p_config->'holes','9'::jsonb)))) RETURNING * INTO dg;
 -- Freeze already-authorized access for this match. Expiry/revocation prevents
 -- new matches, but cannot strand accepted liabilities or an unresolved offer.
 INSERT INTO private.golf_qualified_matches(dealer_game_id,game_id,user_id)
 SELECT dg.id,g.id,(p->>'userId')::uuid FROM jsonb_array_elements(people) p
 WHERE NOT (p->>'isBot')::boolean;
 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='six-card-golf',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$
;

DO $guard$ BEGIN
 IF replace(pg_get_functiondef('private.golf_reduce(jsonb,text,integer[],bigint)'::regprocedure),chr(13),'') IS DISTINCT FROM $before$CREATE OR REPLACE FUNCTION private.golf_reduce(s jsonb, action text, items integer[], at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE n integer:=jsonb_array_length(s->'players'); actor_i integer:=(s->>'turnIndex')::integer;
 actor text:=s->'players'->actor_i->>'id'; b jsonb; card jsonb; old_card jsonb; pos integer; exposed_new boolean:=false;
 queue jsonb:=s->'finalQueue'; already_final boolean:=s->>'finalReason' IS NOT NULL;
 next_i integer:=(actor_i+1)%n; count_i integer; i integer; totals jsonb:=s->'scores'; results jsonb:='{}'; p jsonb; score_i integer; remaining integer;
BEGIN
 PERFORM private.golf_integrity(s);
 IF s->>'phase' NOT IN ('opening','playing') THEN RAISE EXCEPTION 'golf:phase';END IF;
 b:=s->'tableaus'->actor;
 IF s->>'phase'='opening' AND s ? 'openingCommits' THEN
  IF action IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'golf:illegal_open';END IF;
  RETURN private.golf_open_commit(s,actor,items,at_ms);
 END IF;
 IF s->>'phase'='opening' THEN
  IF action IS DISTINCT FROM 'open' OR cardinality(items) IS DISTINCT FROM 2 OR items[1] IS NULL OR items[2] IS NULL
    OR items[1] NOT BETWEEN 0 AND 5 OR items[2] NOT BETWEEN 0 AND 5 OR items[1]=items[2] THEN RAISE EXCEPTION 'golf:illegal_open';END IF;
  b:=jsonb_set(jsonb_set(b,ARRAY['exposed',items[1]::text],'true'),ARRAY['exposed',items[2]::text],'true');
  s:=jsonb_set(s,ARRAY['tableaus',actor],b);remaining:=(s->>'openingRemaining')::integer-1;
  RETURN s||jsonb_build_object('openingRemaining',remaining,'phase',CASE WHEN remaining=0 THEN 'playing' ELSE 'opening' END,
    'turnIndex',next_i,'deadline',at_ms+30000);
 END IF;
 IF action='draw' THEN
  IF s->'pending'<>'null'::jsonb OR coalesce(cardinality(items),0)<>0 THEN RAISE EXCEPTION 'golf:illegal_draw';END IF;
  IF jsonb_array_length(s->'stock')=0 THEN
   IF jsonb_array_length(s->'discard')<=1 THEN RAISE EXCEPTION 'golf:integrity';END IF;
   s:=s||jsonb_build_object('stock',private.golf_shuffle((s->'discard')-(jsonb_array_length(s->'discard')-1)),'discard',jsonb_build_array(s->'discard'->-1));
  END IF;
  s:=s||jsonb_build_object('pending',jsonb_build_object('actor',actor,'card',s->'stock'->0),'stock',(s->'stock')-0);
  -- Latch on the draw, while its card is pending. The current turn still finishes normally.
  IF s#>>'{rules,version}'='six-card-golf/2' AND NOT already_final
    AND jsonb_array_length(s->'stock')=(SELECT count(*) FROM jsonb_each(s->'tableaus') t
      WHERE EXISTS(SELECT 1 FROM jsonb_array_elements_text(t.value->'exposed') e WHERE NOT e::boolean)) THEN
   s:=s||jsonb_build_object('stockFinalTrigger',actor);
  END IF;
  PERFORM private.golf_integrity(s);RETURN s; -- Preserve the whole-turn deadline.
 ELSIF action='reject' THEN
  IF s->'pending'='null'::jsonb OR coalesce(cardinality(items),0)<>0 THEN RAISE EXCEPTION 'golf:illegal_reject';END IF;
  s:=s||jsonb_build_object('discard',(s->'discard')||jsonb_build_array(s#>'{pending,card}'),'pending',NULL);
 ELSIF action IN ('replace','discard') THEN
  IF cardinality(items) IS DISTINCT FROM 1 OR items[1] IS NULL OR items[1] NOT BETWEEN 0 AND 5 THEN RAISE EXCEPTION 'golf:illegal_position';END IF;
  pos:=items[1];old_card:=b->'cards'->pos;exposed_new:=NOT (b->'exposed'->>pos)::boolean;
  IF action='replace' THEN
   IF s->'pending'='null'::jsonb THEN RAISE EXCEPTION 'golf:pending_required';END IF;
   card:=s#>'{pending,card}';s:=s||jsonb_build_object('pending',NULL);
  ELSE
   IF s->'pending'<>'null'::jsonb OR jsonb_array_length(s->'discard')=0 THEN RAISE EXCEPTION 'golf:illegal_discard';END IF;
   card:=s->'discard'->-1;s:=jsonb_set(s,'{discard}',(s->'discard')-(jsonb_array_length(s->'discard')-1));
  END IF;
  b:=jsonb_set(jsonb_set(b,ARRAY['cards',pos::text],card),ARRAY['exposed',pos::text],'true');
  s:=jsonb_set(s,ARRAY['tableaus',actor],b);
  s:=jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(old_card));
 ELSE RAISE EXCEPTION 'golf:invalid_action';
 END IF;
 count_i:=CASE WHEN s#>>'{rules,version}'='six-card-golf/2' OR exposed_new THEN 0 ELSE (s->>'consecutiveNoRevealTurns')::integer+1 END;
 IF already_final THEN
  IF queue->>0 IS DISTINCT FROM actor THEN RAISE EXCEPTION 'golf:integrity';END IF;
  queue:=queue-0;
 ELSIF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(b->'exposed') e WHERE NOT e::boolean) THEN
  FOR i IN 1..n-1 LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','six_exposed');
 ELSIF s#>>'{rules,version}'='six-card-golf/2' AND s->>'stockFinalTrigger'=actor THEN
  FOR i IN 1..n LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','stock_threshold');
 ELSIF s#>>'{rules,version}'='six-card-golf/1' AND count_i>=5*n THEN
  FOR i IN 1..n LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','prolonged_play');
 END IF;
 s:=(s-'stockFinalTrigger')||jsonb_build_object('consecutiveNoRevealTurns',count_i,'finalQueue',queue,'turnIndex',next_i,'deadline',at_ms+30000);
 IF already_final AND jsonb_array_length(queue)=0 THEN
  IF s#>'{rules,presentation}' IS NOT NULL THEN s:=s||jsonb_build_object('presentation',private.golf_presentation(s,at_ms));END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(s->'players') LOOP
   score_i:=private.golf_score(s->'tableaus'->(p->>'id')->'cards');
   results:=results||jsonb_build_object(p->>'id',score_i);
   totals:=totals||jsonb_build_object(p->>'id',(totals->>(p->>'id'))::integer+score_i);
   s:=jsonb_set(s,ARRAY['tableaus',p->>'id','exposed'],'[true,true,true,true,true,true]');
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'holes') h WHERE h->>'hole'=s->>'hole') THEN RAISE EXCEPTION 'golf:integrity';END IF;
  s:=s||jsonb_build_object('scores',totals,'holes',(s->'holes')||jsonb_build_array(jsonb_build_object('hole',s->'hole','roundId',s#>'{identity,roundId}','scores',results,'tableaus',s->'tableaus')),
    'phase',CASE WHEN (s->>'hole')::integer=9 THEN 'complete' ELSE 'hole_complete' END,'deadline',coalesce((s#>>'{presentation,endsAt}')::bigint,at_ms+6000));
 END IF;
 PERFORM private.golf_integrity(s);RETURN s;
END $function$
$before$ AND (SELECT replace(prosrc,chr(13),'') FROM pg_proc WHERE oid='private.golf_reduce(jsonb,text,integer[],bigint)'::regprocedure) IS DISTINCT FROM $body$
DECLARE n integer:=jsonb_array_length(s->'players'); actor_i integer:=(s->>'turnIndex')::integer;
 actor text:=s->'players'->actor_i->>'id'; b jsonb; card jsonb; old_card jsonb; pos integer; exposed_new boolean:=false;
 queue jsonb:=s->'finalQueue'; already_final boolean:=s->>'finalReason' IS NOT NULL;
 next_i integer:=(actor_i+1)%n; count_i integer; i integer; totals jsonb:=s->'scores'; results jsonb:='{}'; p jsonb; score_i integer; remaining integer;
BEGIN
 PERFORM private.golf_integrity(s);
 IF s->>'phase' NOT IN ('opening','playing') THEN RAISE EXCEPTION 'golf:phase';END IF;
 b:=s->'tableaus'->actor;
 IF s->>'phase'='opening' AND s ? 'openingCommits' THEN
  IF action IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'golf:illegal_open';END IF;
  RETURN private.golf_open_commit(s,actor,items,at_ms);
 END IF;
 IF s->>'phase'='opening' THEN
  IF action IS DISTINCT FROM 'open' OR cardinality(items) IS DISTINCT FROM 2 OR items[1] IS NULL OR items[2] IS NULL
    OR items[1] NOT BETWEEN 0 AND 5 OR items[2] NOT BETWEEN 0 AND 5 OR items[1]=items[2] THEN RAISE EXCEPTION 'golf:illegal_open';END IF;
  b:=jsonb_set(jsonb_set(b,ARRAY['exposed',items[1]::text],'true'),ARRAY['exposed',items[2]::text],'true');
  s:=jsonb_set(s,ARRAY['tableaus',actor],b);remaining:=(s->>'openingRemaining')::integer-1;
  RETURN s||jsonb_build_object('openingRemaining',remaining,'phase',CASE WHEN remaining=0 THEN 'playing' ELSE 'opening' END,
    'turnIndex',next_i,'deadline',at_ms+30000);
 END IF;
 IF action='draw' THEN
  IF s->'pending'<>'null'::jsonb OR coalesce(cardinality(items),0)<>0 THEN RAISE EXCEPTION 'golf:illegal_draw';END IF;
  IF jsonb_array_length(s->'stock')=0 THEN
   IF jsonb_array_length(s->'discard')<=1 THEN RAISE EXCEPTION 'golf:integrity';END IF;
   s:=s||jsonb_build_object('stock',private.golf_shuffle((s->'discard')-(jsonb_array_length(s->'discard')-1)),'discard',jsonb_build_array(s->'discard'->-1));
  END IF;
  s:=s||jsonb_build_object('pending',jsonb_build_object('actor',actor,'card',s->'stock'->0),'stock',(s->'stock')-0);
  -- Latch on the draw, while its card is pending. The current turn still finishes normally.
  IF s#>>'{rules,version}'='six-card-golf/2' AND NOT already_final
    AND jsonb_array_length(s->'stock')=(SELECT count(*) FROM jsonb_each(s->'tableaus') t
      WHERE EXISTS(SELECT 1 FROM jsonb_array_elements_text(t.value->'exposed') e WHERE NOT e::boolean)) THEN
   s:=s||jsonb_build_object('stockFinalTrigger',actor);
  END IF;
  PERFORM private.golf_integrity(s);RETURN s; -- Preserve the whole-turn deadline.
 ELSIF action='reject' THEN
  IF s->'pending'='null'::jsonb OR coalesce(cardinality(items),0)<>0 THEN RAISE EXCEPTION 'golf:illegal_reject';END IF;
  s:=s||jsonb_build_object('discard',(s->'discard')||jsonb_build_array(s#>'{pending,card}'),'pending',NULL);
 ELSIF action IN ('replace','discard') THEN
  IF cardinality(items) IS DISTINCT FROM 1 OR items[1] IS NULL OR items[1] NOT BETWEEN 0 AND 5 THEN RAISE EXCEPTION 'golf:illegal_position';END IF;
  pos:=items[1];old_card:=b->'cards'->pos;exposed_new:=NOT (b->'exposed'->>pos)::boolean;
  IF action='replace' THEN
   IF s->'pending'='null'::jsonb THEN RAISE EXCEPTION 'golf:pending_required';END IF;
   card:=s#>'{pending,card}';s:=s||jsonb_build_object('pending',NULL);
  ELSE
   IF s->'pending'<>'null'::jsonb OR jsonb_array_length(s->'discard')=0 THEN RAISE EXCEPTION 'golf:illegal_discard';END IF;
   card:=s->'discard'->-1;s:=jsonb_set(s,'{discard}',(s->'discard')-(jsonb_array_length(s->'discard')-1));
  END IF;
  b:=jsonb_set(jsonb_set(b,ARRAY['cards',pos::text],card),ARRAY['exposed',pos::text],'true');
  s:=jsonb_set(s,ARRAY['tableaus',actor],b);
  s:=jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(old_card));
 ELSE RAISE EXCEPTION 'golf:invalid_action';
 END IF;
 count_i:=CASE WHEN s#>>'{rules,version}'='six-card-golf/2' OR exposed_new THEN 0 ELSE (s->>'consecutiveNoRevealTurns')::integer+1 END;
 IF already_final THEN
  IF queue->>0 IS DISTINCT FROM actor THEN RAISE EXCEPTION 'golf:integrity';END IF;
  queue:=queue-0;
 ELSIF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(b->'exposed') e WHERE NOT e::boolean) THEN
  FOR i IN 1..n-1 LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','six_exposed');
 ELSIF s#>>'{rules,version}'='six-card-golf/2' AND s->>'stockFinalTrigger'=actor THEN
  FOR i IN 1..n LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','stock_threshold');
 ELSIF s#>>'{rules,version}'='six-card-golf/1' AND count_i>=5*n THEN
  FOR i IN 1..n LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','prolonged_play');
 END IF;
 s:=(s-'stockFinalTrigger')||jsonb_build_object('consecutiveNoRevealTurns',count_i,'finalQueue',queue,'turnIndex',next_i,'deadline',at_ms+30000);
 IF already_final AND jsonb_array_length(queue)=0 THEN
  IF s#>'{rules,presentation}' IS NOT NULL THEN s:=s||jsonb_build_object('presentation',private.golf_presentation(s,at_ms));END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(s->'players') LOOP
   score_i:=private.golf_score(s->'tableaus'->(p->>'id')->'cards');
   results:=results||jsonb_build_object(p->>'id',score_i);
   totals:=totals||jsonb_build_object(p->>'id',(totals->>(p->>'id'))::integer+score_i);
   s:=jsonb_set(s,ARRAY['tableaus',p->>'id','exposed'],'[true,true,true,true,true,true]');
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'holes') h WHERE h->>'hole'=s->>'hole') THEN RAISE EXCEPTION 'golf:integrity';END IF;
  s:=s||jsonb_build_object('scores',totals,'holes',(s->'holes')||jsonb_build_array(jsonb_build_object('hole',s->'hole','roundId',s#>'{identity,roundId}','scores',results,'tableaus',s->'tableaus')),
    'phase',CASE WHEN (s->>'hole')::integer=coalesce((s#>>'{rules,holes}')::integer,9) THEN 'complete' ELSE 'hole_complete' END,'deadline',coalesce((s#>>'{presentation,endsAt}')::bigint,at_ms+6000));
 END IF;
 PERFORM private.golf_integrity(s);RETURN s;
END $body$ THEN RAISE EXCEPTION 'Golf match-length preimage changed: private.golf_reduce(jsonb,text,integer[],bigint)';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.golf_reduce(s jsonb, action text, items integer[], at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE n integer:=jsonb_array_length(s->'players'); actor_i integer:=(s->>'turnIndex')::integer;
 actor text:=s->'players'->actor_i->>'id'; b jsonb; card jsonb; old_card jsonb; pos integer; exposed_new boolean:=false;
 queue jsonb:=s->'finalQueue'; already_final boolean:=s->>'finalReason' IS NOT NULL;
 next_i integer:=(actor_i+1)%n; count_i integer; i integer; totals jsonb:=s->'scores'; results jsonb:='{}'; p jsonb; score_i integer; remaining integer;
BEGIN
 PERFORM private.golf_integrity(s);
 IF s->>'phase' NOT IN ('opening','playing') THEN RAISE EXCEPTION 'golf:phase';END IF;
 b:=s->'tableaus'->actor;
 IF s->>'phase'='opening' AND s ? 'openingCommits' THEN
  IF action IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'golf:illegal_open';END IF;
  RETURN private.golf_open_commit(s,actor,items,at_ms);
 END IF;
 IF s->>'phase'='opening' THEN
  IF action IS DISTINCT FROM 'open' OR cardinality(items) IS DISTINCT FROM 2 OR items[1] IS NULL OR items[2] IS NULL
    OR items[1] NOT BETWEEN 0 AND 5 OR items[2] NOT BETWEEN 0 AND 5 OR items[1]=items[2] THEN RAISE EXCEPTION 'golf:illegal_open';END IF;
  b:=jsonb_set(jsonb_set(b,ARRAY['exposed',items[1]::text],'true'),ARRAY['exposed',items[2]::text],'true');
  s:=jsonb_set(s,ARRAY['tableaus',actor],b);remaining:=(s->>'openingRemaining')::integer-1;
  RETURN s||jsonb_build_object('openingRemaining',remaining,'phase',CASE WHEN remaining=0 THEN 'playing' ELSE 'opening' END,
    'turnIndex',next_i,'deadline',at_ms+30000);
 END IF;
 IF action='draw' THEN
  IF s->'pending'<>'null'::jsonb OR coalesce(cardinality(items),0)<>0 THEN RAISE EXCEPTION 'golf:illegal_draw';END IF;
  IF jsonb_array_length(s->'stock')=0 THEN
   IF jsonb_array_length(s->'discard')<=1 THEN RAISE EXCEPTION 'golf:integrity';END IF;
   s:=s||jsonb_build_object('stock',private.golf_shuffle((s->'discard')-(jsonb_array_length(s->'discard')-1)),'discard',jsonb_build_array(s->'discard'->-1));
  END IF;
  s:=s||jsonb_build_object('pending',jsonb_build_object('actor',actor,'card',s->'stock'->0),'stock',(s->'stock')-0);
  -- Latch on the draw, while its card is pending. The current turn still finishes normally.
  IF s#>>'{rules,version}'='six-card-golf/2' AND NOT already_final
    AND jsonb_array_length(s->'stock')=(SELECT count(*) FROM jsonb_each(s->'tableaus') t
      WHERE EXISTS(SELECT 1 FROM jsonb_array_elements_text(t.value->'exposed') e WHERE NOT e::boolean)) THEN
   s:=s||jsonb_build_object('stockFinalTrigger',actor);
  END IF;
  PERFORM private.golf_integrity(s);RETURN s; -- Preserve the whole-turn deadline.
 ELSIF action='reject' THEN
  IF s->'pending'='null'::jsonb OR coalesce(cardinality(items),0)<>0 THEN RAISE EXCEPTION 'golf:illegal_reject';END IF;
  s:=s||jsonb_build_object('discard',(s->'discard')||jsonb_build_array(s#>'{pending,card}'),'pending',NULL);
 ELSIF action IN ('replace','discard') THEN
  IF cardinality(items) IS DISTINCT FROM 1 OR items[1] IS NULL OR items[1] NOT BETWEEN 0 AND 5 THEN RAISE EXCEPTION 'golf:illegal_position';END IF;
  pos:=items[1];old_card:=b->'cards'->pos;exposed_new:=NOT (b->'exposed'->>pos)::boolean;
  IF action='replace' THEN
   IF s->'pending'='null'::jsonb THEN RAISE EXCEPTION 'golf:pending_required';END IF;
   card:=s#>'{pending,card}';s:=s||jsonb_build_object('pending',NULL);
  ELSE
   IF s->'pending'<>'null'::jsonb OR jsonb_array_length(s->'discard')=0 THEN RAISE EXCEPTION 'golf:illegal_discard';END IF;
   card:=s->'discard'->-1;s:=jsonb_set(s,'{discard}',(s->'discard')-(jsonb_array_length(s->'discard')-1));
  END IF;
  b:=jsonb_set(jsonb_set(b,ARRAY['cards',pos::text],card),ARRAY['exposed',pos::text],'true');
  s:=jsonb_set(s,ARRAY['tableaus',actor],b);
  s:=jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(old_card));
 ELSE RAISE EXCEPTION 'golf:invalid_action';
 END IF;
 count_i:=CASE WHEN s#>>'{rules,version}'='six-card-golf/2' OR exposed_new THEN 0 ELSE (s->>'consecutiveNoRevealTurns')::integer+1 END;
 IF already_final THEN
  IF queue->>0 IS DISTINCT FROM actor THEN RAISE EXCEPTION 'golf:integrity';END IF;
  queue:=queue-0;
 ELSIF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(b->'exposed') e WHERE NOT e::boolean) THEN
  FOR i IN 1..n-1 LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','six_exposed');
 ELSIF s#>>'{rules,version}'='six-card-golf/2' AND s->>'stockFinalTrigger'=actor THEN
  FOR i IN 1..n LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','stock_threshold');
 ELSIF s#>>'{rules,version}'='six-card-golf/1' AND count_i>=5*n THEN
  FOR i IN 1..n LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','prolonged_play');
 END IF;
 s:=(s-'stockFinalTrigger')||jsonb_build_object('consecutiveNoRevealTurns',count_i,'finalQueue',queue,'turnIndex',next_i,'deadline',at_ms+30000);
 IF already_final AND jsonb_array_length(queue)=0 THEN
  IF s#>'{rules,presentation}' IS NOT NULL THEN s:=s||jsonb_build_object('presentation',private.golf_presentation(s,at_ms));END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(s->'players') LOOP
   score_i:=private.golf_score(s->'tableaus'->(p->>'id')->'cards');
   results:=results||jsonb_build_object(p->>'id',score_i);
   totals:=totals||jsonb_build_object(p->>'id',(totals->>(p->>'id'))::integer+score_i);
   s:=jsonb_set(s,ARRAY['tableaus',p->>'id','exposed'],'[true,true,true,true,true,true]');
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'holes') h WHERE h->>'hole'=s->>'hole') THEN RAISE EXCEPTION 'golf:integrity';END IF;
  s:=s||jsonb_build_object('scores',totals,'holes',(s->'holes')||jsonb_build_array(jsonb_build_object('hole',s->'hole','roundId',s#>'{identity,roundId}','scores',results,'tableaus',s->'tableaus')),
    'phase',CASE WHEN (s->>'hole')::integer=coalesce((s#>>'{rules,holes}')::integer,9) THEN 'complete' ELSE 'hole_complete' END,'deadline',coalesce((s#>>'{presentation,endsAt}')::bigint,at_ms+6000));
 END IF;
 PERFORM private.golf_integrity(s);RETURN s;
END $function$
;

DO $guard$ BEGIN
 IF replace(pg_get_functiondef('private.golf_next_hole(uuid,bigint)'::regprocedure),chr(13),'') IS DISTINCT FROM $before$CREATE OR REPLACE FUNCTION private.golf_next_hole(p_dealer uuid, at_ms bigint)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE m private.golf_matches; g public.games; r uuid:=gen_random_uuid(); hole_i integer;
BEGIN
 SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=p_dealer;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id;
 IF g.is_paused OR g.status<>'in_progress' OR g.current_game_uuid IS DISTINCT FROM p_dealer
  OR m.state->>'phase'<>'hole_complete' OR (m.state->>'deadline')::bigint>at_ms THEN RETURN;END IF;
 hole_i:=(m.state->>'hole')::integer+1;
 IF hole_i NOT BETWEEN 2 AND 9 OR jsonb_array_length(m.state->'holes')<>hole_i-1 THEN RAISE EXCEPTION 'golf:integrity';END IF;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,predecessor_round_id,cards_dealt,status,pot)
 VALUES(r,m.game_id,p_dealer,1,hole_i,m.round_id,0,'betting',0);
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 m.state:=jsonb_set(m.state,'{identity,roundId}',to_jsonb(r));
 m.state:=private.golf_deal(m.state||jsonb_build_object('hole',hole_i,'dealerIndex',((m.state->>'dealerIndex')::integer+1)%jsonb_array_length(m.state->'players')),at_ms);
 UPDATE private.golf_matches SET round_id=r,state=m.state,revision=revision+1 WHERE dealer_game_id=p_dealer;
 UPDATE public.games SET current_round=hole_i WHERE id=m.game_id;
END $function$
$before$ AND (SELECT replace(prosrc,chr(13),'') FROM pg_proc WHERE oid='private.golf_next_hole(uuid,bigint)'::regprocedure) IS DISTINCT FROM $body$
DECLARE m private.golf_matches; g public.games; r uuid:=gen_random_uuid(); hole_i integer;
BEGIN
 SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=p_dealer;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id;
 IF g.is_paused OR g.status<>'in_progress' OR g.current_game_uuid IS DISTINCT FROM p_dealer
  OR m.state->>'phase'<>'hole_complete' OR (m.state->>'deadline')::bigint>at_ms THEN RETURN;END IF;
 hole_i:=(m.state->>'hole')::integer+1;
 IF hole_i NOT BETWEEN 2 AND coalesce((m.state#>>'{rules,holes}')::integer,9) OR jsonb_array_length(m.state->'holes')<>hole_i-1 THEN RAISE EXCEPTION 'golf:integrity';END IF;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,predecessor_round_id,cards_dealt,status,pot)
 VALUES(r,m.game_id,p_dealer,1,hole_i,m.round_id,0,'betting',0);
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 m.state:=jsonb_set(m.state,'{identity,roundId}',to_jsonb(r));
 m.state:=private.golf_deal(m.state||jsonb_build_object('hole',hole_i,'dealerIndex',((m.state->>'dealerIndex')::integer+1)%jsonb_array_length(m.state->'players')),at_ms);
 UPDATE private.golf_matches SET round_id=r,state=m.state,revision=revision+1 WHERE dealer_game_id=p_dealer;
 UPDATE public.games SET current_round=hole_i WHERE id=m.game_id;
END $body$ THEN RAISE EXCEPTION 'Golf match-length preimage changed: private.golf_next_hole(uuid,bigint)';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.golf_next_hole(p_dealer uuid, at_ms bigint)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE m private.golf_matches; g public.games; r uuid:=gen_random_uuid(); hole_i integer;
BEGIN
 SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=p_dealer;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id;
 IF g.is_paused OR g.status<>'in_progress' OR g.current_game_uuid IS DISTINCT FROM p_dealer
  OR m.state->>'phase'<>'hole_complete' OR (m.state->>'deadline')::bigint>at_ms THEN RETURN;END IF;
 hole_i:=(m.state->>'hole')::integer+1;
 IF hole_i NOT BETWEEN 2 AND coalesce((m.state#>>'{rules,holes}')::integer,9) OR jsonb_array_length(m.state->'holes')<>hole_i-1 THEN RAISE EXCEPTION 'golf:integrity';END IF;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,predecessor_round_id,cards_dealt,status,pot)
 VALUES(r,m.game_id,p_dealer,1,hole_i,m.round_id,0,'betting',0);
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 m.state:=jsonb_set(m.state,'{identity,roundId}',to_jsonb(r));
 m.state:=private.golf_deal(m.state||jsonb_build_object('hole',hole_i,'dealerIndex',((m.state->>'dealerIndex')::integer+1)%jsonb_array_length(m.state->'players')),at_ms);
 UPDATE private.golf_matches SET round_id=r,state=m.state,revision=revision+1 WHERE dealer_game_id=p_dealer;
 UPDATE public.games SET current_round=hole_i WHERE id=m.game_id;
END $function$
;

DO $guard$ BEGIN
 IF replace(pg_get_functiondef('private.golf_settle(uuid)'::regprocedure),chr(13),'') IS DISTINCT FROM $before$CREATE OR REPLACE FUNCTION private.golf_settle(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.golf_matches; g public.games; winners uuid[]; win_count integer; total integer; deltas jsonb; transfers jsonb:='[]';
 result_id uuid; player jsonb; winner uuid; loser uuid; amount integer; changes jsonb:='{}'; allocated integer;
BEGIN
 SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.game_type IS DISTINCT FROM 'six-card-golf' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.status<>'in_progress' OR g.is_paused
  OR m.state->>'phase'<>'complete' OR jsonb_array_length(m.state->'holes')<>9 OR (SELECT count(*) FROM jsonb_object_keys(m.state->'scores'))<>jsonb_array_length(m.state->'players') THEN RAISE EXCEPTION 'golf:not_terminal'; END IF;
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
  IF allocated<>0 THEN RAISE EXCEPTION 'golf:unbalanced_settlement'; END IF;
 END LOOP;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(m.game_id,m.dealer_game_id,1,'golf_terminal','six-card-golf',CASE WHEN win_count=1 THEN winners[1] END,
  CASE WHEN win_count>1 THEN 'Tie' ELSE (SELECT p->>'name' FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=winners[1]::text) END,
  'Six-Card Golf: '||(m.state->'scores')::text,total,changes,win_count>1) RETURNING id INTO result_id;
 IF jsonb_array_length(transfers)>0 THEN PERFORM public.settle_gameplay_chip_transfers(m.game_id,transfers,'win'); END IF;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
 UPDATE private.golf_matches SET settlement=changes,revision=revision+1,state=state||jsonb_build_object('terminal',jsonb_build_object('resultId',result_id,'winnerIds',to_jsonb(winners),'score',(SELECT min(value::bigint) FROM jsonb_each_text(m.state->'scores')),'startedAt',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,endsAt}')::bigint,0)),'deadline',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,endsAt}')::bigint,0))+3000)) WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result='Six-Card Golf complete',awaiting_next_round=false WHERE id=m.game_id;
END $function$
$before$ AND (SELECT replace(prosrc,chr(13),'') FROM pg_proc WHERE oid='private.golf_settle(uuid)'::regprocedure) IS DISTINCT FROM $body$
DECLARE m private.golf_matches; g public.games; winners uuid[]; win_count integer; total integer; deltas jsonb; transfers jsonb:='[]';
 result_id uuid; player jsonb; winner uuid; loser uuid; amount integer; changes jsonb:='{}'; allocated integer;
BEGIN
 SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.game_type IS DISTINCT FROM 'six-card-golf' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.status<>'in_progress' OR g.is_paused
  OR m.state->>'phase'<>'complete' OR jsonb_array_length(m.state->'holes')<>coalesce((m.state#>>'{rules,holes}')::integer,9) OR (SELECT count(*) FROM jsonb_object_keys(m.state->'scores'))<>jsonb_array_length(m.state->'players') THEN RAISE EXCEPTION 'golf:not_terminal'; END IF;
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
  IF allocated<>0 THEN RAISE EXCEPTION 'golf:unbalanced_settlement'; END IF;
 END LOOP;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(m.game_id,m.dealer_game_id,1,'golf_terminal','six-card-golf',CASE WHEN win_count=1 THEN winners[1] END,
  CASE WHEN win_count>1 THEN 'Tie' ELSE (SELECT p->>'name' FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=winners[1]::text) END,
  'Six-Card Golf: '||(m.state->'scores')::text,total,changes,win_count>1) RETURNING id INTO result_id;
 IF jsonb_array_length(transfers)>0 THEN PERFORM public.settle_gameplay_chip_transfers(m.game_id,transfers,'win'); END IF;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
 UPDATE private.golf_matches SET settlement=changes,revision=revision+1,state=state||jsonb_build_object('terminal',jsonb_build_object('resultId',result_id,'winnerIds',to_jsonb(winners),'score',(SELECT min(value::bigint) FROM jsonb_each_text(m.state->'scores')),'startedAt',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,endsAt}')::bigint,0)),'deadline',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,endsAt}')::bigint,0))+3000)) WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result='Six-Card Golf complete',awaiting_next_round=false WHERE id=m.game_id;
END $body$ THEN RAISE EXCEPTION 'Golf match-length preimage changed: private.golf_settle(uuid)';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.golf_settle(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.golf_matches; g public.games; winners uuid[]; win_count integer; total integer; deltas jsonb; transfers jsonb:='[]';
 result_id uuid; player jsonb; winner uuid; loser uuid; amount integer; changes jsonb:='{}'; allocated integer;
BEGIN
 SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.game_type IS DISTINCT FROM 'six-card-golf' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.status<>'in_progress' OR g.is_paused
  OR m.state->>'phase'<>'complete' OR jsonb_array_length(m.state->'holes')<>coalesce((m.state#>>'{rules,holes}')::integer,9) OR (SELECT count(*) FROM jsonb_object_keys(m.state->'scores'))<>jsonb_array_length(m.state->'players') THEN RAISE EXCEPTION 'golf:not_terminal'; END IF;
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
  IF allocated<>0 THEN RAISE EXCEPTION 'golf:unbalanced_settlement'; END IF;
 END LOOP;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(m.game_id,m.dealer_game_id,1,'golf_terminal','six-card-golf',CASE WHEN win_count=1 THEN winners[1] END,
  CASE WHEN win_count>1 THEN 'Tie' ELSE (SELECT p->>'name' FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=winners[1]::text) END,
  'Six-Card Golf: '||(m.state->'scores')::text,total,changes,win_count>1) RETURNING id INTO result_id;
 IF jsonb_array_length(transfers)>0 THEN PERFORM public.settle_gameplay_chip_transfers(m.game_id,transfers,'win'); END IF;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
 UPDATE private.golf_matches SET settlement=changes,revision=revision+1,state=state||jsonb_build_object('terminal',jsonb_build_object('resultId',result_id,'winnerIds',to_jsonb(winners),'score',(SELECT min(value::bigint) FROM jsonb_each_text(m.state->'scores')),'startedAt',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,endsAt}')::bigint,0)),'deadline',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,endsAt}')::bigint,0))+3000)) WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result='Six-Card Golf complete',awaiting_next_round=false WHERE id=m.game_id;
END $function$
;

