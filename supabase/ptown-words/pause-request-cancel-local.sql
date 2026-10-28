-- LOCAL REVIEW ONLY. Apply after banks-pause-local.sql. No hosted migration.
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
