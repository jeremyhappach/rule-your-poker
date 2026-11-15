-- 357 Drop /7: compare final payable scores for printed and wild realizations.
-- /1 through /6 remain frozen. Install closed; activate only after client publication.
CREATE OR REPLACE FUNCTION private.drop357_v7_rules() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT private.drop357_v6_rules() || '{"version":"357-drop/7","naturalPolicy":"printed-identity","selection":"highest-final-score"}'::jsonb
$$;

-- Frozen /6 paytable, shared by both interpretations. No rank or multiplier changes.
CREATE OR REPLACE FUNCTION private.drop357_v7_points(v integer[],lane integer,cfg jsonb) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE ix integer;
BEGIN
 IF lane=3 THEN
  ix:=array_position(ARRAY[2,4,5,6,7,8,9,10,11,12,13,15],v[2])-1;
  -- The existing 3s paytable has no rank-3 payout. Such a printed pair/trips
  -- cannot beat its payable wild-assisted trips; do not invent a matrix entry.
  RETURN coalesce(CASE v[1]
   WHEN 3 THEN (cfg#>'{threeRow,trips}'->>ix)::integer
   WHEN 1 THEN (cfg#>'{threeRow,pair}'->>ix)::integer+2*v[3]
   ELSE 0 END,0);
 END IF;
 RETURN CASE v[1] WHEN 2 THEN 200+16*v[2]+v[3] WHEN 3 THEN 550+10*v[2]
  WHEN 4 THEN 850+10*v[2] WHEN 5 THEN 1200+10*v[2]
  WHEN 6 THEN 1600+16*v[2]+v[3] WHEN 7 THEN 2250+10*v[2]
  WHEN 8 THEN 2900+10*v[2] WHEN 9 THEN 3700 WHEN 10 THEN 4500+10*v[2] ELSE 0 END;
END $$;

CREATE OR REPLACE FUNCTION private.drop357_v7_lane(cards integer[],lane integer,cfg jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE mask integer;i integer;interpretation integer;selected integer[];indices integer[];
 v integer[];best integer[];chosen integer[];natural_i boolean;natural_best boolean:=false;
 points integer;bonus integer;score integer;best_points integer;best_bonus integer;best_score integer;
 n integer:=cardinality(cards);
BEGIN
 IF cfg IS DISTINCT FROM private.drop357_v7_rules() THEN RAISE EXCEPTION '357:rules';END IF;
 IF lane NOT IN(3,5,7) OR n IS DISTINCT FROM lane OR EXISTS(SELECT FROM unnest(cards)c WHERE c IS NULL OR c NOT BETWEEN 0 AND 51)
  OR (SELECT count(DISTINCT c) FROM unnest(cards)c)<>n THEN RAISE EXCEPTION 'arcade:invalid_cards';END IF;
 FOR mask IN 1..((1<<n)-1) LOOP
  IF bit_count(mask::bit(8))<>least(5,n) THEN CONTINUE;END IF;
  selected:='{}';indices:='{}';
  FOR i IN 0..n-1 LOOP IF (mask & (1<<i))<>0 THEN
   selected:=array_append(selected,cards[i+1]);indices:=array_append(indices,i);
  END IF;END LOOP;
  -- The same classifier runs with no wild rank, then with this row's wild rank.
  -- Never attach a printed-hand bonus to an improved wild vector.
  FOR interpretation IN 0..1 LOOP
   v:=private.drop357_vector(selected,CASE WHEN interpretation=0 THEN 0 ELSE lane END);
   points:=private.drop357_v7_points(v,lane,cfg);
   natural_i:=interpretation=0 AND points>0;
   bonus:=CASE WHEN natural_i THEN round(points*0.20)::integer ELSE 0 END;
   score:=points+bonus;
   IF best IS NULL OR score>best_score OR (score=best_score AND
    (v>best OR (v=best AND natural_i AND NOT natural_best))) THEN
    best:=v;chosen:=indices;natural_best:=natural_i;best_points:=points;best_bonus:=bonus;best_score:=score;
   END IF;
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('vector',best,'selected',chosen,'natural',natural_best,
  'points',best_points,'bonus',best_bonus,'score',best_score,
  'category',(ARRAY['High card','Pair','Two pair','Trips','Straight','Flush','Full house','Quads','Straight flush','Royal flush','Five of a kind'])[best[1]+1]);
END $$;
REVOKE ALL ON FUNCTION private.drop357_v7_rules(),private.drop357_v7_points(integer[],integer,jsonb),
 private.drop357_v7_lane(integer[],integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;

DO $guard$ BEGIN
 IF (SELECT prosrc FROM pg_proc WHERE oid='private.drop357_lane(integer[],integer,jsonb)'::regprocedure) NOT IN($old$
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
END $old$,$new$
DECLARE result jsonb;v integer[];base integer:=0;bonus integer:=0;ix integer;
BEGIN
 IF cfg->>'version'='357-drop/7' THEN RETURN private.drop357_v7_lane(cards,lane,cfg);END IF;
 result:=private.drop357_lane(cards,lane);
 IF lane<>3 OR cfg->>'version' IS DISTINCT FROM '357-drop/6' THEN RETURN result;END IF;
 IF cfg IS DISTINCT FROM private.drop357_v6_rules() THEN RAISE EXCEPTION '357:rules';END IF;
 v:=ARRAY(SELECT value::integer FROM jsonb_array_elements_text(result->'vector'));
 ix:=array_position(ARRAY[2,4,5,6,7,8,9,10,11,12,13,15],v[2])-1;
 IF v[1]=3 THEN base:=(cfg#>'{threeRow,trips}'->>ix)::integer;
 ELSIF v[1]=1 THEN base:=(cfg#>'{threeRow,pair}'->>ix)::integer+2*v[3];END IF;
 bonus:=CASE WHEN (result->>'natural')::boolean THEN round(base*0.20)::integer ELSE 0 END;
 RETURN result||jsonb_build_object('points',base,'bonus',bonus,'score',base+bonus);
END $new$) THEN RAISE EXCEPTION '357:authority_drift private.drop357_lane(integer[],integer,jsonb)';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.drop357_lane(cards integer[], lane integer, cfg jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE result jsonb;v integer[];base integer:=0;bonus integer:=0;ix integer;
BEGIN
 IF cfg->>'version'='357-drop/7' THEN RETURN private.drop357_v7_lane(cards,lane,cfg);END IF;
 result:=private.drop357_lane(cards,lane);
 IF lane<>3 OR cfg->>'version' IS DISTINCT FROM '357-drop/6' THEN RETURN result;END IF;
 IF cfg IS DISTINCT FROM private.drop357_v6_rules() THEN RAISE EXCEPTION '357:rules';END IF;
 v:=ARRAY(SELECT value::integer FROM jsonb_array_elements_text(result->'vector'));
 ix:=array_position(ARRAY[2,4,5,6,7,8,9,10,11,12,13,15],v[2])-1;
 IF v[1]=3 THEN base:=(cfg#>'{threeRow,trips}'->>ix)::integer;
 ELSIF v[1]=1 THEN base:=(cfg#>'{threeRow,pair}'->>ix)::integer+2*v[3];END IF;
 bonus:=CASE WHEN (result->>'natural')::boolean THEN round(base*0.20)::integer ELSE 0 END;
 RETURN result||jsonb_build_object('points',base,'bonus',bonus,'score',base+bonus);
END $function$
;

DO $guard$ BEGIN
 IF (SELECT prosrc FROM pg_proc WHERE oid='private.drop357_v4_valid(jsonb)'::regprocedure) NOT IN($old$
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
END $old$,$new$
DECLARE evidence jsonb;i integer:=0;total bigint:=0;
BEGIN
 IF s#>>'{config,version}'='357-drop/7' AND s->'config' IS DISTINCT FROM private.drop357_v7_rules() THEN RETURN false;END IF;
 IF s#>>'{config,version}'='357-drop/6' AND s->'config' IS DISTINCT FROM private.drop357_v6_rules() THEN RETURN false;END IF;

 IF coalesce(s#>>'{config,version}','') NOT IN ('357-drop/4','357-drop/5','357-drop/6','357-drop/7') OR s->>'round' IS DISTINCT FROM '3'
  OR s->>'phase' IS DISTINCT FROM 'stage_complete' OR jsonb_array_length(s->'rounds') IS DISTINCT FROM 3 THEN RETURN false;END IF;
 FOR evidence IN SELECT value FROM jsonb_array_elements(s->'rounds') LOOP
  i:=i+1;
  IF evidence->>'roundId' IS DISTINCT FROM (s->>'runId')||':'||i OR evidence->>'round' IS DISTINCT FROM i::text
   OR private.drop357_v4_valid_board(evidence||jsonb_build_object('config',s->'config')) IS DISTINCT FROM true THEN RETURN false;END IF;
  total:=total+(evidence->>'score')::bigint;
 END LOOP;
 RETURN total=(s->>'score')::bigint AND total=(s->>'banked')::bigint AND total=(s#>>'{result,score}')::bigint
  AND (s->'rounds'->2->'lanes')=s->'lanes' AND (s->'rounds'->2->'laneResults')=s->'laneResults';
END $new$) THEN RAISE EXCEPTION '357:authority_drift private.drop357_v4_valid(jsonb)';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.drop357_v4_valid(s jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE evidence jsonb;i integer:=0;total bigint:=0;
BEGIN
 IF s#>>'{config,version}'='357-drop/7' AND s->'config' IS DISTINCT FROM private.drop357_v7_rules() THEN RETURN false;END IF;
 IF s#>>'{config,version}'='357-drop/6' AND s->'config' IS DISTINCT FROM private.drop357_v6_rules() THEN RETURN false;END IF;

 IF coalesce(s#>>'{config,version}','') NOT IN ('357-drop/4','357-drop/5','357-drop/6','357-drop/7') OR s->>'round' IS DISTINCT FROM '3'
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

DO $guard$ BEGIN
 IF (SELECT prosrc FROM pg_proc WHERE oid='private.drop357_deal_dispatch(jsonb,bigint,integer)'::regprocedure) NOT IN($old$
BEGIN
 IF s#>>'{config,version}' IN ('357-drop/4','357-drop/5','357-drop/6') THEN RETURN private.drop357_v4_deal(s,at_ms,round_i);END IF;
 RETURN CASE WHEN s#>>'{config,version}'='357-drop/3' THEN private.drop357_v3_deal(s,at_ms,round_i) ELSE private.drop357_v2_deal(s,at_ms,round_i) END;
END $old$,$new$
BEGIN
 IF s#>>'{config,version}' IN ('357-drop/4','357-drop/5','357-drop/6','357-drop/7') THEN RETURN private.drop357_v4_deal(s,at_ms,round_i);END IF;
 RETURN CASE WHEN s#>>'{config,version}'='357-drop/3' THEN private.drop357_v3_deal(s,at_ms,round_i) ELSE private.drop357_v2_deal(s,at_ms,round_i) END;
END $new$) THEN RAISE EXCEPTION '357:authority_drift private.drop357_deal_dispatch(jsonb,bigint,integer)';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.drop357_deal_dispatch(s jsonb, at_ms bigint, round_i integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF s#>>'{config,version}' IN ('357-drop/4','357-drop/5','357-drop/6','357-drop/7') THEN RETURN private.drop357_v4_deal(s,at_ms,round_i);END IF;
 RETURN CASE WHEN s#>>'{config,version}'='357-drop/3' THEN private.drop357_v3_deal(s,at_ms,round_i) ELSE private.drop357_v2_deal(s,at_ms,round_i) END;
END $function$
;

DO $guard$ BEGIN
 IF (SELECT prosrc FROM pg_proc WHERE oid='private.drop357_valid_dispatch(jsonb)'::regprocedure) NOT IN($old$
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
END $old$,$new$
DECLARE evidence jsonb;i integer:=0;total bigint:=0;
BEGIN
 IF s#>>'{config,version}' IN ('357-drop/4','357-drop/5','357-drop/6','357-drop/7') THEN RETURN private.drop357_v4_valid(s);END IF;
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
END $new$) THEN RAISE EXCEPTION '357:authority_drift private.drop357_valid_dispatch(jsonb)';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.drop357_valid_dispatch(s jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE evidence jsonb;i integer:=0;total bigint:=0;
BEGIN
 IF s#>>'{config,version}' IN ('357-drop/4','357-drop/5','357-drop/6','357-drop/7') THEN RETURN private.drop357_v4_valid(s);END IF;
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

DO $guard$ BEGIN
 IF (SELECT prosrc FROM pg_proc WHERE oid='private.drop357_select_ruleset(text)'::regprocedure) NOT IN($old$
BEGIN
 IF version IS NULL OR version NOT IN('357-drop/2','357-drop/3','357-drop/4','357-drop/5','357-drop/6') THEN RAISE EXCEPTION '357:unknown_ruleset';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('357-drop:ruleset',0));
 IF NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id=version) THEN RAISE EXCEPTION '357:missing_ruleset';END IF;
 UPDATE private.arcade_rulesets SET enabled=(id=version) WHERE game='357-drop';
END $old$,$new$
BEGIN
 IF version IS NULL OR version NOT IN('357-drop/2','357-drop/3','357-drop/4','357-drop/5','357-drop/6','357-drop/7') THEN RAISE EXCEPTION '357:unknown_ruleset';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('357-drop:ruleset',0));
 IF NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id=version) THEN RAISE EXCEPTION '357:missing_ruleset';END IF;
 UPDATE private.arcade_rulesets SET enabled=(id=version) WHERE game='357-drop';
END $new$) THEN RAISE EXCEPTION '357:authority_drift private.drop357_select_ruleset(text)';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.drop357_select_ruleset(version text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF version IS NULL OR version NOT IN('357-drop/2','357-drop/3','357-drop/4','357-drop/5','357-drop/6','357-drop/7') THEN RAISE EXCEPTION '357:unknown_ruleset';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('357-drop:ruleset',0));
 IF NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id=version) THEN RAISE EXCEPTION '357:missing_ruleset';END IF;
 UPDATE private.arcade_rulesets SET enabled=(id=version) WHERE game='357-drop';
END $function$
;

DO $guard$ BEGIN
 IF (SELECT prosrc FROM pg_proc WHERE oid='public.arcade_drop357_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)'::regprocedure) NOT IN($old$
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
END $old$,$new$
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
 IF run.ruleset NOT IN('357-drop/2','357-drop/3','357-drop/4','357-drop/5','357-drop/6','357-drop/7') THEN RAISE EXCEPTION 'arcade:unsupported_ruleset';END IF;
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
  s:=CASE WHEN run.ruleset IN ('357-drop/4','357-drop/5','357-drop/6','357-drop/7') THEN private.drop357_v4_advance(s,at_ms) WHEN run.ruleset='357-drop/3' THEN private.drop357_v3_advance(s,at_ms) ELSE private.drop357_v2_advance(s,at_ms) END;
 END IF;
 IF p_action IS NOT NULL AND outcome<>'duplicate' THEN
  IF s IS DISTINCT FROM run.state OR run.status<>'active' OR p_revision<>run.revision OR p_round IS DISTINCT FROM s->>'roundId' THEN outcome:='stale';
  ELSE s:=CASE WHEN run.ruleset IN ('357-drop/4','357-drop/5','357-drop/6','357-drop/7') THEN private.drop357_v4_action(s,p_action,p_items,at_ms) WHEN run.ruleset='357-drop/3' THEN private.drop357_v3_action(s,p_action,p_items,at_ms) ELSE private.drop357_v2_action(s,p_action,p_items,at_ms) END;command_id:=p_request;outcome:='committed';END IF;
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
END $new$) THEN RAISE EXCEPTION '357:authority_drift public.arcade_drop357_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)';END IF;
END $guard$;
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
 IF run.ruleset NOT IN('357-drop/2','357-drop/3','357-drop/4','357-drop/5','357-drop/6','357-drop/7') THEN RAISE EXCEPTION 'arcade:unsupported_ruleset';END IF;
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
  s:=CASE WHEN run.ruleset IN ('357-drop/4','357-drop/5','357-drop/6','357-drop/7') THEN private.drop357_v4_advance(s,at_ms) WHEN run.ruleset='357-drop/3' THEN private.drop357_v3_advance(s,at_ms) ELSE private.drop357_v2_advance(s,at_ms) END;
 END IF;
 IF p_action IS NOT NULL AND outcome<>'duplicate' THEN
  IF s IS DISTINCT FROM run.state OR run.status<>'active' OR p_revision<>run.revision OR p_round IS DISTINCT FROM s->>'roundId' THEN outcome:='stale';
  ELSE s:=CASE WHEN run.ruleset IN ('357-drop/4','357-drop/5','357-drop/6','357-drop/7') THEN private.drop357_v4_action(s,p_action,p_items,at_ms) WHEN run.ruleset='357-drop/3' THEN private.drop357_v3_action(s,p_action,p_items,at_ms) ELSE private.drop357_v2_action(s,p_action,p_items,at_ms) END;command_id:=p_request;outcome:='committed';END IF;
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

INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('357-drop/7','357-drop',private.drop357_v7_rules(),false)
ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN IF NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id='357-drop/7' AND game='357-drop' AND config=private.drop357_v7_rules()) THEN RAISE EXCEPTION '357:ruleset_drift';END IF;END $$;

-- Keep existing /6 leaderboard and personal-best history exactly where it is.
DO $guard$ BEGIN
 IF md5(pg_get_functiondef('private.arcade_score_group(text,text)'::regprocedure))<>'47ceb627db8b539ff8a3376a3041add2'
 AND position('WHEN game=''357-drop'' AND ruleset=''357-drop/7'' THEN ''357-drop/6''' IN pg_get_functiondef('private.arcade_score_group(text,text)'::regprocedure))=0
 THEN RAISE EXCEPTION '357:score_group_drift';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.arcade_score_group(game text, ruleset text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN game='tri-towers' AND ruleset IN ('tri-towers/2','tri-towers/3','tri-towers/4','tri-towers/5') THEN 'tri-towers/2'
 WHEN game='run21' AND ruleset IN ('run21/2','run21/3') THEN 'run21/2' WHEN game='royal-flash' AND ruleset IN ('royal-flash/1','royal-flash/2','royal-flash/3') THEN 'royal-flash/1' WHEN game='357-drop' AND ruleset='357-drop/7' THEN '357-drop/6' ELSE ruleset END
$function$
;
