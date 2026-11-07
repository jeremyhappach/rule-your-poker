-- Three-round solo orchestration. The frozen v1 board scorer is reused verbatim.
INSERT INTO private.arcade_rulesets(id,game,config,enabled)
 SELECT '357-drop/2',game,config||'{"version":"357-drop/2","rounds":3,"introMs":2500,"holdMs":5000}'::jsonb,false
 FROM private.arcade_rulesets WHERE id='357-drop/1' ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.drop357_v2_deal(s jsonb,at_ms bigint,round_i integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE bank bigint:=coalesce((s->>'banked')::bigint,0);history jsonb:=coalesce(s->'rounds','[]'::jsonb);
BEGIN
 s:=private.drop357_deal(s,at_ms+2500);
 RETURN s||jsonb_build_object('round',round_i,'roundId',(s->>'runId')||':'||round_i,'phase','intro','deadline',at_ms+2500,
  'playDeadline',at_ms+122500,'banked',bank,'score',bank,'rounds',history);
END $$;

CREATE OR REPLACE FUNCTION private.drop357_v2_bank(s jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE bank bigint:=(s->>'banked')::bigint;award bigint:=(s#>>'{result,score}')::bigint;r jsonb:=s->'result';proof jsonb;
BEGIN
 IF s->>'status'<>'completed' OR jsonb_array_length(s->'rounds')>=(s->>'round')::integer THEN RETURN s;END IF;
 proof:=s-'deck'-'rounds'-'config'-'banked'-'playDeadline';
 r:=r||jsonb_build_object('id',s->>'roundId','scoreBefore',bank,'roundScore',award,'score',bank+award);
 RETURN s||jsonb_build_object('status',CASE WHEN s->>'round'='3' THEN 'completed' ELSE 'active' END,'phase','stage_complete',
  'score',bank+award,'banked',bank+award,'result',r,'rounds',(s->'rounds')||jsonb_build_array(proof),
  'deadline',(r->>'completedAt')::bigint+5000);
END $$;

CREATE OR REPLACE FUNCTION private.drop357_v2_advance(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE due bigint;i integer;
BEGIN
 FOR i IN 1..12 LOOP
  EXIT WHEN s->>'status'<>'active';due:=(s->>'deadline')::bigint;EXIT WHEN at_ms<due;
  CASE s->>'phase'
   WHEN 'intro' THEN s:=s||jsonb_build_object('phase','playing','deadline',s->'playDeadline');
   WHEN 'playing' THEN s:=private.drop357_v2_bank(private.drop357_finish(s,due,'timeout'));
   WHEN 'stage_complete' THEN s:=private.drop357_v2_deal(s,due,(s->>'round')::integer+1);
   ELSE RAISE EXCEPTION 'arcade:invalid_phase';
  END CASE;
 END LOOP;
 RETURN s;
END $$;

CREATE OR REPLACE FUNCTION private.drop357_v2_action(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE bank bigint:=(s->>'banked')::bigint;
BEGIN
 IF action='abandon' AND cardinality(items)=0 THEN RETURN s||'{"status":"abandoned","phase":"complete","current":null}'::jsonb;END IF;
 IF s->>'phase'<>'playing' OR s->>'status'<>'active' OR at_ms>=(s->>'deadline')::bigint THEN RAISE EXCEPTION 'arcade:not_playing';END IF;
 s:=private.drop357_action(s||jsonb_build_object('score',(s->>'score')::bigint-bank),action,items,at_ms);
 IF s->>'status'='completed' THEN RETURN private.drop357_v2_bank(s);END IF;
 RETURN s||jsonb_build_object('score',bank+(s->>'score')::bigint);
END $$;

CREATE OR REPLACE FUNCTION private.drop357_valid_dispatch(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE evidence jsonb;i integer:=0;total bigint:=0;
BEGIN
 IF s#>>'{config,version}'='357-drop/1' THEN RETURN private.drop357_valid(s);END IF;
 IF s#>>'{config,version}' IS DISTINCT FROM '357-drop/2' OR s->>'round' IS DISTINCT FROM '3'
  OR s->>'phase' IS DISTINCT FROM 'stage_complete' OR jsonb_array_length(s->'rounds') IS DISTINCT FROM 3 THEN RETURN false;END IF;
 FOR evidence IN SELECT value FROM jsonb_array_elements(s->'rounds') LOOP
  i:=i+1;
  IF evidence->>'roundId' IS DISTINCT FROM (s->>'runId')||':'||i OR evidence->>'round' IS DISTINCT FROM i::text
   OR private.drop357_valid(evidence||'{"round":1}'::jsonb) IS DISTINCT FROM true THEN RETURN false;END IF;
  total:=total+(evidence->>'score')::bigint;
 END LOOP;
 RETURN total=(s->>'score')::bigint AND total=(s->>'banked')::bigint AND total=(s#>>'{result,score}')::bigint
  AND (s->'rounds'->2->'lanes')=s->'lanes' AND (s->'rounds'->2->'laneResults')=s->'laneResults';
END $$;

DO $$
DECLARE definition text;
BEGIN
 IF to_regprocedure('private.drop357_step_v1(uuid,uuid,bigint,text,uuid,text,integer[],uuid)') IS NULL THEN
  definition:=pg_get_functiondef('public.arcade_drop357_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)'::regprocedure);
  EXECUTE replace(definition,'public.arcade_drop357_step(','private.drop357_step_v1(');
 END IF;
 definition:=pg_get_functiondef('public.arcade_commit(uuid,uuid,bigint,jsonb,bigint,uuid,text,uuid)'::regprocedure);
 IF position('private.drop357_valid_dispatch' IN definition)=0 THEN
  IF position('private.drop357_valid(p_state)' IN definition)=0 THEN RAISE EXCEPTION '357:commit_owner_changed';END IF;
  EXECUTE replace(definition,'private.drop357_valid(p_state)','private.drop357_valid_dispatch(p_state)');
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_drop357_step(p_actor uuid,p_run uuid,p_revision bigint DEFAULT NULL,p_round text DEFAULT NULL,
 p_request uuid DEFAULT NULL,p_action text DEFAULT NULL,p_items integer[] DEFAULT '{}',p_token uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE run private.arcade_runs;receipt private.arcade_command_receipts;s jsonb;at_ms bigint;fingerprint text;
 outcome text:='current';command_id uuid;projection jsonb;
BEGIN
 IF p_actor IS NULL THEN
  IF p_action IS NOT NULL OR NOT EXISTS(SELECT FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSE
  PERFORM private.require_account_enabled(p_actor);
  IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR run.game<>'357-drop' OR (p_actor IS NOT NULL AND p_actor<>run.user_id) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 IF run.ruleset='357-drop/1' THEN RETURN private.drop357_step_v1(p_actor,p_run,p_revision,p_round,p_request,p_action,p_items,p_token);END IF;
 IF run.ruleset<>'357-drop/2' THEN RAISE EXCEPTION 'arcade:unsupported_ruleset';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action IS NOT NULL THEN
  IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_items IS NULL OR array_position(p_items,NULL) IS NOT NULL OR p_action NOT IN('place','pass','abandon') THEN RAISE EXCEPTION 'arcade:invalid_command';END IF;
  fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_items)::text;
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;outcome:='duplicate';
  END IF;
 END IF;
 s:=run.state;
 IF run.status='active' THEN
  IF s IS NULL THEN s:=private.drop357_v2_deal(jsonb_build_object('runId',run.id,'userId',run.user_id,'status','active','config',run.config),floor(extract(epoch FROM run.created_at)*1000)::bigint,1);END IF;
  s:=private.drop357_v2_advance(s,at_ms);
 END IF;
 IF p_action IS NOT NULL AND outcome<>'duplicate' THEN
  IF s IS DISTINCT FROM run.state OR run.status<>'active' OR p_revision<>run.revision OR p_round IS DISTINCT FROM s->>'roundId' THEN outcome:='stale';
  ELSE s:=private.drop357_v2_action(s,p_action,p_items,at_ms);command_id:=p_request;outcome:='committed';END IF;
 END IF;
 IF s IS DISTINCT FROM run.state THEN
  PERFORM public.arcade_commit(p_actor,p_run,run.revision,s,(s->>'deadline')::bigint,command_id,fingerprint,p_token);
  SELECT * INTO STRICT run FROM private.arcade_runs WHERE id=p_run;
 END IF;
 projection:=jsonb_build_object('id',run.id,'revision',run.revision,'status',run.status,'ruleset',run.ruleset,'serverAt',at_ms,
  'round',s->'round','rounds',3,'banked',s->'banked','roundId',s->'roundId','score',run.score,'phase',s->'phase','lanes',s->'lanes','laneResults',s->'laneResults',
  'current',s->'current','stockLeft',52-(s->>'cursor')::integer,'passesLeft',s->'passesLeft','placements',s->'placements',
  'startedAt',s->'startedAt','deadline',s->'deadline','result',s->'result','completion',(SELECT record FROM private.arcade_results WHERE run_id=run.id));
 RETURN jsonb_build_object('outcome',outcome,'record',jsonb_build_object('id',run.id,'game',run.game,'revision',run.revision,'status',run.status),'projection',projection);
END $$;
REVOKE ALL ON FUNCTION private.drop357_v2_deal(jsonb,bigint,integer),private.drop357_v2_bank(jsonb),private.drop357_v2_advance(jsonb,bigint),
 private.drop357_v2_action(jsonb,text,integer[],bigint),private.drop357_valid_dispatch(jsonb),private.drop357_step_v1(uuid,uuid,bigint,text,uuid,text,integer[],uuid)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.arcade_drop357_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_drop357_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) TO service_role;
