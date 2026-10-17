-- Solo orchestration only. Board rules remain in the shared eleven-up/1 core.
CREATE OR REPLACE FUNCTION private.arcade_eleven_finish_round(s jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb; round_i integer:=(s->>'round')::integer;
BEGIN
 IF s#>>'{board,phase}'<>'stage_complete' OR jsonb_array_length(s->'results')>=round_i THEN RETURN s;END IF;
 r:=s#>'{board,result}'||jsonb_build_object('id',s->>'roundId','stage',round_i);
 s:=s||jsonb_build_object('results',(s->'results')||jsonb_build_array(r),'score',s#>'{board,score}');
 IF round_i=2 THEN s:=s||jsonb_build_object('bonusQualified',private.eleven_up_bonus_qualified((r->>'score')::bigint,s->'config'));END IF;
 IF round_i=3 OR (round_i=2 AND NOT (s->>'bonusQualified')::boolean) THEN s:=s||jsonb_build_object('status','completed');END IF;
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION private.arcade_eleven_finish_round(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.arcade_eleven_advance(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE due bigint; round_i integer; i integer;
BEGIN
 FOR i IN 1..12 LOOP
  EXIT WHEN s->>'status'<>'active';
  due:=(s#>>'{board,deadline}')::bigint;EXIT WHEN due>at_ms;
  IF s#>>'{board,phase}'='stage_complete' THEN
   round_i:=(s->>'round')::integer+1;
   s:=s||jsonb_build_object('round',round_i,'roundId',(s->>'runId')||':'||round_i,
    'board',private.eleven_up_board_deal(jsonb_build_object('rules',s->'config','score',s->'score'),due));
  ELSE
   s:=jsonb_set(s,'{board}',private.eleven_up_board_reduce(s->'board','tick',NULL,due));
   s:=private.arcade_eleven_finish_round(s);
  END IF;
 END LOOP;
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION private.arcade_eleven_advance(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.arcade_eleven_valid_completion(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE r jsonb; previous bigint:=0; i integer:=0; n integer; required integer;
BEGIN
 n:=jsonb_array_length(s->'results');
 required:=CASE WHEN private.eleven_up_bonus_qualified((s#>>'{results,1,score}')::bigint,s->'config') THEN 3 ELSE 2 END;
 IF n IS DISTINCT FROM required OR (s->>'round')::integer IS DISTINCT FROM required THEN RETURN false;END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(s->'results') LOOP
  i:=i+1;
  IF r->>'id' IS DISTINCT FROM (s->>'runId')||':'||i OR (r->>'stage')::integer IS DISTINCT FROM i
   OR (r->>'scoreBefore')::bigint IS DISTINCT FROM previous OR (r->>'score')::bigint IS NULL
   OR (r->>'score')::bigint<0 OR (r->>'stageScore')::bigint IS DISTINCT FROM (r->>'score')::bigint-previous THEN RETURN false;END IF;
  previous:=(r->>'score')::bigint;
 END LOOP;
 RETURN (s->>'score')::bigint=previous AND (s#>>'{board,score}')::bigint=previous AND s#>>'{board,phase}'='stage_complete';
END $$;
REVOKE ALL ON FUNCTION private.arcade_eleven_valid_completion(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.arcade_eleven_projection(run private.arcade_runs,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE s jsonb:=run.state; b jsonb:=s->'board'; v jsonb; result jsonb:=s->'results'->-1;
BEGIN
 v:=private.eleven_up_visible(b)-ARRAY['activePlayerId','cursor'];
 SELECT jsonb_object_agg(k,v->k) INTO v FROM unnest(ARRAY['rules','phase','slots','current','exposed','passSlot','canPass','groups','score','deadline','event','stockRemaining']) k;
 RETURN jsonb_build_object('id',run.id,'game',run.game,'ruleset',run.ruleset,'revision',run.revision,'status',run.status,
  'serverAt',at_ms,'score',run.score,'dueAt',run.due_at,'events','[]'::jsonb,
  'completion',(SELECT record FROM private.arcade_results WHERE run_id=run.id),
  'view',v||jsonb_build_object('roundId',s->>'roundId','round',s->'round','result',CASE WHEN b->>'phase'='stage_complete' THEN result ELSE NULL END,
   'scorePresentation',CASE WHEN b->>'phase'='stage_complete' THEN jsonb_build_object('startedAt',(result->>'completedAt')::bigint,
    'endsAt',(b->>'deadline')::bigint,'from',result->'scoreBefore','to',result->'score') ELSE NULL END));
END $$;
REVOKE ALL ON FUNCTION private.arcade_eleven_projection(private.arcade_runs,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.arcade_eleven_step(p_actor uuid,p_run uuid,p_revision bigint DEFAULT NULL,p_round text DEFAULT NULL,
 p_request uuid DEFAULT NULL,p_action text DEFAULT NULL,p_items integer[] DEFAULT NULL,p_token uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE run private.arcade_runs;s jsonb;next_s jsonb;receipt private.arcade_command_receipts;fingerprint text;
 at_ms bigint;outcome text:='current';committed jsonb;
BEGIN
 IF p_actor IS NULL THEN
  IF p_action IS NOT NULL OR NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR run.game<>'eleven-up' OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action IS NOT NULL THEN
  IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_action NOT IN('group','pass','take_score','abandon') THEN RAISE EXCEPTION 'arcade:invalid_command';END IF;
  fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_items)::text;
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.arcade_record(run),'projection',private.arcade_eleven_projection(run,at_ms));
  END IF;
 END IF;
 s:=run.state;
 IF run.status='active' THEN
  IF s IS NULL THEN
   s:=jsonb_build_object('runId',run.id,'userId',run.user_id,'config',run.config,'round',1,'roundId',run.id||':1','status','active','score',0,'results','[]'::jsonb,
    'board',private.eleven_up_board_deal(jsonb_build_object('rules',run.config,'score',0),floor(extract(epoch FROM run.created_at)*1000)::bigint));
  END IF;
  next_s:=private.arcade_eleven_advance(s,at_ms);
  IF next_s IS DISTINCT FROM run.state THEN
   committed:=public.arcade_commit(p_actor,run.id,run.revision,next_s,(next_s#>>'{board,deadline}')::bigint,NULL,NULL,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;
  END IF;
 END IF;
 IF p_action IS NOT NULL THEN
  IF run.status<>'active' OR run.revision<>p_revision OR run.state->>'roundId' IS DISTINCT FROM p_round THEN outcome:='stale';
  ELSE
   s:=run.state;
   IF p_action='abandon' THEN s:=s||jsonb_build_object('status','abandoned');
   ELSE
    s:=jsonb_set(s,'{board}',private.eleven_up_board_reduce(s->'board',p_action,p_items,at_ms));
    s:=s||jsonb_build_object('score',s#>'{board,score}');s:=private.arcade_eleven_finish_round(s);
   END IF;
   committed:=public.arcade_commit(p_actor,run.id,run.revision,s,(s#>>'{board,deadline}')::bigint,p_request,fingerprint,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;outcome:='committed';
  END IF;
 END IF;
 RETURN jsonb_build_object('outcome',outcome,'record',private.arcade_record(run),'projection',private.arcade_eleven_projection(run,at_ms));
END $$;
REVOKE ALL ON FUNCTION public.arcade_eleven_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_eleven_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) TO service_role;

INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('eleven-up/1','eleven-up',private.eleven_up_rules(),false) ON CONFLICT(id) DO NOTHING;
