-- Coordinated release: install frozen scoring versions with admission CLOSED.
-- Existing registry rows, pinned runs, results and command receipts are untouched.
CREATE OR REPLACE FUNCTION private.drop357_v6_rules() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT '{"bases":{"flush":1200,"quads":2250,"trips":550,"twoPair":200,"fiveKind":4500,"straight":850,"fullHouse":1600,"royalFlush":3700,"straightFlush":2900},"board":"partial-carry","lanes":[3,5,7],"holdMs":9000,"passes":3,"rounds":3,"introMs":2500,"version":"357-drop/6","allBonus":500,"durationMs":120000,"placements":12,"allFilledMs":4000,"carryCounts":[0,1,2],"timePercent":20,"naturalPercent":20,"threeRow":{"ranks":[2,4,5,6,7,8,9,10,11,12,13,15],"pair":[80,100,120,145,175,210,250,300,360,430,510,620],"trips":[800,880,970,1070,1170,1290,1420,1560,1720,1880,2050,2240],"kickerMultiplier":2}}'::jsonb $$;
CREATE OR REPLACE FUNCTION private.drop357_lane(cards integer[],lane integer,cfg jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result jsonb;v integer[];base integer:=0;bonus integer:=0;ix integer;
BEGIN
 result:=private.drop357_lane(cards,lane);
 IF lane<>3 OR cfg->>'version' IS DISTINCT FROM '357-drop/6' THEN RETURN result;END IF;
 IF cfg IS DISTINCT FROM private.drop357_v6_rules() THEN RAISE EXCEPTION '357:rules';END IF;
 v:=ARRAY(SELECT value::integer FROM jsonb_array_elements_text(result->'vector'));
 ix:=array_position(ARRAY[2,4,5,6,7,8,9,10,11,12,13,15],v[2])-1;
 IF v[1]=3 THEN base:=(cfg#>'{threeRow,trips}'->>ix)::integer;
 ELSIF v[1]=1 THEN base:=(cfg#>'{threeRow,pair}'->>ix)::integer+2*v[3];END IF;
 bonus:=CASE WHEN (result->>'natural')::boolean THEN round(base*0.20)::integer ELSE 0 END;
 RETURN result||jsonb_build_object('points',base,'bonus',bonus,'score',base+bonus);
END $$;
REVOKE ALL ON FUNCTION private.drop357_v6_rules(),private.drop357_lane(integer[],integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.horses_blitz_rules(text)'::regprocedure)) NOT IN ('efe5608423d284dc82e2ed5ee67bbcc6','3f5bfaec4226a5731a0a34892c5a0759') THEN RAISE EXCEPTION 'coordinated:authority_drift private.horses_blitz_rules(text)';END IF;END $guard$;
CREATE OR REPLACE FUNCTION private.horses_blitz_rules(version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
BEGIN
 IF version='horses-blitz/1' THEN RETURN private.horses_blitz_rules();END IF;
 IF version='horses-blitz/2' THEN RETURN private.horses_blitz_rules()||'{"version":"horses-blitz/2","manualOpening":true}'::jsonb;END IF;
 IF version='horses-blitz/3' THEN RETURN private.horses_blitz_rules()||'{"version":"horses-blitz/3","manualOpening":true,"manualFinalBank":true}'::jsonb;END IF;
 IF version='horses-blitz/4' THEN RETURN (private.horses_blitz_rules()-'ladder')||'{"version":"horses-blitz/4","manualOpening":true,"manualFinalBank":true,"durationMs":180000,"matrix":[[25,25,25,25,25],[35,43,52,63,76],[135,165,200,245,300],[380,460,560,680,820],[1000,1210,1460,1760,2120]]}'::jsonb;END IF;
 IF version='horses-blitz/5' THEN RETURN private.horses_blitz_rules('horses-blitz/4')||'{"version":"horses-blitz/5","matrix":[[25,25,25,25,25],[35,43,52,63,76],[506,538,562,563,566],[605,662,666,668,669],[803,855,865,868,880]],"earlyPercent":[125,110,100],"naturalPercent":120,"fiveOnesBase":1600,"timePerSecond":15}'::jsonb;END IF;
 RAISE EXCEPTION 'horses_blitz:rules';
END$function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.horses_blitz_set(jsonb,integer,jsonb)'::regprocedure)) NOT IN ('a19feceeb868dcdf14ba54f313156841','026c78d73f66a3653b34152a3ea88f3a') THEN RAISE EXCEPTION 'coordinated:authority_drift private.horses_blitz_set(jsonb,integer,jsonb)';END IF;END $guard$;
CREATE OR REPLACE FUNCTION private.horses_blitz_set(dice jsonb, roll integer, cfg jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE wild integer;rank_i integer;n integer;size_i integer;best_size integer:=0;best_rank integer:=0;
 natural_i boolean:=false;base_i integer;points integer;matrix jsonb:=cfg->'matrix';
BEGIN
 IF cfg->>'version' NOT IN ('horses-blitz/4','horses-blitz/5') THEN RETURN private.horses_blitz_set(dice,roll);END IF;
 -- Validate all faces and the roll through the retained boundary.
 PERFORM private.horses_blitz_set(dice,roll);
 SELECT count(*) INTO wild FROM jsonb_array_elements(dice)d WHERE d='1'::jsonb;
 IF wild=5 THEN best_size:=5;best_rank:=1;natural_i:=true;base_i:=CASE WHEN cfg->>'version'='horses-blitz/5' THEN 1600 ELSE 2600 END;
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
 points:=round(base_i*(CASE roll WHEN 1 THEN CASE WHEN cfg->>'version'='horses-blitz/5' THEN 1.25 ELSE 1.30 END WHEN 2 THEN 1.10 ELSE 1.00 END)*(CASE WHEN natural_i THEN 1.20 ELSE 1 END));
 RETURN jsonb_build_object('size',best_size,'rank',best_rank,'natural',natural_i,'base',base_i,'points',points,
  'label',CASE best_size WHEN 1 THEN 'High card' WHEN 2 THEN 'Pair of '||best_rank||'s' WHEN 3 THEN 'Three '||best_rank||'s' WHEN 4 THEN 'Four '||best_rank||'s' WHEN 5 THEN 'Five '||best_rank||'s' END);
END $function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.horses_blitz_finish(jsonb,bigint,text)'::regprocedure)) NOT IN ('c189376bb2befaaebf3304d1b95b68cd','ba8d987902a64ffb437b6aa9ac404293') THEN RAISE EXCEPTION 'coordinated:authority_drift private.horses_blitz_finish(jsonb,bigint,text)';END IF;END $guard$;
CREATE OR REPLACE FUNCTION private.horses_blitz_finish(s jsonb, at_ms bigint, reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE bonus integer:=0;result jsonb;hands jsonb:=s->'hands';i integer;
BEGIN
 IF s->>'phase'='summary' OR s->>'status'<>'active' THEN RETURN s;END IF;
 IF reason='complete' THEN
  IF jsonb_array_length(hands)<>10 THEN RAISE EXCEPTION 'horses_blitz:incomplete';END IF;
  bonus:=least((s#>>'{config,durationMs}')::bigint/1000,greatest(0,((s->>'deadline')::bigint-at_ms)/1000))*(CASE WHEN s#>>'{config,version}'='horses-blitz/5' THEN 15 ELSE 50 END);
 ELSIF reason='timeout' THEN
  FOR i IN jsonb_array_length(hands)+1..10 LOOP hands:=hands||jsonb_build_array(jsonb_build_object('hand',i,'points',0,'forfeit',true));END LOOP;
 ELSE RAISE EXCEPTION 'horses_blitz:finish_reason';END IF;
 result:=jsonb_build_object('id',s->>'roundId','round',s->'round','base',s->'base','timerBonus',bonus,
 'total',(s->>'base')::integer+bonus,'startedAt',s->'startedAt','deadline',s->'deadline','completedAt',at_ms,'reason',reason,'hands',hands);
 RETURN s||jsonb_build_object('phase','summary','phaseUntil',NULL,'deadline',NULL,'hands',hands,'result',result,
 'score',(s->>'score')::integer+bonus,'results',(s->'results')||jsonb_build_array(result),
 'status',CASE WHEN s->>'round'='3' THEN 'completed' ELSE 'active' END);
END $function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.horses_blitz_valid(jsonb)'::regprocedure)) NOT IN ('94d98f237c4203c553eafe4d8bfcd435','df5e45f66bf258c7a85f9a942b3f867a') THEN RAISE EXCEPTION 'coordinated:authority_drift private.horses_blitz_valid(jsonb)';END IF;END $guard$;
CREATE OR REPLACE FUNCTION private.horses_blitz_valid(s jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
  IF base_i IS DISTINCT FROM (r->>'base')::integer OR (r->>'timerBonus')::integer NOT BETWEEN 0 AND (s#>>'{config,durationMs}')::bigint/1000*(CASE WHEN s#>>'{config,version}'='horses-blitz/5' THEN 15 ELSE 50 END)
   OR (r->>'timerBonus')::integer IS DISTINCT FROM (CASE WHEN r->>'reason'='timeout' THEN 0 ELSE least((s#>>'{config,durationMs}')::bigint/1000,greatest(0,((r->>'deadline')::bigint-(r->>'completedAt')::bigint)/1000))*(CASE WHEN s#>>'{config,version}'='horses-blitz/5' THEN 15 ELSE 50 END) END)
   OR (r->>'deadline')::bigint-(r->>'startedAt')::bigint<>(s#>>'{config,durationMs}')::bigint
   OR (r->>'total')::integer IS DISTINCT FROM base_i+(r->>'timerBonus')::integer THEN RETURN false;END IF;
  total:=total+(r->>'total')::integer;
 END LOOP;
 RETURN total=(s->>'score')::integer;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.drop357_v4_action(jsonb,text,integer[],bigint)'::regprocedure)) NOT IN ('5a3fdb9bdff8667eb7ecdda42ee349e2','d097e3415848838eb92077ae5b7a9058') THEN RAISE EXCEPTION 'coordinated:authority_drift private.drop357_v4_action(jsonb,text,integer[],bigint)';END IF;END $guard$;
CREATE OR REPLACE FUNCTION private.drop357_v4_action(s jsonb, action text, items integer[], at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
   result_i:=private.drop357_lane(ARRAY(SELECT value::integer FROM jsonb_array_elements_text(row_i)),(ARRAY[3,5,7])[i+1],s->'config')||jsonb_build_object('completedAt',at_ms);
   s:=jsonb_set(s,ARRAY['laneResults',i::text],result_i);
  END IF;
 END LOOP;
 SELECT coalesce(sum((x->>'score')::bigint),0) INTO score_i FROM jsonb_array_elements(s->'laneResults')x;
 s:=s||jsonb_build_object('score',(s->>'banked')::bigint+score_i);
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(s->'laneResults')x WHERE x='null'::jsonb) THEN RETURN private.drop357_v2_bank(private.drop357_finish(s,at_ms,'filled'));END IF;
 IF draw THEN s:=s||jsonb_build_object('current',s->'deck'->cursor_i,'cursor',cursor_i+1);END IF;
 RETURN s;
END $function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.drop357_valid(jsonb)'::regprocedure)) NOT IN ('22adf153272a52728484a1485408a4da','71dd9f216a0b1ba7608b35a981faa3ec') THEN RAISE EXCEPTION 'coordinated:authority_drift private.drop357_valid(jsonb)';END IF;END $guard$;
CREATE OR REPLACE FUNCTION private.drop357_valid(s jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE i integer; cards integer[]; expected jsonb; base integer:=0; all_ok boolean:=true; r jsonb:=s->'result'; bonus integer;
BEGIN
 IF s->>'phase' IS DISTINCT FROM 'complete' OR s->>'round' IS DISTINCT FROM '1' OR r->>'reason' NOT IN('filled','timeout') OR r IS NULL THEN RETURN false; END IF;
 FOR i IN 0..2 LOOP
  cards:=ARRAY(SELECT value::integer FROM jsonb_array_elements_text(s->'lanes'->i));
  IF cardinality(cards)=(ARRAY[3,5,7])[i+1] THEN
   expected:=private.drop357_lane(cards,(ARRAY[3,5,7])[i+1],s->'config');
   IF (s->'laneResults'->i)-'completedAt' IS DISTINCT FROM expected THEN RETURN false; END IF;
   base:=base+(expected->>'score')::integer;all_ok:=all_ok AND (expected->>'score')::integer>0;
  ELSE
   IF r->>'reason'='filled' OR s->'laneResults'->i IS DISTINCT FROM 'null'::jsonb THEN RETURN false; END IF;
   all_ok:=false;
  END IF;
 END LOOP;
 base:=base+CASE WHEN all_ok THEN coalesce((s#>>'{config,allBonus}')::integer,200) ELSE 0 END;
 bonus:=CASE WHEN r->>'reason'='filled' THEN round(base*0.20*greatest(0,least(120000,(s->>'deadline')::bigint-(r->>'completedAt')::bigint))/120000)::integer ELSE 0 END;
 RETURN (r->>'allBonus')::integer=(CASE WHEN all_ok THEN coalesce((s#>>'{config,allBonus}')::integer,200) ELSE 0 END) AND (r->>'base')::integer=base AND (r->>'timeBonus')::integer=bonus AND (r->>'score')::integer=base+bonus AND (s->>'score')::integer=base+bonus;
END $function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.drop357_v4_valid(jsonb)'::regprocedure)) NOT IN ('21aa0382806dcb8ea463d1e28de5fbd1','9867feda04db74391d213bf959c5f996') THEN RAISE EXCEPTION 'coordinated:authority_drift private.drop357_v4_valid(jsonb)';END IF;END $guard$;
CREATE OR REPLACE FUNCTION private.drop357_v4_valid(s jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE evidence jsonb;i integer:=0;total bigint:=0;
BEGIN
 IF s#>>'{config,version}'='357-drop/6' AND s->'config' IS DISTINCT FROM private.drop357_v6_rules() THEN RETURN false;END IF;

 IF coalesce(s#>>'{config,version}','') NOT IN ('357-drop/4','357-drop/5','357-drop/6') OR s->>'round' IS DISTINCT FROM '3'
  OR s->>'phase' IS DISTINCT FROM 'stage_complete' OR jsonb_array_length(s->'rounds') IS DISTINCT FROM 3 THEN RETURN false;END IF;
 FOR evidence IN SELECT value FROM jsonb_array_elements(s->'rounds') LOOP
  i:=i+1;
  IF evidence->>'roundId' IS DISTINCT FROM (s->>'runId')||':'||i OR evidence->>'round' IS DISTINCT FROM i::text
   OR private.drop357_v4_valid_board(evidence||jsonb_build_object('config',s->'config')) IS DISTINCT FROM true THEN RETURN false;END IF;
  total:=total+(evidence->>'score')::bigint;
 END LOOP;
 RETURN total=(s->>'score')::bigint AND total=(s->>'banked')::bigint AND total=(s#>>'{result,score}')::bigint
  AND (s->'rounds'->2->'lanes')=s->'lanes' AND (s->'rounds'->2->'laneResults')=s->'laneResults';
END $function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.drop357_deal_dispatch(jsonb,bigint,integer)'::regprocedure)) NOT IN ('ae91e223733a0ff20a7e9410f8522aad','aff2925fc21b2cf0ffa3d9a942cfce4d') THEN RAISE EXCEPTION 'coordinated:authority_drift private.drop357_deal_dispatch(jsonb,bigint,integer)';END IF;END $guard$;
CREATE OR REPLACE FUNCTION private.drop357_deal_dispatch(s jsonb, at_ms bigint, round_i integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF s#>>'{config,version}' IN ('357-drop/4','357-drop/5','357-drop/6') THEN RETURN private.drop357_v4_deal(s,at_ms,round_i);END IF;
 RETURN CASE WHEN s#>>'{config,version}'='357-drop/3' THEN private.drop357_v3_deal(s,at_ms,round_i) ELSE private.drop357_v2_deal(s,at_ms,round_i) END;
END $function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.drop357_valid_dispatch(jsonb)'::regprocedure)) NOT IN ('bcf4da9566c41c66203ee9a0f152bbc5','abdcdec2c9a075eed826d6ea3a24e48e') THEN RAISE EXCEPTION 'coordinated:authority_drift private.drop357_valid_dispatch(jsonb)';END IF;END $guard$;
CREATE OR REPLACE FUNCTION private.drop357_valid_dispatch(s jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE evidence jsonb;i integer:=0;total bigint:=0;
BEGIN
 IF s#>>'{config,version}' IN ('357-drop/4','357-drop/5','357-drop/6') THEN RETURN private.drop357_v4_valid(s);END IF;
 IF s#>>'{config,version}'='357-drop/3' THEN RETURN private.drop357_v3_valid(s);END IF;
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
END $function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.drop357_select_ruleset(text)'::regprocedure)) NOT IN ('ed031b1a7c5edaed2cb2e227472bdc53','948d1fb134a5724ad93686884c9c0da8') THEN RAISE EXCEPTION 'coordinated:authority_drift private.drop357_select_ruleset(text)';END IF;END $guard$;
CREATE OR REPLACE FUNCTION private.drop357_select_ruleset(version text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF version IS NULL OR version NOT IN('357-drop/2','357-drop/3','357-drop/4','357-drop/5','357-drop/6') THEN RAISE EXCEPTION '357:unknown_ruleset';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('357-drop:ruleset',0));
 IF NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id=version) THEN RAISE EXCEPTION '357:missing_ruleset';END IF;
 UPDATE private.arcade_rulesets SET enabled=(id=version) WHERE game='357-drop';
END $function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.arcade_drop357_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)'::regprocedure)) NOT IN ('bb367c8d637d190122904b41c0e139e9','004d4d49ce0287901ce499cbef380ec4') THEN RAISE EXCEPTION 'coordinated:authority_drift public.arcade_drop357_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)';END IF;END $guard$;
CREATE OR REPLACE FUNCTION public.arcade_drop357_step(p_actor uuid, p_run uuid, p_revision bigint DEFAULT NULL::bigint, p_round text DEFAULT NULL::text, p_request uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, p_items integer[] DEFAULT '{}'::integer[], p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 IF run.ruleset NOT IN('357-drop/2','357-drop/3','357-drop/4','357-drop/5','357-drop/6') THEN RAISE EXCEPTION 'arcade:unsupported_ruleset';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action IS NOT NULL THEN
  IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_items IS NULL OR array_position(p_items,NULL) IS NOT NULL OR p_action NOT IN('place','pass','abandon','carry') THEN RAISE EXCEPTION 'arcade:invalid_command';END IF;
  fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_items)::text;
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;outcome:='duplicate';
  END IF;
 END IF;
 s:=run.state;
 IF run.status='active' THEN
  IF s IS NULL THEN s:=private.drop357_deal_dispatch(jsonb_build_object('runId',run.id,'userId',run.user_id,'status','active','config',run.config),floor(extract(epoch FROM run.created_at)*1000)::bigint,1);END IF;
  s:=CASE WHEN run.ruleset IN ('357-drop/4','357-drop/5','357-drop/6') THEN private.drop357_v4_advance(s,at_ms) WHEN run.ruleset='357-drop/3' THEN private.drop357_v3_advance(s,at_ms) ELSE private.drop357_v2_advance(s,at_ms) END;
 END IF;
 IF p_action IS NOT NULL AND outcome<>'duplicate' THEN
  IF s IS DISTINCT FROM run.state OR run.status<>'active' OR p_revision<>run.revision OR p_round IS DISTINCT FROM s->>'roundId' THEN outcome:='stale';
  ELSE s:=CASE WHEN run.ruleset IN ('357-drop/4','357-drop/5','357-drop/6') THEN private.drop357_v4_action(s,p_action,p_items,at_ms) WHEN run.ruleset='357-drop/3' THEN private.drop357_v3_action(s,p_action,p_items,at_ms) ELSE private.drop357_v2_action(s,p_action,p_items,at_ms) END;command_id:=p_request;outcome:='committed';END IF;
 END IF;
 IF s IS DISTINCT FROM run.state THEN
  PERFORM public.arcade_commit(p_actor,p_run,run.revision,s,(s->>'deadline')::bigint,command_id,fingerprint,p_token);
  SELECT * INTO STRICT run FROM private.arcade_runs WHERE id=p_run;
 END IF;
 projection:=jsonb_build_object('id',run.id,'revision',run.revision,'status',run.status,'ruleset',run.ruleset,'serverAt',at_ms,'allFilledMs',run.config->'allFilledMs',
  'acceptedRequestId',(SELECT request_id FROM private.arcade_command_receipts WHERE run_id=run.id AND revision=run.revision LIMIT 1),'round',s->'round','rounds',3,'banked',s->'banked','roundId',s->'roundId','score',run.score,'phase',s->'phase','lanes',s->'lanes','laneResults',s->'laneResults',
  'carryChoices',s->'carryChoices','current',s->'current','stockLeft',52-(s->>'cursor')::integer,'passesLeft',s->'passesLeft','placements',s->'placements',
  'startedAt',s->'startedAt','deadline',s->'deadline','result',s->'result','roundScores',private.drop357_round_scores(s),'completion',(SELECT record FROM private.arcade_results WHERE run_id=run.id));
 RETURN jsonb_build_object('outcome',outcome,'record',jsonb_build_object('id',run.id,'game',run.game,'revision',run.revision,'status',run.status),'projection',projection);
END $function$
;
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES ('horses-blitz/5','horses-blitz',private.horses_blitz_rules('horses-blitz/5'),false),('357-drop/6','357-drop',private.drop357_v6_rules(),false) ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN IF (SELECT config FROM private.arcade_rulesets WHERE id='horses-blitz/5') IS DISTINCT FROM private.horses_blitz_rules('horses-blitz/5') OR (SELECT config FROM private.arcade_rulesets WHERE id='357-drop/6') IS DISTINCT FROM private.drop357_v6_rules() THEN RAISE EXCEPTION 'coordinated:ruleset_drift';END IF;END $$;
