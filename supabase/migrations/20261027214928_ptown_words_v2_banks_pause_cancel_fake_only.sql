SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.ptown_words_presentation_config()'::regprocedure)) IS DISTINCT FROM '54eae01a4764786235b23fbe05fc591a' THEN RAISE EXCEPTION 'Words preimage changed: private.ptown_words_presentation_config()';END IF;
IF md5(pg_get_functiondef('private.ptown_words_rules()'::regprocedure)) IS DISTINCT FROM 'a75efa45964fa944ca8b24f41229111b' THEN RAISE EXCEPTION 'Words preimage changed: private.ptown_words_rules()';END IF;
IF md5(pg_get_functiondef('private.ptown_words_reduce(jsonb,text,jsonb,bigint)'::regprocedure)) IS DISTINCT FROM '9918e5828d8f9f1b14cca55ccca5a135' THEN RAISE EXCEPTION 'Words preimage changed: private.ptown_words_reduce(jsonb,text,jsonb,bigint)';END IF;
IF md5(pg_get_functiondef('ptown_words_action(uuid,uuid,bigint,text,jsonb)'::regprocedure)) IS DISTINCT FROM '719687bc105eaaf416ee4c29e4ff3585' THEN RAISE EXCEPTION 'Words preimage changed: ptown_words_action(uuid,uuid,bigint,text,jsonb)';END IF;
IF md5(pg_get_functiondef('ptown_words_snapshot(uuid)'::regprocedure)) IS DISTINCT FROM '07106a4eaa1fc49bcbd03b90cf8fe4d9' THEN RAISE EXCEPTION 'Words preimage changed: ptown_words_snapshot(uuid)';END IF;
IF md5(pg_get_functiondef('private.ptown_words_pause()'::regprocedure)) IS DISTINCT FROM '9d766e401de79aa118d12f324cf5b865' THEN RAISE EXCEPTION 'Words preimage changed: private.ptown_words_pause()';END IF;
IF to_regprocedure('private.ptown_words_rules_for(text)') IS NOT NULL THEN RAISE EXCEPTION 'Words /2 already installed';END IF;END $guard$;
UPDATE private.ptown_words_release SET admission_enabled=false,bots_enabled=false WHERE singleton;
-- /1 remains frozen. Only new /2 matches receive two explicit time-bank slots.
-- The real RPC/revision path arrived after two 260ms slots in the old 200ms
-- focus phase. New admissions reserve an 800ms camera/delivery focus, then
-- reveal at 300ms cadence. This uses the existing authoritative presentation
-- schedule; no client timer delays a turn or grants additional thinking time.
CREATE OR REPLACE FUNCTION private.ptown_words_presentation_config() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":1,"focusMs":800,"flipMs":300,"noticeMs":1600,"holdMs":350}'::jsonb
$$;
CREATE FUNCTION private.ptown_words_rules_for(version text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE version WHEN 'ptown-words/1' THEN base WHEN 'ptown-words/2' THEN
 base||'{"version":"ptown-words/2","timeBankUses":2,"timeBankMs":180000}'::jsonb END
 FROM (SELECT '{"version":"ptown-words/1","dictionaryId":"enable2k/1","dictionarySha256":"d5ec7b3b1d35db798cee044fe3ec37e7cc0a96a00dee5695ad34c767f1797925","turnMs":180000,"exchangeMinimum":7,"passCycles":2,"bingo":50}'::jsonb base) r
$$;
REVOKE ALL ON FUNCTION private.ptown_words_rules_for(text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.ptown_words_rules() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT private.ptown_words_rules_for('ptown-words/2') $$;

DO $patch$
DECLARE source text;changed text;
BEGIN
 SELECT pg_get_functiondef('private.ptown_words_reduce(jsonb,text,jsonb,bigint)'::regprocedure) INTO source;
 changed:=replace(source,'s#>>''{rules,version}''<>''ptown-words/1'' OR s->''rules'' IS DISTINCT FROM private.ptown_words_rules()',
  'private.ptown_words_rules_for(s#>>''{rules,version}'') IS NULL OR s->''rules'' IS DISTINCT FROM private.ptown_words_rules_for(s#>>''{rules,version}'')');
 IF source=changed THEN RAISE EXCEPTION 'Words rule-version preimage missing';END IF;source:=changed;
 changed:=replace(source,'IF action NOT IN(''place'',''exchange'',''pass'')', $bank$
 IF action='time_bank' THEN
  IF s#>>'{rules,version}'<>'ptown-words/2' THEN RAISE EXCEPTION 'ptown_words:time_bank_unavailable';END IF;
  IF jsonb_typeof(items) IS DISTINCT FROM 'array' OR jsonb_array_length(items)<>1 OR jsonb_typeof(items->0->'slot') IS DISTINCT FROM 'number' OR items->0->>'slot' NOT IN ('0','1') THEN RAISE EXCEPTION 'ptown_words:time_bank_slot';END IF;
  i:=(items->0->>'slot')::int;
  IF coalesce(s->'timeBankSpent'->player,'[]'::jsonb) @> jsonb_build_array(i) THEN RAISE EXCEPTION 'ptown_words:time_bank_used';END IF;
  RETURN s||jsonb_build_object('timeBankSpent',coalesce(s->'timeBankSpent','{}'::jsonb)||jsonb_build_object(player,coalesce(s->'timeBankSpent'->player,'[]'::jsonb)||jsonb_build_array(i)),
   'deadline',(s->>'deadline')::bigint+(s#>>'{rules,timeBankMs}')::bigint);
 END IF;
 IF action NOT IN('place','exchange','pass')$bank$);
 IF source=changed THEN RAISE EXCEPTION 'Words bank reducer preimage missing';END IF;EXECUTE changed;

 SELECT pg_get_functiondef('public.ptown_words_action(uuid,uuid,bigint,text,jsonb)'::regprocedure) INTO source;
 changed:=replace(source,'p_action NOT IN(''place'',''pass'',''exchange'')','p_action NOT IN(''place'',''pass'',''exchange'',''time_bank'',''request_pause'')');
 IF source=changed THEN RAISE EXCEPTION 'Words command preimage missing';END IF;source:=changed;
 changed:=replace(source,'IF m.state->''players''->(m.state->>''turnIndex'')::int->>''id'' IS DISTINCT FROM player::text THEN', $request$
 IF p_action='request_pause' THEN
  IF m.state#>>'{rules,version}'<>'ptown-words/2' OR actor=g.current_host OR p_items IS NOT NULL OR m.state->>'phase'<>'playing' THEN RAISE EXCEPTION 'ptown_words:pause_request_unavailable';END IF;
  -- One request per canonical pause/host episode. A retry does not create a
  -- second notice or alter the deadline. The pending notice survives reconnect.
  IF NOT (m.state ? 'pauseRequest') THEN
   m.state:=m.state||jsonb_build_object('pauseRequest',jsonb_build_object('id',p_request_id,'playerId',player,'hostUserId',g.current_host,'pauseVersion',g.pause_version));
   UPDATE private.ptown_words_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
  END IF;
  answer:=public.ptown_words_snapshot(m.dealer_game_id);
  INSERT INTO private.ptown_words_requests(dealer_game_id,request_id,actor,command,response) VALUES(m.dealer_game_id,p_request_id,actor,command,answer);
  RETURN answer;
 END IF;
 IF m.state->'players'->(m.state->>'turnIndex')::int->>'id' IS DISTINCT FROM player::text THEN$request$);
 IF source=changed THEN RAISE EXCEPTION 'Words request preimage missing';END IF;EXECUTE changed;

 SELECT pg_get_functiondef('public.ptown_words_snapshot(uuid)'::regprocedure) INTO source;
 changed:=replace(source,'private.ptown_words_visible(m.state,viewer::text)||jsonb_build_object(',
  'private.ptown_words_visible(m.state,viewer::text)||CASE WHEN m.state#>>''{rules,version}''=''ptown-words/2'' THEN (SELECT jsonb_build_object(''hostUserId'',current_host,''pauseVersion'',pause_version) FROM public.games WHERE id=m.game_id) ELSE ''{}''::jsonb END||jsonb_build_object(');
 IF source=changed THEN RAISE EXCEPTION 'Words snapshot preimage missing';END IF;EXECUTE changed;

 SELECT pg_get_functiondef('private.ptown_words_pause()'::regprocedure) INTO source;
 changed:=replace(source,'SET paused_at=at_ms,revision=revision+1','SET state=state-''pauseRequest'',paused_at=at_ms,revision=revision+1');
 IF source=changed THEN RAISE EXCEPTION 'Words pause preimage missing';END IF;EXECUTE changed;
END $patch$;

-- Current host identity remains the canonical games.current_host field. Its
-- change receives a Words revision so equal-progress snapshot checks stay strict.
CREATE FUNCTION private.ptown_words_host_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE private.ptown_words_matches SET state=state-'pauseRequest',revision=revision+1
 WHERE dealer_game_id=NEW.current_game_uuid AND NOT finished AND state#>>'{rules,version}'='ptown-words/2';
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.ptown_words_host_changed() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ptown_words_host_changed AFTER UPDATE OF current_host ON public.games
FOR EACH ROW WHEN(NEW.game_type='ptown-words' AND NEW.current_host IS DISTINCT FROM OLD.current_host)
EXECUTE FUNCTION private.ptown_words_host_changed();

DO $patch$
DECLARE source text;changed text;
BEGIN
 SELECT pg_get_functiondef('public.ptown_words_action(uuid,uuid,bigint,text,jsonb)'::regprocedure) INTO source;
 -- Reapplying this exact scoped delta is harmless; unexpected sources fail closed.
 IF position('ptown_words:cancel_request_target' IN source)>0 THEN RETURN;END IF;
 changed:=replace(source,'p_action NOT IN(''place'',''pass'',''exchange'',''time_bank'',''request_pause'')',
  'p_action NOT IN(''place'',''pass'',''exchange'',''time_bank'',''request_pause'',''cancel_pause_request'')');
 IF source=changed THEN RAISE EXCEPTION 'Words cancel whitelist preimage missing';END IF;source:=changed;
 changed:=replace(source,'END IF;RETURN prior.response;END IF;',
  'END IF;IF p_action=''cancel_pause_request'' THEN RETURN public.ptown_words_snapshot(m.dealer_game_id);END IF;RETURN prior.response;END IF;');
 IF source=changed THEN RAISE EXCEPTION 'Words cancel replay preimage missing';END IF;source:=changed;
 changed:=replace(source,'OR m.finished OR g.is_paused THEN','OR m.finished OR (g.is_paused AND p_action<>''cancel_pause_request'') THEN');
 IF source=changed THEN RAISE EXCEPTION 'Words cancel pause preimage missing';END IF;source:=changed;
 changed:=replace(source,'IF m.revision<>p_revision THEN', $cancel$
 IF p_action='cancel_pause_request' THEN
  IF m.state#>>'{rules,version}'<>'ptown-words/2' OR actor=g.current_host OR m.state->>'phase'<>'playing' THEN RAISE EXCEPTION 'ptown_words:cancel_request_unavailable';END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'ptown_words:cancel_request_target';END IF;
  IF jsonb_array_length(p_items)<>1 OR jsonb_typeof(p_items->0->'requestId') IS DISTINCT FROM 'string' OR (p_items->0->>'requestId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'ptown_words:cancel_request_target';END IF;
  IF m.state ? 'pauseRequest' THEN
   IF m.state#>>'{pauseRequest,playerId}' IS DISTINCT FROM player::text THEN RAISE EXCEPTION 'ptown_words:pause_request_owner_required' USING ERRCODE='42501';END IF;
   IF (m.state#>>'{pauseRequest,id}')::uuid IS DISTINCT FROM (p_items->0->>'requestId')::uuid THEN RAISE EXCEPTION 'ptown_words:stale_pause_request';END IF;
   IF g.is_paused THEN RAISE EXCEPTION 'ptown_words:inactive';END IF;
   IF m.revision<>p_revision THEN RAISE EXCEPTION 'ptown_words:stale_revision';END IF;
   UPDATE private.ptown_words_matches SET state=state-'pauseRequest',revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
  END IF;
  -- An absent request is already withdrawn (including when host pause won).
  -- Never call set_game_paused or change clocks, turn, rack or financial state.
  answer:=public.ptown_words_snapshot(m.dealer_game_id);
  INSERT INTO private.ptown_words_requests(dealer_game_id,request_id,actor,command,response) VALUES(m.dealer_game_id,p_request_id,actor,command,answer);
  RETURN answer;
 END IF;
 IF m.revision<>p_revision THEN$cancel$);
 IF source=changed THEN RAISE EXCEPTION 'Words cancel action preimage missing';END IF;EXECUTE changed;
END $patch$;
