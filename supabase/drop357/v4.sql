-- Partial carry-forward /4; prior versions remain frozen.
INSERT INTO private.arcade_rulesets(id,game,config,enabled)
 SELECT '357-drop/4',game,config||'{"version":"357-drop/4","board":"partial-carry","passes":3,"placements":12,"carryCounts":[0,1,2]}'::jsonb,false
 FROM private.arcade_rulesets WHERE id='357-drop/2' ON CONFLICT(id) DO NOTHING;
CREATE OR REPLACE FUNCTION private.drop357_v4_deal(s jsonb,at_ms bigint,round_i integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
BEGIN
 RETURN private.drop357_v2_deal(s,at_ms,round_i)||jsonb_build_object('carryChoices','[null,null]'::jsonb,
 'newCards','[[null,null,null],[null,null,null,null],[null,null,null,null,null]]'::jsonb,
 'lanes','[[null,null,null],[null,null,null,null,null],[null,null,null,null,null,null,null]]'::jsonb);
END $$;
CREATE OR REPLACE FUNCTION private.drop357_v4_action(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE lane_i integer;slot_i integer;i integer;row_i jsonb;carry_i jsonb;result_i jsonb;cards integer[];
 cursor_i integer:=(s->>'cursor')::integer;score_i bigint;draw boolean:=false;
BEGIN
 IF action='abandon' AND cardinality(items)=0 THEN RETURN s||'{"status":"abandoned","phase":"complete","current":null}'::jsonb;END IF;
 IF s->>'phase'<>'playing' OR s->>'status'<>'active' OR at_ms>=(s->>'deadline')::bigint THEN RAISE EXCEPTION 'arcade:not_playing';END IF;
 IF action='carry' AND items[1] BETWEEN 0 AND 1 THEN
  lane_i:=items[1];cards:=items[2:cardinality(items)];
  IF s->'laneResults'->lane_i='null'::jsonb OR s->'carryChoices'->lane_i IS DISTINCT FROM 'null'::jsonb
   OR cardinality(cards)<>lane_i+1 OR cardinality(cards)<>(SELECT count(DISTINCT c) FROM unnest(cards)c)
   OR EXISTS(SELECT FROM unnest(cards)c WHERE c<0 OR c>=(ARRAY[3,5])[lane_i+1] OR c IS NULL) THEN RAISE EXCEPTION 'arcade:invalid_carry';END IF;
  SELECT jsonb_agg(c ORDER BY c) INTO carry_i FROM unnest(cards)c;
  s:=jsonb_set(s,ARRAY['carryChoices',lane_i::text],carry_i);
 ELSIF action='pass' AND cardinality(items)=0 AND (s->>'passesLeft')::integer>0 AND (s->>'placements')::integer<12 THEN
  s:=s||jsonb_build_object('passesLeft',(s->>'passesLeft')::integer-1);draw:=true;
 ELSIF action='place' AND cardinality(items)=2 AND items[1] BETWEEN 0 AND 2 THEN
  lane_i:=items[1];slot_i:=items[2]-lane_i;
  IF slot_i<0 OR slot_i>=(ARRAY[3,4,5])[lane_i+1] OR s->'newCards'->lane_i->slot_i IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'arcade:column_locked';END IF;
  s:=jsonb_set(s,ARRAY['newCards',lane_i::text,slot_i::text],s->'current')||jsonb_build_object('placements',(s->>'placements')::integer+1);
  draw:=(s->>'placements')::integer<12;
  IF NOT draw THEN s:=s||'{"current":null}'::jsonb;END IF;
 ELSE RAISE EXCEPTION 'arcade:illegal_action';END IF;
 FOR i IN 0..2 LOOP
  row_i:=s->'newCards'->i;
  IF i>0 THEN
   IF s->'carryChoices'->(i-1)<>'null'::jsonb THEN
    SELECT jsonb_agg(s->'lanes'->(i-1)->(c::integer) ORDER BY ordinal) INTO carry_i
     FROM jsonb_array_elements_text(s->'carryChoices'->(i-1)) WITH ORDINALITY t(c,ordinal);
   ELSE carry_i:=CASE WHEN i=1 THEN '[null]'::jsonb ELSE '[null,null]'::jsonb END;END IF;
   row_i:=carry_i||row_i;
  END IF;
  s:=jsonb_set(s,ARRAY['lanes',i::text],row_i);
  IF s->'laneResults'->i='null'::jsonb AND NOT EXISTS(SELECT FROM jsonb_array_elements(row_i)x WHERE x='null'::jsonb) THEN
   result_i:=private.drop357_lane(ARRAY(SELECT value::integer FROM jsonb_array_elements_text(row_i)),(ARRAY[3,5,7])[i+1])||jsonb_build_object('completedAt',at_ms);
   s:=jsonb_set(s,ARRAY['laneResults',i::text],result_i);
  END IF;
 END LOOP;
 SELECT coalesce(sum((x->>'score')::bigint),0) INTO score_i FROM jsonb_array_elements(s->'laneResults')x;
 s:=s||jsonb_build_object('score',(s->>'banked')::bigint+score_i);
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(s->'laneResults')x WHERE x='null'::jsonb) THEN RETURN private.drop357_v2_bank(private.drop357_finish(s,at_ms,'filled'));END IF;
 IF draw THEN s:=s||jsonb_build_object('current',s->'deck'->cursor_i,'cursor',cursor_i+1);END IF;
 RETURN s;
END $$;
CREATE OR REPLACE FUNCTION private.drop357_v4_valid_board(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE i integer;row_i jsonb;carry_i jsonb;expected jsonb;trimmed jsonb:='[]';cards integer[];choices integer[];n integer;
BEGIN
 IF jsonb_array_length(s->'newCards') IS DISTINCT FROM 3 OR jsonb_array_length(s->'carryChoices') IS DISTINCT FROM 2 THEN RETURN false;END IF;
 FOR i IN 0..2 LOOP
  IF jsonb_array_length(s->'newCards'->i) IS DISTINCT FROM (ARRAY[3,4,5])[i+1] THEN RETURN false;END IF;
  row_i:=s->'newCards'->i;
  IF i>0 THEN
   IF s->'carryChoices'->(i-1)<>'null'::jsonb THEN
    choices:=ARRAY(SELECT value::integer FROM jsonb_array_elements_text(s->'carryChoices'->(i-1)));
    IF s->'laneResults'->(i-1)='null'::jsonb OR cardinality(choices)<>i OR cardinality(choices)<>(SELECT count(DISTINCT c) FROM unnest(choices)c)
     OR EXISTS(SELECT FROM unnest(choices)c WHERE c<0 OR c>=(ARRAY[3,5])[i] OR c IS NULL) THEN RETURN false;END IF;
    SELECT jsonb_agg(s->'lanes'->(i-1)->c ORDER BY ordinal) INTO carry_i FROM unnest(choices) WITH ORDINALITY t(c,ordinal);
   ELSE carry_i:=CASE WHEN i=1 THEN '[null]'::jsonb ELSE '[null,null]'::jsonb END;END IF;
   row_i:=carry_i||row_i;
  END IF;
  IF row_i IS DISTINCT FROM s->'lanes'->i THEN RETURN false;END IF;
  SELECT coalesce(jsonb_agg(x),'[]') INTO expected FROM jsonb_array_elements(row_i)x WHERE x<>'null'::jsonb;
  trimmed:=trimmed||jsonb_build_array(expected);
 END LOOP;
 SELECT array_agg(x::integer) INTO cards FROM jsonb_array_elements(s->'newCards')r CROSS JOIN LATERAL jsonb_array_elements_text(r)x WHERE x IS NOT NULL;
 n:=coalesce(cardinality(cards),0);
 IF n IS DISTINCT FROM (s->>'placements')::integer OR n<>(SELECT count(DISTINCT c) FROM unnest(cards)c)
  OR EXISTS(SELECT FROM unnest(cards)c WHERE c<0 OR c>51) OR s->>'passesLeft' IS NULL OR (s->>'passesLeft')::integer NOT BETWEEN 0 AND 3
  OR (s->>'cursor')::integer IS DISTINCT FROM n+3-(s->>'passesLeft')::integer+(CASE WHEN n=12 THEN 0 ELSE 1 END)
  OR (s#>>'{result,reason}'='filled' AND n<>12) THEN RETURN false;END IF;
 RETURN private.drop357_valid(s||jsonb_build_object('round',1,'lanes',trimmed));
END $$;

CREATE OR REPLACE FUNCTION private.drop357_v4_advance(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE due bigint;i integer;
BEGIN
 FOR i IN 1..12 LOOP
  EXIT WHEN s->>'status'<>'active';due:=(s->>'deadline')::bigint;EXIT WHEN at_ms<due;
  CASE s->>'phase'
   WHEN 'intro' THEN s:=s||jsonb_build_object('phase','playing','deadline',s->'playDeadline');
   WHEN 'playing' THEN s:=private.drop357_v2_bank(private.drop357_finish(s,due,'timeout'));
   WHEN 'stage_complete' THEN s:=private.drop357_v4_deal(s,due,(s->>'round')::integer+1);
   ELSE RAISE EXCEPTION 'arcade:invalid_phase';
  END CASE;
 END LOOP;
 RETURN s;
END $$;

CREATE OR REPLACE FUNCTION private.drop357_v4_valid(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE evidence jsonb;i integer:=0;total bigint:=0;
BEGIN

 IF s#>>'{config,version}' IS DISTINCT FROM '357-drop/4' OR s->>'round' IS DISTINCT FROM '3'
  OR s->>'phase' IS DISTINCT FROM 'stage_complete' OR jsonb_array_length(s->'rounds') IS DISTINCT FROM 3 THEN RETURN false;END IF;
 FOR evidence IN SELECT value FROM jsonb_array_elements(s->'rounds') LOOP
  i:=i+1;
  IF evidence->>'roundId' IS DISTINCT FROM (s->>'runId')||':'||i OR evidence->>'round' IS DISTINCT FROM i::text
   OR private.drop357_v4_valid_board(evidence) IS DISTINCT FROM true THEN RETURN false;END IF;
  total:=total+(evidence->>'score')::bigint;
 END LOOP;
 RETURN total=(s->>'score')::bigint AND total=(s->>'banked')::bigint AND total=(s#>>'{result,score}')::bigint
  AND (s->'rounds'->2->'lanes')=s->'lanes' AND (s->'rounds'->2->'laneResults')=s->'laneResults';
END $$;

-- Text overload also retains explicit access to the full-carry trial. Boolean true means active playtest.
CREATE OR REPLACE FUNCTION private.drop357_select_ruleset(version text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF version IS NULL OR version NOT IN('357-drop/2','357-drop/3','357-drop/4') THEN RAISE EXCEPTION '357:unknown_ruleset';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('357-drop:ruleset',0));
 IF NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id=version) THEN RAISE EXCEPTION '357:missing_ruleset';END IF;
 UPDATE private.arcade_rulesets SET enabled=(id=version) WHERE game='357-drop';
END $$;
CREATE OR REPLACE FUNCTION private.drop357_select_ruleset(playtest boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM private.drop357_select_ruleset(CASE WHEN playtest THEN '357-drop/4' ELSE '357-drop/2' END);END $$;
DO $$
DECLARE definition text;anchor text;
BEGIN
 definition:=pg_get_functiondef('private.drop357_deal_dispatch(jsonb,bigint,integer)'::regprocedure);
 IF position('private.drop357_v4_deal' IN definition)=0 THEN EXECUTE replace(definition,'BEGIN','BEGIN'||chr(10)||' IF s#>>''{config,version}''=''357-drop/4'' THEN RETURN private.drop357_v4_deal(s,at_ms,round_i);END IF;');END IF;
 definition:=pg_get_functiondef('private.drop357_valid_dispatch(jsonb)'::regprocedure);
 IF position('private.drop357_v4_valid' IN definition)=0 THEN EXECUTE replace(definition,'BEGIN','BEGIN'||chr(10)||' IF s#>>''{config,version}''=''357-drop/4'' THEN RETURN private.drop357_v4_valid(s);END IF;');END IF;
 definition:=pg_get_functiondef('public.arcade_drop357_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)'::regprocedure);
 IF position('private.drop357_v4_action' IN definition)=0 THEN
  anchor:='IF run.ruleset NOT IN(''357-drop/2'',''357-drop/3'')';
  IF position(anchor IN definition)=0 THEN RAISE EXCEPTION '357:step_owner_changed';END IF;
  definition:=replace(definition,anchor,'IF run.ruleset NOT IN(''357-drop/2'',''357-drop/3'',''357-drop/4'')');
  definition:=replace(definition,'p_action NOT IN(''place'',''pass'',''abandon'')','p_action NOT IN(''place'',''pass'',''abandon'',''carry'')');
  definition:=replace(definition,'s:=CASE WHEN run.ruleset=''357-drop/3'' THEN private.drop357_v3_advance','s:=CASE WHEN run.ruleset=''357-drop/4'' THEN private.drop357_v4_advance(s,at_ms) WHEN run.ruleset=''357-drop/3'' THEN private.drop357_v3_advance');
  definition:=replace(definition,'s:=CASE WHEN run.ruleset=''357-drop/3'' THEN private.drop357_v3_action','s:=CASE WHEN run.ruleset=''357-drop/4'' THEN private.drop357_v4_action(s,p_action,p_items,at_ms) WHEN run.ruleset=''357-drop/3'' THEN private.drop357_v3_action');
  definition:=replace(definition,'''current'',s->''current'',' ,'''carryChoices'',s->''carryChoices'',''current'',s->''current'',');
  EXECUTE definition;
 END IF;
END $$;
REVOKE ALL ON FUNCTION private.drop357_v4_deal(jsonb,bigint,integer),private.drop357_v4_action(jsonb,text,integer[],bigint),
 private.drop357_v4_advance(jsonb,bigint),private.drop357_v4_valid_board(jsonb),private.drop357_v4_valid(jsonb),private.drop357_select_ruleset(text),private.drop357_select_ruleset(boolean) FROM PUBLIC,anon,authenticated,service_role;
