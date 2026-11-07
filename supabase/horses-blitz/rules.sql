-- horses-blitz/1: one immutable, mode-neutral rules owner. Solo orchestration below.
CREATE OR REPLACE FUNCTION private.horses_blitz_rules() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT '{"version":"horses-blitz/1","rounds":3,"hands":10,"durationMs":100000,"timePerSecond":50,"bankMs":450,"ladder":[[390,225,90],[600,400,250],[1400,1000,650]]}'::jsonb $$;

CREATE OR REPLACE FUNCTION private.horses_blitz_rules(version text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF version='horses-blitz/1' THEN RETURN private.horses_blitz_rules();END IF;
 IF version='horses-blitz/2' THEN RETURN private.horses_blitz_rules()||'{"version":"horses-blitz/2","manualOpening":true}'::jsonb;END IF;
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
DECLARE r integer:=coalesce((s->>'round')::integer,0)+1;manual boolean:=s#>>'{config,version}'='horses-blitz/2';dice jsonb;
BEGIN
 dice:=CASE WHEN manual THEN '[]'::jsonb ELSE private.horses_blitz_roll('[]','{}') END;
 RETURN s||jsonb_build_object('round',r,'roundId',(s->>'runId')||':'||r,'hand',1,'handId',(s->>'runId')||':'||r||':1',
 'roll',CASE WHEN manual THEN 0 ELSE 1 END,'dice',dice,'held','[]'::jsonb,'set',CASE WHEN manual THEN '{"size":0,"points":0,"label":""}'::jsonb ELSE private.horses_blitz_set(dice,1) END,'base',0,'hands','[]'::jsonb,'phase','playing',
 'startedAt',at_ms,'deadline',at_ms+100000,'phaseUntil',NULL,'result',NULL,'bank',NULL);
END $$;

CREATE OR REPLACE FUNCTION private.horses_blitz_finish(s jsonb,at_ms bigint,reason text) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE bonus integer:=0;result jsonb;hands jsonb:=s->'hands';i integer;
BEGIN
 IF s->>'phase'='summary' OR s->>'status'<>'active' THEN RETURN s;END IF;
 IF reason='complete' THEN
  IF jsonb_array_length(hands)<>10 THEN RAISE EXCEPTION 'horses_blitz:incomplete';END IF;
  bonus:=least(100,greatest(0,((s->>'deadline')::bigint-at_ms)/1000))*50;
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
DECLARE dice jsonb;boundary bigint;hand_i integer;manual boolean:=s#>>'{config,version}'='horses-blitz/2';
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
   'set',CASE WHEN manual THEN '{"size":0,"points":0,"label":""}'::jsonb ELSE private.horses_blitz_set(dice,1) END,'phase','playing','phaseUntil',NULL,'bank',NULL);
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
 IF action='bank' AND cardinality(items)=0 AND (s->>'roll')::integer<3 AND (s#>>'{set,points}')::integer>0 THEN RETURN private.horses_blitz_bank(s,at_ms);END IF;
 IF action='roll' AND (s->>'roll')::integer<3 THEN
  IF s->>'roll'='0' AND cardinality(items)<>0 THEN RAISE EXCEPTION 'horses_blitz:holds';END IF;
  dice:=private.horses_blitz_roll(s->'dice',items);roll_i:=(s->>'roll')::integer+1;
  s:=s||jsonb_build_object('dice',dice,'held',to_jsonb(items),'roll',roll_i,'set',private.horses_blitz_set(dice,roll_i));
  IF roll_i=3 THEN s:=private.horses_blitz_bank(s,at_ms);END IF;RETURN s;
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
   IF (h->>'hand')::integer IS DISTINCT FROM hi OR (h->>'points')::integer IS DISTINCT FROM (CASE WHEN (h->>'forfeit')::boolean THEN 0 ELSE (private.horses_blitz_set(h->'dice',(h->>'roll')::integer)->>'points')::integer END) THEN RETURN false;END IF;
   base_i:=base_i+(h->>'points')::integer;
  END LOOP;
  IF base_i IS DISTINCT FROM (r->>'base')::integer OR (r->>'timerBonus')::integer NOT BETWEEN 0 AND 5000
   OR (r->>'timerBonus')::integer IS DISTINCT FROM (CASE WHEN r->>'reason'='timeout' THEN 0 ELSE least(100,greatest(0,((r->>'deadline')::bigint-(r->>'completedAt')::bigint)/1000))*50 END)
   OR (r->>'deadline')::bigint-(r->>'startedAt')::bigint<>100000
   OR (r->>'total')::integer IS DISTINCT FROM base_i+(r->>'timerBonus')::integer THEN RETURN false;END IF;
  total:=total+(r->>'total')::integer;
 END LOOP;
 RETURN total=(s->>'score')::integer;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
