-- Solo lifecycle, shared Arcade persistence. No financial/session owners.
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('horses-blitz/1','horses-blitz',private.horses_blitz_rules(),false) ON CONFLICT(id) DO NOTHING;
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('horses-blitz/2','horses-blitz',private.horses_blitz_rules('horses-blitz/2'),false) ON CONFLICT(id) DO NOTHING;
DO $$
DECLARE definition text; anchor text;
BEGIN
 definition:=pg_get_functiondef('public.arcade_start(uuid,uuid,text)'::regprocedure);
 anchor:='p_game NOT IN (';
 IF position('''horses-blitz''' IN definition)=0 THEN
  IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'arcade:start_registration_changed'; END IF;
  EXECUTE replace(definition,anchor,'p_game NOT IN (''horses-blitz'',');
 END IF;
 definition:=pg_get_functiondef('public.arcade_commit(uuid,uuid,bigint,jsonb,bigint,uuid,text,uuid)'::regprocedure);
 anchor:=' IF run.game=''crib-lab'' AND status_i=''completed''';
 IF position('private.horses_blitz_valid' IN definition)=0 THEN
  IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'arcade:commit_registration_changed'; END IF;
  EXECUTE replace(definition,anchor,' IF run.game=''horses-blitz'' AND status_i=''completed'' AND private.horses_blitz_valid(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION ''arcade:invalid_completion''; END IF;'||chr(10)||anchor);
 END IF;
 SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint WHERE conrelid='public.arcade_game_artwork'::regclass AND conname='arcade_game_artwork_game_check';
 IF position('''horses-blitz''' IN definition)=0 THEN
  IF position('ARRAY[' IN definition)=0 THEN RAISE EXCEPTION 'arcade:artwork_registration_changed'; END IF;
  ALTER TABLE public.arcade_game_artwork DROP CONSTRAINT arcade_game_artwork_game_check;
  EXECUTE 'ALTER TABLE public.arcade_game_artwork ADD CONSTRAINT arcade_game_artwork_game_check '||replace(definition,'ARRAY[','ARRAY[''horses-blitz''::text,');
 END IF;
END $$;
INSERT INTO public.arcade_game_artwork(game) VALUES('horses-blitz') ON CONFLICT(game) DO NOTHING;

CREATE OR REPLACE FUNCTION public.arcade_horses_blitz_step(p_actor uuid,p_run uuid,p_revision bigint DEFAULT NULL,p_round text DEFAULT NULL,
 p_request uuid DEFAULT NULL,p_action text DEFAULT NULL,p_items integer[] DEFAULT '{}',p_token uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE run private.arcade_runs; receipt private.arcade_command_receipts; s jsonb; at_ms bigint;
 fingerprint text; outcome text:='current'; command_id uuid; projection jsonb;
BEGIN
 IF p_actor IS NULL THEN
  IF p_action IS NOT NULL OR NOT EXISTS(SELECT FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN
   RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501'; END IF;
 ELSE
  PERFORM private.require_account_enabled(p_actor);
  IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR run.game<>'horses-blitz' OR (p_actor IS NOT NULL AND p_actor<>run.user_id) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501'; END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action IS NOT NULL THEN
  IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_items IS NULL OR array_position(p_items,NULL) IS NOT NULL OR p_action NOT IN('roll','bank','next_round','abandon') THEN RAISE EXCEPTION 'arcade:invalid_command'; END IF;
  fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_items)::text;
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict'; END IF;
   outcome:='duplicate';
  END IF;
 END IF;
 s:=run.state;
 IF run.status='active' THEN
  IF s IS NULL THEN s:=private.horses_blitz_round(jsonb_build_object('runId',run.id,'userId',run.user_id,'status','active','config',run.config,'round',0,'score',0,'results','[]'::jsonb),floor(extract(epoch FROM run.created_at)*1000)::bigint); END IF;
  s:=private.horses_blitz_advance(s,at_ms);
 END IF;
 IF p_action IS NOT NULL AND outcome<>'duplicate' THEN
  IF s IS DISTINCT FROM run.state OR run.status<>'active' OR p_revision<>run.revision OR p_round IS DISTINCT FROM s->>'roundId' THEN outcome:='stale';
  ELSE s:=private.horses_blitz_action(s,p_action,p_items,at_ms);command_id:=p_request;outcome:='committed'; END IF;
 END IF;
 IF s IS DISTINCT FROM run.state THEN
  PERFORM public.arcade_commit(p_actor,p_run,run.revision,s,CASE WHEN s->>'phase'='summary' THEN NULL WHEN s->>'phase'='banking' AND s->>'hand'='10' THEN (s->>'phaseUntil')::bigint ELSE least((s->>'deadline')::bigint,(s->>'phaseUntil')::bigint) END,command_id,fingerprint,p_token);
  SELECT * INTO STRICT run FROM private.arcade_runs WHERE id=p_run;
 END IF;
 projection:=jsonb_build_object('id',run.id,'revision',run.revision,'status',run.status,'ruleset',run.ruleset,'serverAt',at_ms,
  'roundId',s->'roundId','round',s->'round','handId',s->'handId','hand',s->'hand','score',run.score,'phase',s->'phase',
  'roll',s->'roll','dice',s->'dice','held',s->'held','set',s->'set','base',s->'base','bank',s->'bank','dueAt',run.due_at,
  'startedAt',s->'startedAt','deadline',s->'deadline','phaseUntil',s->'phaseUntil','result',s->'result','completion',(SELECT record FROM private.arcade_results WHERE run_id=run.id));
 RETURN jsonb_build_object('outcome',outcome,'record',jsonb_build_object('id',run.id,'game',run.game,'revision',run.revision,'status',run.status),'projection',projection);
END $$;
REVOKE ALL ON FUNCTION public.arcade_horses_blitz_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_horses_blitz_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) TO service_role;
DO $$ DECLARE p record;BEGIN FOR p IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname LIKE 'horses_blitz_%' LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||p.sig||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;END $$;
