-- Reversible carry-forward playtest; v1/v2 rules remain frozen.
INSERT INTO private.arcade_rulesets(id,game,config,enabled)
 SELECT '357-drop/3',game,config||'{"version":"357-drop/3","board":"carry-forward","passes":5,"placements":7}'::jsonb,false
 FROM private.arcade_rulesets WHERE id='357-drop/2' ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.drop357_v3_deal(s jsonb,at_ms bigint,round_i integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
BEGIN
 RETURN private.drop357_v2_deal(s,at_ms,round_i)||jsonb_build_object('passesLeft',5,
  'newCards','[[null,null,null],[null,null],[null,null]]'::jsonb,
  'lanes','[[null,null,null],[null,null,null,null,null],[null,null,null,null,null,null,null]]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION private.drop357_v3_action(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE lane_i integer;slot_i integer;offset_i integer;i integer;row_i jsonb;result_i jsonb;
 cursor_i integer:=(s->>'cursor')::integer;bank bigint:=(s->>'banked')::bigint;score_i bigint;
BEGIN
 IF action='abandon' AND cardinality(items)=0 THEN RETURN s||'{"status":"abandoned","phase":"complete","current":null}'::jsonb;END IF;
 IF s->>'phase'<>'playing' OR s->>'status'<>'active' OR at_ms>=(s->>'deadline')::bigint THEN RAISE EXCEPTION 'arcade:not_playing';END IF;
 IF action='pass' AND cardinality(items)=0 AND (s->>'passesLeft')::integer>0 THEN
  s:=s||jsonb_build_object('passesLeft',(s->>'passesLeft')::integer-1);
 ELSIF action='place' AND cardinality(items)=2 AND items[1] BETWEEN 0 AND 2 THEN
  lane_i:=items[1];offset_i:=(ARRAY[0,3,5])[lane_i+1];slot_i:=items[2]-offset_i;
  IF slot_i<0 OR slot_i>=(ARRAY[3,2,2])[lane_i+1] OR s->'newCards'->lane_i->slot_i IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'arcade:column_locked';END IF;
  s:=jsonb_set(s,ARRAY['newCards',lane_i::text,slot_i::text],s->'current')||jsonb_build_object('placements',(s->>'placements')::integer+1);
  FOR i IN 0..2 LOOP
   row_i:=s->'newCards'->i;
   IF i>0 THEN
    row_i:=CASE WHEN s->'laneResults'->(i-1)<>'null'::jsonb THEN s->'lanes'->(i-1)
     ELSE CASE WHEN i=1 THEN '[null,null,null]'::jsonb ELSE '[null,null,null,null,null]'::jsonb END END||row_i;
   END IF;
   s:=jsonb_set(s,ARRAY['lanes',i::text],row_i);
   IF s->'laneResults'->i='null'::jsonb AND NOT EXISTS(SELECT FROM jsonb_array_elements(row_i)x WHERE x='null'::jsonb) THEN
    result_i:=private.drop357_lane(ARRAY(SELECT value::integer FROM jsonb_array_elements_text(row_i)),(ARRAY[3,5,7])[i+1])||jsonb_build_object('completedAt',at_ms);
    s:=jsonb_set(s,ARRAY['laneResults',i::text],result_i);
   END IF;
  END LOOP;
  SELECT coalesce(sum((x->>'score')::bigint),0) INTO score_i FROM jsonb_array_elements(s->'laneResults')x;
  s:=s||jsonb_build_object('score',bank+score_i);
 ELSE RAISE EXCEPTION 'arcade:illegal_action';END IF;
 IF s->>'placements'='7' THEN RETURN private.drop357_v2_bank(private.drop357_finish(s,at_ms,'filled'));END IF;
 RETURN s||jsonb_build_object('current',s->'deck'->cursor_i,'cursor',cursor_i+1);
END $$;

CREATE OR REPLACE FUNCTION private.drop357_v3_valid_board(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE i integer;row_i jsonb;expected jsonb;trimmed jsonb:='[]';cards integer[];n integer;
BEGIN
 IF jsonb_array_length(s->'newCards') IS DISTINCT FROM 3 THEN RETURN false;END IF;
 FOR i IN 0..2 LOOP
  IF jsonb_array_length(s->'newCards'->i) IS DISTINCT FROM (ARRAY[3,2,2])[i+1] THEN RETURN false;END IF;
  row_i:=s->'newCards'->i;
  IF i>0 THEN row_i:=CASE WHEN s->'laneResults'->(i-1)<>'null'::jsonb THEN s->'lanes'->(i-1)
   ELSE CASE WHEN i=1 THEN '[null,null,null]'::jsonb ELSE '[null,null,null,null,null]'::jsonb END END||row_i;END IF;
  IF row_i IS DISTINCT FROM s->'lanes'->i THEN RETURN false;END IF;
  SELECT coalesce(jsonb_agg(x),'[]') INTO expected FROM jsonb_array_elements(row_i)x WHERE x<>'null'::jsonb;
  trimmed:=trimmed||jsonb_build_array(expected);
 END LOOP;
 SELECT array_agg(x::integer) INTO cards FROM jsonb_array_elements(s->'newCards')r CROSS JOIN LATERAL jsonb_array_elements_text(r)x WHERE x IS NOT NULL;
 n:=coalesce(cardinality(cards),0);
 IF n IS DISTINCT FROM (s->>'placements')::integer OR n<>(SELECT count(DISTINCT x) FROM unnest(cards)x)
  OR EXISTS(SELECT FROM unnest(cards)x WHERE x<0 OR x>51) OR (s->>'passesLeft')::integer NOT BETWEEN 0 AND 5
  OR (s->>'cursor')::integer<>n+5-(s->>'passesLeft')::integer+(CASE WHEN s#>>'{result,reason}'='filled' THEN 0 ELSE 1 END)
  OR (s#>>'{result,reason}'='filled' AND n<>7) THEN RETURN false;END IF;
 RETURN private.drop357_valid(s||jsonb_build_object('round',1,'lanes',trimmed));
END $$;

CREATE OR REPLACE FUNCTION private.drop357_select_ruleset(playtest boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- A single administrative switch; existing admissions keep their copied rules/config.
 PERFORM pg_advisory_xact_lock(hashtextextended('357-drop:ruleset',0));
 IF NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id=CASE WHEN playtest THEN '357-drop/3' ELSE '357-drop/2' END) THEN RAISE EXCEPTION '357:missing_ruleset';END IF;
 UPDATE private.arcade_rulesets SET enabled=(id=CASE WHEN playtest THEN '357-drop/3' ELSE '357-drop/2' END) WHERE game='357-drop';
END $$;

CREATE OR REPLACE FUNCTION private.drop357_v3_advance(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE due bigint;i integer;
BEGIN
 FOR i IN 1..12 LOOP
  EXIT WHEN s->>'status'<>'active';due:=(s->>'deadline')::bigint;EXIT WHEN at_ms<due;
  CASE s->>'phase'
   WHEN 'intro' THEN s:=s||jsonb_build_object('phase','playing','deadline',s->'playDeadline');
   WHEN 'playing' THEN s:=private.drop357_v2_bank(private.drop357_finish(s,due,'timeout'));
   WHEN 'stage_complete' THEN s:=private.drop357_v3_deal(s,due,(s->>'round')::integer+1);
   ELSE RAISE EXCEPTION 'arcade:invalid_phase';
  END CASE;
 END LOOP;
 RETURN s;
END $$;
CREATE OR REPLACE FUNCTION private.drop357_v3_valid(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE evidence jsonb;i integer:=0;total bigint:=0;
BEGIN

 IF s#>>'{config,version}' IS DISTINCT FROM '357-drop/3' OR s->>'round' IS DISTINCT FROM '3'
  OR s->>'phase' IS DISTINCT FROM 'stage_complete' OR jsonb_array_length(s->'rounds') IS DISTINCT FROM 3 THEN RETURN false;END IF;
 FOR evidence IN SELECT value FROM jsonb_array_elements(s->'rounds') LOOP
  i:=i+1;
  IF evidence->>'roundId' IS DISTINCT FROM (s->>'runId')||':'||i OR evidence->>'round' IS DISTINCT FROM i::text
   OR private.drop357_v3_valid_board(evidence) IS DISTINCT FROM true THEN RETURN false;END IF;
  total:=total+(evidence->>'score')::bigint;
 END LOOP;
 RETURN total=(s->>'score')::bigint AND total=(s->>'banked')::bigint AND total=(s#>>'{result,score}')::bigint
  AND (s->'rounds'->2->'lanes')=s->'lanes' AND (s->'rounds'->2->'laneResults')=s->'laneResults';
END $$;

CREATE OR REPLACE FUNCTION private.drop357_deal_dispatch(s jsonb,at_ms bigint,round_i integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
BEGIN
 RETURN CASE WHEN s#>>'{config,version}'='357-drop/3' THEN private.drop357_v3_deal(s,at_ms,round_i) ELSE private.drop357_v2_deal(s,at_ms,round_i) END;
END $$;

DO $$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('private.drop357_valid_dispatch(jsonb)'::regprocedure);
 IF position('private.drop357_v3_valid(s)' IN definition)=0 THEN
  EXECUTE replace(definition,'BEGIN','BEGIN'||chr(10)||' IF s#>>''{config,version}''=''357-drop/3'' THEN RETURN private.drop357_v3_valid(s);END IF;');
 END IF;
 definition:=pg_get_functiondef('public.arcade_drop357_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)'::regprocedure);
 IF position('drop357_v3_action' IN definition)=0 THEN
  IF position('IF run.ruleset<>''357-drop/2''' IN definition)=0 THEN RAISE EXCEPTION '357:step_owner_changed';END IF;
  definition:=replace(definition,'IF run.ruleset<>''357-drop/2''','IF run.ruleset NOT IN(''357-drop/2'',''357-drop/3'')');
  definition:=replace(definition,'private.drop357_v2_deal(jsonb_build_object','private.drop357_deal_dispatch(jsonb_build_object');
  definition:=replace(definition,'s:=private.drop357_v2_advance(s,at_ms);','s:=CASE WHEN run.ruleset=''357-drop/3'' THEN private.drop357_v3_advance(s,at_ms) ELSE private.drop357_v2_advance(s,at_ms) END;');
  definition:=replace(definition,'s:=private.drop357_v2_action(s,p_action,p_items,at_ms);','s:=CASE WHEN run.ruleset=''357-drop/3'' THEN private.drop357_v3_action(s,p_action,p_items,at_ms) ELSE private.drop357_v2_action(s,p_action,p_items,at_ms) END;');
  definition:=replace(definition,'''round'',s->''round'',' ,'''acceptedRequestId'',(SELECT request_id FROM private.arcade_command_receipts WHERE run_id=run.id AND revision=run.revision LIMIT 1),''round'',s->''round'',');
  EXECUTE definition;
 END IF;
END $$;
REVOKE ALL ON FUNCTION private.drop357_v3_deal(jsonb,bigint,integer),private.drop357_v3_action(jsonb,text,integer[],bigint),
 private.drop357_v3_advance(jsonb,bigint),private.drop357_v3_valid_board(jsonb),private.drop357_v3_valid(jsonb),
 private.drop357_deal_dispatch(jsonb,bigint,integer),private.drop357_select_ruleset(boolean) FROM PUBLIC,anon,authenticated,service_role;
