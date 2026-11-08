-- Versioned ranked offers. The two-argument scorer remains the frozen /1-/3 owner.
CREATE OR REPLACE FUNCTION private.horses_blitz_set(dice jsonb,roll integer,cfg jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE wild integer;rank_i integer;n integer;size_i integer;best_size integer:=0;best_rank integer:=0;
 natural_i boolean:=false;base_i integer;points integer;matrix jsonb:=cfg->'matrix';
BEGIN
 IF cfg->>'version'<>'horses-blitz/4' THEN RETURN private.horses_blitz_set(dice,roll);END IF;
 -- Validate all faces and the roll through the retained boundary.
 PERFORM private.horses_blitz_set(dice,roll);
 SELECT count(*) INTO wild FROM jsonb_array_elements(dice)d WHERE d='1'::jsonb;
 IF wild=5 THEN best_size:=5;best_rank:=1;natural_i:=true;base_i:=2600;
 ELSE
  FOR rank_i IN 2..6 LOOP
   SELECT count(*) INTO n FROM jsonb_array_elements(dice)d WHERE d=to_jsonb(rank_i);
   size_i:=n+wild;
   IF size_i>best_size OR size_i=best_size AND rank_i>best_rank THEN
    best_size:=size_i;best_rank:=rank_i;natural_i:=size_i>=2 AND wild=0;
   END IF;
  END LOOP;
  -- A one outside the chosen meld cannot remove natural status. With a usable
  -- wild, adding it always produces the higher-priority larger meld.
  base_i:=(matrix->(greatest(1,best_size)-1)->>(best_rank-2))::integer;
 END IF;
 points:=round(base_i*(CASE roll WHEN 1 THEN 1.30 WHEN 2 THEN 1.10 ELSE 1.00 END)*(CASE WHEN natural_i THEN 1.20 ELSE 1 END));
 RETURN jsonb_build_object('size',best_size,'rank',best_rank,'natural',natural_i,'base',base_i,'points',points,
  'label',CASE best_size WHEN 1 THEN 'High card' WHEN 2 THEN 'Pair of '||best_rank||'s' WHEN 3 THEN 'Three '||best_rank||'s' WHEN 4 THEN 'Four '||best_rank||'s' WHEN 5 THEN 'Five '||best_rank||'s' END);
END $$;
REVOKE ALL ON FUNCTION private.horses_blitz_set(jsonb,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- horses-blitz/1: one immutable, mode-neutral rules owner. Solo orchestration below.
CREATE OR REPLACE FUNCTION private.horses_blitz_rules() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT '{"version":"horses-blitz/1","rounds":3,"hands":10,"durationMs":100000,"timePerSecond":50,"bankMs":450,"ladder":[[390,225,90],[600,400,250],[1400,1000,650]]}'::jsonb $$;

CREATE OR REPLACE FUNCTION private.horses_blitz_rules(version text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF version='horses-blitz/1' THEN RETURN private.horses_blitz_rules();END IF;
 IF version='horses-blitz/2' THEN RETURN private.horses_blitz_rules()||'{"version":"horses-blitz/2","manualOpening":true}'::jsonb;END IF;
 IF version='horses-blitz/3' THEN RETURN private.horses_blitz_rules()||'{"version":"horses-blitz/3","manualOpening":true,"manualFinalBank":true}'::jsonb;END IF;
 IF version='horses-blitz/4' THEN RETURN (private.horses_blitz_rules()-'ladder')||'{"version":"horses-blitz/4","manualOpening":true,"manualFinalBank":true,"durationMs":180000,"matrix":[[25,25,25,25,25],[35,43,52,63,76],[135,165,200,245,300],[380,460,560,680,820],[1000,1210,1460,1760,2120]]}'::jsonb;END IF;
 RAISE EXCEPTION 'horses_blitz:rules';
END$$;

CREATE OR REPLACE FUNCTION private.horses_blitz_set(dice jsonb,roll integer) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE wild integer; matching integer; size_i integer; points integer:=0;
BEGIN
 IF jsonb_typeof(dice) IS DISTINCT FROM 'array' OR jsonb_array_length(dice)<>5 OR roll IS NULL OR roll NOT BETWEEN 1 AND 3
 OR EXISTS(SELECT FROM jsonb_array_elements(dice) d WHERE jsonb_typeof(d)<>'number' OR d::text !~ '^[1-6]$') THEN RAISE EXCEPTION 'horses_blitz:dice';END IF;
 SELECT count(*) FILTER(WHERE d='1'::jsonb) INTO wild FROM jsonb_array_elements(dice)d;
 SELECT coalesce(max(n),0) INTO matching FROM (SELECT count(*) n FROM jsonb_array_elements(dice)d WHERE d<>'1'::jsonb GROUP BY d)t;
 size_i:=wild+matching;
 IF size_i>=3 THEN points:=(private.horses_blitz_rules()->'ladder'->(size_i-3)->>(roll-1))::integer;END IF;
 RETURN jsonb_build_object('size',size_i,'points',points,'label',CASE size_i WHEN 3 THEN 'Three of a kind' WHEN 4 THEN 'Four of a kind' WHEN 5 THEN 'Five of a kind' ELSE 'No scoring set' END);
END $$;

CREATE OR REPLACE FUNCTION private.horses_blitz_roll(dice jsonb,held integer[]) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE result jsonb:='[]';i integer;n integer;
BEGIN
 IF held IS NULL OR cardinality(held)>5 OR array_position(held,NULL) IS NOT NULL OR EXISTS(SELECT FROM unnest(held) h WHERE h<0 OR h>4)
 OR cardinality(held)<>(SELECT count(DISTINCT h) FROM unnest(held)h) THEN RAISE EXCEPTION 'horses_blitz:holds';END IF;
 FOR i IN 0..4 LOOP
  IF i=ANY(held) THEN n:=(dice->>i)::integer;
  ELSE LOOP n:=get_byte(extensions.gen_random_bytes(1),0);EXIT WHEN n<252;END LOOP;n:=1+n%6;END IF;
  result:=result||jsonb_build_array(n);
 END LOOP;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION private.horses_blitz_round(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r integer:=coalesce((s->>'round')::integer,0)+1;manual boolean:=coalesce((s#>>'{config,manualOpening}')::boolean,false);dice jsonb;
BEGIN
 dice:=CASE WHEN manual THEN '[]'::jsonb ELSE private.horses_blitz_roll('[]','{}') END;
 RETURN s||jsonb_build_object('round',r,'roundId',(s->>'runId')||':'||r,'hand',1,'handId',(s->>'runId')||':'||r||':1',
 'roll',CASE WHEN manual THEN 0 ELSE 1 END,'dice',dice,'held','[]'::jsonb,'set',CASE WHEN manual THEN '{"size":0,"points":0,"label":""}'::jsonb ELSE private.horses_blitz_set(dice,1,s->'config') END,'base',0,'hands','[]'::jsonb,'phase','playing',
 'startedAt',at_ms,'deadline',at_ms+(s#>>'{config,durationMs}')::bigint,'phaseUntil',NULL,'result',NULL,'bank',NULL);
END $$;

CREATE OR REPLACE FUNCTION private.horses_blitz_finish(s jsonb,at_ms bigint,reason text) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE bonus integer:=0;result jsonb;hands jsonb:=s->'hands';i integer;
BEGIN
 IF s->>'phase'='summary' OR s->>'status'<>'active' THEN RETURN s;END IF;
 IF reason='complete' THEN
  IF jsonb_array_length(hands)<>10 THEN RAISE EXCEPTION 'horses_blitz:incomplete';END IF;
  bonus:=least((s#>>'{config,durationMs}')::bigint/1000,greatest(0,((s->>'deadline')::bigint-at_ms)/1000))*50;
 ELSIF reason='timeout' THEN
  FOR i IN jsonb_array_length(hands)+1..10 LOOP hands:=hands||jsonb_build_array(jsonb_build_object('hand',i,'points',0,'forfeit',true));END LOOP;
 ELSE RAISE EXCEPTION 'horses_blitz:finish_reason';END IF;
 result:=jsonb_build_object('id',s->>'roundId','round',s->'round','base',s->'base','timerBonus',bonus,
 'total',(s->>'base')::integer+bonus,'startedAt',s->'startedAt','deadline',s->'deadline','completedAt',at_ms,'reason',reason,'hands',hands);
 RETURN s||jsonb_build_object('phase','summary','phaseUntil',NULL,'deadline',NULL,'hands',hands,'result',result,
 'score',(s->>'score')::integer+bonus,'results',(s->'results')||jsonb_build_array(result),
 'status',CASE WHEN s->>'round'='3' THEN 'completed' ELSE 'active' END);
END $$;

CREATE OR REPLACE FUNCTION private.horses_blitz_bank(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE points integer:=(s#>>'{set,points}')::integer;bank jsonb;
BEGIN
 bank:=jsonb_build_object('hand',s->'hand','dice',s->'dice','roll',s->'roll','points',points,'at',at_ms,'forfeit',false);
 RETURN s||jsonb_build_object('base',(s->>'base')::integer+points,'score',(s->>'score')::integer+points,
 'hands',(s->'hands')||jsonb_build_array(bank),'bank',bank,'phase','banking','phaseUntil',at_ms+450);
END $$;

CREATE OR REPLACE FUNCTION private.horses_blitz_advance(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE dice jsonb;boundary bigint;hand_i integer;manual boolean:=coalesce((s#>>'{config,manualOpening}')::boolean,false);
BEGIN
 IF s->>'status'<>'active' OR s->>'phase'='summary' THEN RETURN s;END IF;
 -- The tenth committed bank ends scoring immediately; its 450 ms beat is presentation only.
 IF s->>'phase'='banking' AND s->>'hand'='10' AND at_ms>=(s->>'phaseUntil')::bigint THEN
  RETURN private.horses_blitz_finish(s,(s#>>'{bank,at}')::bigint,'complete');END IF;
 IF at_ms>=(s->>'deadline')::bigint THEN
  IF s->>'phase'='banking' AND s->>'hand'='10' THEN RETURN s;END IF;
  RETURN private.horses_blitz_finish(s,(s->>'deadline')::bigint,'timeout');END IF;
 IF s->>'phase'='banking' AND at_ms>=(s->>'phaseUntil')::bigint THEN
  boundary:=(s->>'phaseUntil')::bigint;hand_i:=(s->>'hand')::integer+1;dice:=CASE WHEN manual THEN '[]'::jsonb ELSE private.horses_blitz_roll('[]','{}') END;
  s:=s||jsonb_build_object('hand',hand_i,'handId',(s->>'roundId')||':'||hand_i,'roll',CASE WHEN manual THEN 0 ELSE 1 END,'dice',dice,'held','[]'::jsonb,
   'set',CASE WHEN manual THEN '{"size":0,"points":0,"label":""}'::jsonb ELSE private.horses_blitz_set(dice,1,s->'config') END,'phase','playing','phaseUntil',NULL,'bank',NULL);
 END IF;
 RETURN s;
END $$;

CREATE OR REPLACE FUNCTION private.horses_blitz_action(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE dice jsonb;roll_i integer;
BEGIN
 IF s->'config' IS DISTINCT FROM private.horses_blitz_rules(s#>>'{config,version}') THEN RAISE EXCEPTION 'horses_blitz:rules';END IF;
 IF action='abandon' AND cardinality(items)=0 THEN RETURN s||jsonb_build_object('status','abandoned');END IF;
 IF action='next_round' AND s->>'phase'='summary' AND (s->>'round')::integer<3 AND cardinality(items)=0 THEN RETURN private.horses_blitz_round(s,at_ms);END IF;
 IF s->>'phase'<>'playing' OR at_ms>=(s->>'deadline')::bigint THEN RAISE EXCEPTION 'horses_blitz:phase';END IF;
 IF action='bank' AND cardinality(items)=0 AND ((s->>'roll')::integer<3 AND (s#>>'{set,points}')::integer>0 OR s#>>'{config,manualFinalBank}'='true' AND s->>'roll'='3') THEN RETURN private.horses_blitz_bank(s,at_ms);END IF;
 IF action='roll' AND (s->>'roll')::integer<3 THEN
  IF s->>'roll'='0' AND cardinality(items)<>0 THEN RAISE EXCEPTION 'horses_blitz:holds';END IF;
  dice:=private.horses_blitz_roll(s->'dice',items);roll_i:=(s->>'roll')::integer+1;
  s:=s||jsonb_build_object('dice',dice,'held',to_jsonb(items),'roll',roll_i,'set',private.horses_blitz_set(dice,roll_i,s->'config'));
  IF roll_i=3 AND coalesce(s#>>'{config,manualFinalBank}','false')<>'true' THEN s:=private.horses_blitz_bank(s,at_ms);END IF;RETURN s;
 END IF;
 RAISE EXCEPTION 'horses_blitz:illegal_action';
END $$;

CREATE OR REPLACE FUNCTION private.horses_blitz_valid(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE r jsonb;h jsonb;n integer:=0;hi integer;base_i integer;total integer:=0;
BEGIN
 IF s->'config' IS DISTINCT FROM private.horses_blitz_rules(s#>>'{config,version}') OR s->>'phase' IS DISTINCT FROM 'summary' OR s->>'round' IS DISTINCT FROM '3'
 OR jsonb_array_length(s->'results') IS DISTINCT FROM 3 THEN RETURN false;END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(s->'results') LOOP
  n:=n+1;hi:=0;base_i:=0;
  IF r->>'id' IS DISTINCT FROM (s->>'runId')||':'||n OR (r->>'round')::integer IS DISTINCT FROM n OR jsonb_array_length(r->'hands') IS DISTINCT FROM 10 THEN RETURN false;END IF;
  FOR h IN SELECT value FROM jsonb_array_elements(r->'hands') LOOP
   hi:=hi+1;
   IF (h->>'hand')::integer IS DISTINCT FROM hi OR (h->>'points')::integer IS DISTINCT FROM (CASE WHEN (h->>'forfeit')::boolean THEN 0 ELSE (private.horses_blitz_set(h->'dice',(h->>'roll')::integer,s->'config')->>'points')::integer END) THEN RETURN false;END IF;
   base_i:=base_i+(h->>'points')::integer;
  END LOOP;
  IF base_i IS DISTINCT FROM (r->>'base')::integer OR (r->>'timerBonus')::integer NOT BETWEEN 0 AND (s#>>'{config,durationMs}')::bigint/1000*50
   OR (r->>'timerBonus')::integer IS DISTINCT FROM (CASE WHEN r->>'reason'='timeout' THEN 0 ELSE least((s#>>'{config,durationMs}')::bigint/1000,greatest(0,((r->>'deadline')::bigint-(r->>'completedAt')::bigint)/1000))*50 END)
   OR (r->>'deadline')::bigint-(r->>'startedAt')::bigint<>(s#>>'{config,durationMs}')::bigint
   OR (r->>'total')::integer IS DISTINCT FROM base_i+(r->>'timerBonus')::integer THEN RETURN false;END IF;
  total:=total+(r->>'total')::integer;
 END LOOP;
 RETURN total=(s->>'score')::integer;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

-- Solo lifecycle, shared Arcade persistence. No financial/session owners.
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('horses-blitz/1','horses-blitz',private.horses_blitz_rules(),false) ON CONFLICT(id) DO NOTHING;
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('horses-blitz/2','horses-blitz',private.horses_blitz_rules('horses-blitz/2'),false) ON CONFLICT(id) DO NOTHING;
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('horses-blitz/3','horses-blitz',private.horses_blitz_rules('horses-blitz/3'),false) ON CONFLICT(id) DO NOTHING;
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
 projection:=jsonb_build_object('id',run.id,'revision',run.revision,'status',run.status,'ruleset',run.ruleset,'serverAt',at_ms,'durationMs',run.config->'durationMs',
  'roundId',s->'roundId','round',s->'round','handId',s->'handId','hand',s->'hand','score',run.score,'phase',s->'phase',
  'roll',s->'roll','dice',s->'dice','held',s->'held','set',s->'set','base',s->'base','bank',s->'bank','dueAt',run.due_at,
  'startedAt',s->'startedAt','deadline',s->'deadline','phaseUntil',s->'phaseUntil','result',s->'result','completion',(SELECT record FROM private.arcade_results WHERE run_id=run.id));
 RETURN jsonb_build_object('outcome',outcome,'record',jsonb_build_object('id',run.id,'game',run.game,'revision',run.revision,'status',run.status),'projection',projection);
END $$;
REVOKE ALL ON FUNCTION public.arcade_horses_blitz_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_horses_blitz_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) TO service_role;
DO $$ DECLARE p record;BEGIN FOR p IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname LIKE 'horses_blitz_%' LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||p.sig||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;END $$;

INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('horses-blitz/4','horses-blitz',private.horses_blitz_rules('horses-blitz/4'),false) ON CONFLICT(id) DO NOTHING;

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
