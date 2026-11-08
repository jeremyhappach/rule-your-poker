-- /5 keeps /4's partial carries, with a frozen 500-point earned award.
INSERT INTO private.arcade_rulesets(id,game,config,enabled)
SELECT '357-drop/5',game,config||'{"version":"357-drop/5","allBonus":500,"allFilledMs":4000,"holdMs":9000}'::jsonb,false
FROM private.arcade_rulesets WHERE id='357-drop/4' ON CONFLICT(id) DO NOTHING;

DO $patch$
DECLARE f text;old text;next text;sig text;
BEGIN
 f:=pg_get_functiondef('private.drop357_finish(jsonb,bigint,text)'::regprocedure);
 old:='THEN 200 ELSE 0 END';next:='THEN coalesce((s#>>''{config,allBonus}'')::integer,200) ELSE 0 END';
 IF position(next IN f)=0 THEN
  IF position(old IN f)=0 THEN RAISE EXCEPTION 'polish:drop_finish_drift';END IF;
  EXECUTE replace(f,old,next);
 END IF;
 f:=pg_get_functiondef('private.drop357_valid(jsonb)'::regprocedure);
 old:='WHEN all_ok THEN 200 ELSE 0 END';next:='WHEN all_ok THEN coalesce((s#>>''{config,allBonus}'')::integer,200) ELSE 0 END';
 IF position(next IN f)=0 THEN
  IF position(old IN f)=0 THEN RAISE EXCEPTION 'polish:drop_valid_drift';END IF;
  f:=replace(f,old,next);
  f:=replace(f,'RETURN (r->>''base'')::integer=base','RETURN (r->>''allBonus'')::integer=(CASE WHEN all_ok THEN coalesce((s#>>''{config,allBonus}'')::integer,200) ELSE 0 END) AND (r->>''base'')::integer=base');
  EXECUTE f;
 END IF;
 f:=pg_get_functiondef('private.drop357_v2_bank(jsonb)'::regprocedure);
 old:='(r->>''completedAt'')::bigint+5000';next:='(r->>''completedAt'')::bigint+5000+CASE WHEN (r->>''allBonus'')::integer>0 THEN coalesce((s#>>''{config,allFilledMs}'')::integer,0) ELSE 0 END';
 IF position(next IN f)=0 THEN
  IF position(old IN f)=0 THEN RAISE EXCEPTION 'polish:drop_bank_drift';END IF;
  EXECUTE replace(f,old,next);
 END IF;
 -- Reuse the accepted partial-carry implementation, including its authority guards.
 FOREACH sig IN ARRAY ARRAY['private.drop357_deal_dispatch(jsonb,bigint,integer)','private.drop357_valid_dispatch(jsonb)','public.arcade_drop357_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)'] LOOP
  f:=pg_get_functiondef(sig::regprocedure);
  IF position('357-drop/5' IN f)=0 THEN
   IF position('357-drop/4' IN f)=0 THEN RAISE EXCEPTION 'polish:drop_dispatch_drift %',sig;END IF;
   f:=replace(f,'=''357-drop/4''',' IN (''357-drop/4'',''357-drop/5'')');
   f:=replace(f,'''357-drop/3'',''357-drop/4'')','''357-drop/3'',''357-drop/4'',''357-drop/5'')');
   IF sig LIKE 'public.%' THEN f:=replace(f,'''serverAt'',at_ms,','''serverAt'',at_ms,''allFilledMs'',run.config->''allFilledMs'',');END IF;
   EXECUTE f;
  END IF;
 END LOOP;
 f:=pg_get_functiondef('private.drop357_v4_valid(jsonb)'::regprocedure);
 IF position('357-drop/5' IN f)=0 THEN
  f:=replace(f,'s#>>''{config,version}'' IS DISTINCT FROM ''357-drop/4''','coalesce(s#>>''{config,version}'','''') NOT IN (''357-drop/4'',''357-drop/5'')');
  f:=replace(f,'private.drop357_v4_valid_board(evidence)','private.drop357_v4_valid_board(evidence||jsonb_build_object(''config'',s->''config''))');
  EXECUTE f;
 END IF;
 f:=pg_get_functiondef('private.drop357_select_ruleset(text)'::regprocedure);
 IF position('357-drop/5' IN f)=0 THEN EXECUTE replace(f,'''357-drop/3'',''357-drop/4'')','''357-drop/3'',''357-drop/4'',''357-drop/5'')');END IF;
END $patch$;
