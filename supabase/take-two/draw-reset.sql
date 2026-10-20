-- Owner-approved Take 2 draw reset. Historical records and active configs are untouched.
SET LOCAL lock_timeout='3s';
-- P-Town Take 2. Historical rules stay frozen for in-progress games.
CREATE OR REPLACE FUNCTION private.take_two_rules(version_i text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE version_i WHEN 'take-two/1' THEN '{"version":"take-two/1","stageMs":100000,"introMs":2500,"holdMs":6000,"clockStart":"intro_end","rounds":3,"samePoints":1200,"consecutivePoints":400,"meterMax":500,"meterMin":50,"meterHoldMs":1000,"meterStepsPerSecond":30,"meterStep":5,"drawPenalty":100,"clearBonus":10000,"stockBonus":1000,"timeBonusPerSecond":50,"aceWrap":true,"vacancyOrder":"first_exposed_row_major"}'::jsonb
 WHEN 'take-two/2' THEN '{"version":"take-two/1","stageMs":100000,"introMs":2500,"holdMs":6000,"clockStart":"intro_end","rounds":3,"samePoints":1200,"consecutivePoints":400,"meterMax":500,"meterMin":50,"meterHoldMs":1000,"meterStepsPerSecond":30,"meterStep":5,"drawPenalty":100,"clearBonus":10000,"stockBonus":1000,"timeBonusPerSecond":50,"aceWrap":true,"vacancyOrder":"first_exposed_row_major"}'::jsonb || '{"version":"take-two/2","drawResetsMeter":true}'::jsonb END
$$;
REVOKE ALL ON FUNCTION private.take_two_rules(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.take_two_rules() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT private.take_two_rules('take-two/2') $$;

CREATE OR REPLACE FUNCTION private.take_two_layout(stage integer) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_agg(jsonb_build_object('row',r,'column',c,'x',2*c+r%2) ORDER BY r,c)
 FROM generate_series(0,CASE WHEN stage=1 THEN 4 ELSE 5 END) r
 CROSS JOIN LATERAL generate_series(0,CASE WHEN r%2=0 THEN 5 ELSE 4 END)c
$$;

CREATE OR REPLACE FUNCTION private.take_two_exposed(b jsonb,i integer) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT i>=0 AND i<jsonb_array_length(b->'slots') AND NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(b->'layout') WITH ORDINALITY a(p,n)
  WHERE (p->>'row')::integer=(b->'layout'->i->>'row')::integer+1
   AND abs((p->>'x')::integer-(b->'layout'->i->>'x')::integer)=1
   AND b->'slots'->(n::integer-1)<>'null'::jsonb)
$$;

CREATE OR REPLACE FUNCTION private.take_two_pairs(b jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 WITH cards AS (
 SELECT n::integer-1 i,c::integer card FROM jsonb_array_elements(b->'slots') WITH ORDINALITY a(c,n)
 WHERE c<>'null'::jsonb AND private.take_two_exposed(b,n::integer-1)
 UNION ALL SELECT -1,(b->>'current')::integer WHERE b->>'current' IS NOT NULL)
 SELECT coalesce(jsonb_agg(jsonb_build_array(a.i,z.i) ORDER BY a.i,z.i),'[]'::jsonb)
 FROM cards a JOIN cards z ON a.i<z.i
 WHERE abs(a.card%13-z.card%13)<=1 OR ((b#>>'{rules,aceWrap}')::boolean AND abs(a.card%13-z.card%13)=12)
$$;

CREATE OR REPLACE FUNCTION private.take_two_meter(b jsonb,at_ms bigint) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT greatest((b#>>'{rules,meterMin}')::integer,(b#>>'{rules,meterMax}')::integer-
 (b#>>'{rules,meterStep}')::integer*floor(greatest(0,at_ms-(b->>'meterAt')::bigint-(b#>>'{rules,meterHoldMs}')::integer)*(b#>>'{rules,meterStepsPerSecond}')::numeric/1000)::integer)
$$;

CREATE OR REPLACE FUNCTION private.take_two_shuffle() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE a integer[]:=ARRAY(SELECT generate_series(0,51));i integer;j integer;t integer;bytes bytea;n bigint;
BEGIN
 FOR i IN REVERSE 52..2 LOOP
  LOOP
   bytes:=extensions.gen_random_bytes(4);
   n:=get_byte(bytes,0)::bigint*16777216+get_byte(bytes,1)::bigint*65536+get_byte(bytes,2)::bigint*256+get_byte(bytes,3);
   EXIT WHEN n<4294967296-(4294967296%i);
  END LOOP;
  j:=(n%i)::integer+1;t:=a[i];a[i]:=a[j];a[j]:=t;
 END LOOP;RETURN to_jsonb(a);
END $$;

CREATE OR REPLACE FUNCTION private.take_two_board_deal(b jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE deck jsonb:=private.take_two_shuffle();layout jsonb;size_i integer;start_i bigint;
BEGIN
 IF private.take_two_rules(b#>>'{rules,version}') IS NULL OR b->'rules' IS DISTINCT FROM private.take_two_rules(b#>>'{rules,version}') THEN RAISE EXCEPTION 'take_two:rules';END IF;
 layout:=private.take_two_layout(coalesce((b->>'stage')::integer,1));size_i:=jsonb_array_length(layout);
 start_i:=at_ms+(b#>>'{rules,introMs}')::integer;
 RETURN (b-ARRAY['result','startedAt'])||jsonb_build_object('deck',deck,'layout',layout,
 'slots',(SELECT jsonb_agg(deck->i ORDER BY i) FROM generate_series(0,size_i-1)i),'cursor',size_i+1,'current',deck->size_i,
 'scoreBefore',coalesce(b->'score','0'::jsonb),'score',coalesce(b->'score','0'::jsonb),'samePairs',0,'consecutivePairs',0,
 'meterAt',start_i,'phase','intro','deadline',start_i,'result',NULL,'event',jsonb_build_object('label','Get ready','points',0));
END $$;

CREATE OR REPLACE FUNCTION private.take_two_board_finish(b jsonb,at_ms bigint,reason text) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE clear_i integer:=0;stock_i integer:=0;time_i integer:=0;total bigint;result_i jsonb;
BEGIN
 IF reason='full_clear' THEN clear_i:=(b#>>'{rules,clearBonus}')::integer;
  stock_i:=(52-(b->>'cursor')::integer)*(b#>>'{rules,stockBonus}')::integer;END IF;
 IF reason='full_clear' OR (reason='take_score' AND (b->>'cursor')::integer=52 AND private.take_two_pairs(b)='[]'::jsonb) THEN
  time_i:=least(100,greatest(0,((b->>'deadline')::bigint-at_ms)/1000))*(b#>>'{rules,timeBonusPerSecond}')::integer;
 END IF;
 total:=(b->>'score')::bigint+clear_i+stock_i+time_i;
 result_i:=jsonb_build_object('reason',reason,'scoreBefore',b->'scoreBefore','displayScore',b->'score','score',total,
 'stageScore',total-(b->>'scoreBefore')::bigint,'clearBonus',clear_i,'stockBonus',stock_i,'timeBonus',time_i,'completedAt',at_ms);
 RETURN b||jsonb_build_object('score',total,'result',result_i,'phase','stage_complete','deadline',at_ms+(b#>>'{rules,holdMs}')::integer,
 'event',jsonb_build_object('label',CASE reason WHEN 'full_clear' THEN 'Playfield cleared!' WHEN 'timeout' THEN 'Time up' ELSE 'Score banked' END,'points',clear_i+stock_i+time_i));
END $$;

CREATE OR REPLACE FUNCTION private.take_two_board_reduce(b jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE i integer;j integer;ca integer;cb integer;points_i integer;cursor_i integer;vacancy integer;key_i text;slots_i jsonb;
BEGIN
 IF private.take_two_rules(b#>>'{rules,version}') IS NULL OR b->'rules' IS DISTINCT FROM private.take_two_rules(b#>>'{rules,version}') THEN RAISE EXCEPTION 'take_two:rules';END IF;
 IF b->>'phase'='intro' THEN
  IF at_ms<(b->>'deadline')::bigint THEN IF action='tick' THEN RETURN b;END IF;RAISE EXCEPTION 'take_two:intro';END IF;
  b:=b||jsonb_build_object('phase','playing','startedAt',b->'deadline','deadline',(b->>'deadline')::bigint+(b#>>'{rules,stageMs}')::integer);
 END IF;
 IF b->>'phase'<>'playing' THEN RAISE EXCEPTION 'take_two:phase';END IF;
 IF at_ms>=(b->>'deadline')::bigint THEN RETURN private.take_two_board_finish(b,(b->>'deadline')::bigint,'timeout');END IF;
 IF action='tick' THEN RETURN b;END IF;
 IF action='take_score' THEN RETURN private.take_two_board_finish(b,at_ms,'take_score');END IF;
 cursor_i:=(b->>'cursor')::integer;slots_i:=b->'slots';
 IF action='draw' THEN
  IF cursor_i>=52 THEN RAISE EXCEPTION 'take_two:stock_empty';END IF;
  SELECT x INTO vacancy FROM generate_series(0,jsonb_array_length(slots_i)-1)x
   WHERE slots_i->x='null'::jsonb AND private.take_two_exposed(b,x) ORDER BY x LIMIT 1;
  IF vacancy IS NOT NULL AND b->>'current' IS NOT NULL THEN slots_i:=jsonb_set(slots_i,ARRAY[vacancy::text],b->'current');END IF;
  RETURN b||jsonb_build_object('slots',slots_i,'current',b->'deck'->cursor_i,'cursor',cursor_i+1,
   'score',greatest(0,(b->>'score')::bigint-(b#>>'{rules,drawPenalty}')::integer),
   'meterAt',CASE WHEN coalesce((b#>>'{rules,drawResetsMeter}')::boolean,false) THEN at_ms ELSE (b->>'meterAt')::bigint END,
   'event',jsonb_build_object('label','Next card','points',-least((b->>'score')::integer,(b#>>'{rules,drawPenalty}')::integer)));
 END IF;
 IF action<>'pair' OR cardinality(items) IS DISTINCT FROM 2 OR items[1] IS NULL OR items[2] IS NULL THEN RAISE EXCEPTION 'take_two:invalid_command';END IF;
 i:=least(items[1],items[2]);j:=greatest(items[1],items[2]);
 IF NOT private.take_two_pairs(b) @> jsonb_build_array(jsonb_build_array(i,j)) THEN RAISE EXCEPTION 'take_two:illegal_pair';END IF;
 ca:=CASE WHEN i=-1 THEN (b->>'current')::integer ELSE (slots_i->>i)::integer END;cb:=(slots_i->>j)::integer;
 key_i:=CASE WHEN ca%13=cb%13 THEN 'samePairs' ELSE 'consecutivePairs' END;
 points_i:=CASE WHEN ca%13=cb%13 THEN (b#>>'{rules,samePoints}')::integer ELSE (b#>>'{rules,consecutivePoints}')::integer END+private.take_two_meter(b,at_ms);
 IF i>=0 THEN slots_i:=jsonb_set(slots_i,ARRAY[i::text],'null');ELSE b:=jsonb_set(b,'{current}','null');END IF;
 slots_i:=jsonb_set(slots_i,ARRAY[j::text],'null');
 b:=b||jsonb_build_object('slots',slots_i,'score',(b->>'score')::bigint+points_i,key_i,(b->>key_i)::integer+1,'meterAt',at_ms,
  'event',jsonb_build_object('label',CASE WHEN ca%13=cb%13 THEN 'Same value' ELSE 'Consecutive' END,'points',points_i));
 -- Finish before refill: the final pair must preserve the undrawn stock bonus.
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(slots_i)c WHERE c<>'null'::jsonb) THEN RETURN private.take_two_board_finish(b,at_ms,'full_clear');END IF;
 IF i=-1 AND cursor_i<52 THEN b:=b||jsonb_build_object('current',b->'deck'->cursor_i,'cursor',cursor_i+1);END IF;
 RETURN b;
END $$;

CREATE OR REPLACE FUNCTION private.take_two_visible(s jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT (s-ARRAY['deck','cursor'])||jsonb_build_object('stockRemaining',52-(s->>'cursor')::integer,
 'legalPairs',private.take_two_pairs(s),'exposed',(SELECT coalesce(jsonb_agg(i ORDER BY i),'[]'::jsonb) FROM generate_series(0,jsonb_array_length(s->'slots')-1)i WHERE s->'slots'->i<>'null'::jsonb AND private.take_two_exposed(s,i)),
 'activePlayerId',s->'players'->(s->>'turnIndex')::integer->>'id')
$$;

CREATE OR REPLACE FUNCTION private.take_two_high_score(actor uuid, version_i text) RETURNS bigint
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(max(score),0) FROM (
  SELECT score FROM private.arcade_results WHERE user_id=actor AND game='take-two' AND ruleset=version_i
  UNION ALL SELECT score FROM private.multiplayer_score_results WHERE user_id=actor AND game='take-two' AND ruleset=version_i
 ) scores
$$;
CREATE OR REPLACE FUNCTION private.take_two_high_score(actor uuid) RETURNS bigint
LANGUAGE sql STABLE SET search_path='' AS $$ SELECT private.take_two_high_score(actor,private.take_two_rules()->>'version') $$;
CREATE OR REPLACE FUNCTION private.take_two_deal(s jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE totals jsonb;
BEGIN
 SELECT jsonb_object_agg(p->>'id',coalesce(s->'scores'->(p->>'id'),'0'::jsonb)) INTO totals FROM jsonb_array_elements(s->'players') p;
 RETURN private.take_two_board_deal(s||jsonb_build_object('scores',totals,'highScore',private.take_two_high_score((s->'players'->(s->>'turnIndex')::integer->>'userId')::uuid,s#>>'{rules,version}'),'score',coalesce(totals->(s->'players'->(s->>'turnIndex')::integer->>'id'),'0'::jsonb)),at_ms);
END $function$
;
CREATE OR REPLACE FUNCTION public.arcade_take_two_step(p_actor uuid,p_run uuid,p_revision bigint DEFAULT NULL,p_round text DEFAULT NULL,
 p_request uuid DEFAULT NULL,p_action text DEFAULT NULL,p_items integer[] DEFAULT NULL,p_token uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE run private.arcade_runs;s jsonb;next_s jsonb;receipt private.arcade_command_receipts;fingerprint text;
 at_ms bigint;outcome text:='current';committed jsonb;
BEGIN
 IF p_actor IS NULL THEN
  IF p_action IS NOT NULL OR NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR run.game<>'take-two' OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action IS NOT NULL THEN
  IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_action NOT IN('pair','draw','take_score','abandon') THEN RAISE EXCEPTION 'arcade:invalid_command';END IF;
  fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_items)::text;
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.arcade_record(run),'projection',private.arcade_take_two_projection(run,at_ms));
  END IF;
 END IF;
 s:=run.state;
 IF run.status='active' THEN
  IF s IS NULL THEN
   s:=jsonb_build_object('runId',run.id,'userId',run.user_id,'config',run.config,'round',1,'roundId',run.id||':1','status','active','score',0,'results','[]'::jsonb,
    'board',private.take_two_board_deal(jsonb_build_object('rules',run.config,'highScore',private.take_two_high_score(run.user_id,run.ruleset),'score',0,'stage',1),floor(extract(epoch FROM run.created_at)*1000)::bigint));
  END IF;
  next_s:=private.arcade_take_two_advance(s,at_ms);
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
    s:=jsonb_set(s,'{board}',private.take_two_board_reduce(s->'board',p_action,p_items,at_ms));
    s:=s||jsonb_build_object('score',s#>'{board,score}');s:=private.arcade_take_two_finish_round(s);
   END IF;
   committed:=public.arcade_commit(p_actor,run.id,run.revision,s,(s#>>'{board,deadline}')::bigint,p_request,fingerprint,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;outcome:='committed';
  END IF;
 END IF;
 RETURN jsonb_build_object('outcome',outcome,'record',private.arcade_record(run),'projection',private.arcade_take_two_projection(run,at_ms));
END $$;
REVOKE ALL ON FUNCTION private.take_two_high_score(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO private.arcade_rulesets(id,game,config,enabled)
SELECT 'take-two/2','take-two',private.take_two_rules(),enabled FROM private.arcade_rulesets WHERE id='take-two/1'
ON CONFLICT(id) DO NOTHING;
UPDATE private.arcade_rulesets SET enabled=false WHERE id='take-two/1';
NOTIFY pgrst,'reload schema';
