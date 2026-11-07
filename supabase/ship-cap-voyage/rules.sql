-- Frozen, mode-neutral Ship Cap Voyage / 1 rules. No financial writes.
CREATE OR REPLACE FUNCTION private.ship_cap_voyage_rules() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT '{"version":"ship-cap-voyage/1","rounds":3,"rolls":12,"banks":3,"rollBonus":30,"base":[0,0,0,30,45,65,90,125,175,250,365,530,800]}'::jsonb $$;

CREATE OR REPLACE FUNCTION private.ship_cap_voyage_quote(cargo integer,roll integer) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN cargo BETWEEN 3 AND 12 AND roll BETWEEN 1 AND 12 THEN jsonb_build_object(
 'base',(private.ship_cap_voyage_rules()->'base'->>cargo)::int,'bonus',30*(12-roll),
 'points',(private.ship_cap_voyage_rules()->'base'->>cargo)::int+30*(12-roll)) ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION private.ship_cap_voyage_round(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE sql SET search_path='' AS $$ SELECT s||jsonb_build_object('round',(s->>'round')::int+1,
 'roundId',(s->>'runId')||':'||((s->>'round')::int+1),'startedAt',at_ms,'roll',0,'dice','[]'::jsonb,
 'locked','[]'::jsonb,'cargo',NULL,'banks','[]'::jsonb,'phase','playing','result',NULL) $$;

CREATE OR REPLACE FUNCTION private.ship_cap_voyage_finish(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE total integer:=0;r jsonb;
BEGIN
 IF s->>'phase'='summary' THEN RETURN s;END IF;
 IF jsonb_array_length(s->'banks')=3 THEN SELECT sum((b->>'points')::int) INTO total FROM jsonb_array_elements(s->'banks')b;END IF;
 r:=jsonb_build_object('id',s->'roundId','round',s->'round','banks',s->'banks','total',total,'completedAt',at_ms,'reason',CASE WHEN jsonb_array_length(s->'banks')=3 THEN 'complete' ELSE 'incomplete' END);
 RETURN s||jsonb_build_object('result',r,'results',(s->'results')||jsonb_build_array(r),'score',(s->>'score')::int+total,'phase','summary','status',CASE WHEN s->>'round'='3' THEN 'completed' ELSE 'active' END);
END $$;

-- Deterministic reducer is private; the command entry point alone supplies secure dice.
CREATE OR REPLACE FUNCTION private.ship_cap_voyage_apply_roll(s jsonb,dice jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE held jsonb:=s->'locked';need integer;i integer;found_i integer;cargo integer:=0;roll_i integer:=(s->>'roll')::int+1;
BEGIN
 IF s->>'status'<>'active' OR s->>'phase'<>'playing' OR roll_i>12 OR jsonb_array_length(dice)<>5
 OR EXISTS(SELECT FROM jsonb_array_elements(dice)d WHERE d::text !~ '^[1-6]$') THEN RAISE EXCEPTION 'arcade:invalid_roll';END IF;
 FOR i IN SELECT value::text::int FROM jsonb_array_elements(held) LOOP
  IF dice->i IS DISTINCT FROM s->'dice'->i THEN RAISE EXCEPTION 'arcade:locked_die';END IF;
 END LOOP;
 WHILE jsonb_array_length(held)<3 LOOP
  need:=6-jsonb_array_length(held);found_i:=NULL;
  FOR i IN 0..4 LOOP IF NOT held @> to_jsonb(ARRAY[i]) AND (dice->>i)::int=need THEN found_i:=i;EXIT;END IF;END LOOP;
  EXIT WHEN found_i IS NULL;held:=held||to_jsonb(found_i);
 END LOOP;
 IF jsonb_array_length(held)=3 THEN
  FOR i IN 0..4 LOOP IF NOT held @> to_jsonb(ARRAY[i]) THEN cargo:=cargo+(dice->>i)::int;END IF;END LOOP;
 END IF;
 s:=s||jsonb_build_object('dice',dice,'locked',held,'roll',roll_i,'cargo',CASE WHEN cargo>0 THEN cargo ELSE NULL END);
 IF roll_i=12 AND NOT(jsonb_array_length(s->'banks')=2 AND cargo>=3) THEN RETURN private.ship_cap_voyage_finish(s,at_ms);END IF;
 RETURN s;
END $$;

CREATE OR REPLACE FUNCTION private.ship_cap_voyage_action(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE dice jsonb:='[]';i integer;n integer;cargo integer:=(s->>'cargo')::int;bank jsonb;
BEGIN
 IF s->'config' IS DISTINCT FROM private.ship_cap_voyage_rules() OR s->>'status'<>'active' OR items IS NULL OR cardinality(items)<>0 THEN RAISE EXCEPTION 'arcade:invalid_command';END IF;
 IF action='abandon' THEN RETURN s||'{"status":"abandoned"}'::jsonb;END IF;
 IF action='next_round' AND s->>'phase'='summary' AND (s->>'round')::int<3 THEN RETURN private.ship_cap_voyage_round(s,at_ms);END IF;
 IF s->>'phase'<>'playing' THEN RAISE EXCEPTION 'arcade:illegal_action';END IF;
 IF action='roll' AND (s->>'roll')::int<12 THEN
  FOR i IN 0..4 LOOP
   IF s->'locked' @> to_jsonb(ARRAY[i]) THEN n:=(s->'dice'->>i)::int;
   ELSE LOOP n:=get_byte(extensions.gen_random_bytes(1),0);EXIT WHEN n<252;END LOOP;n:=1+n%6;END IF;
   dice:=dice||to_jsonb(n);
  END LOOP;
  RETURN private.ship_cap_voyage_apply_roll(s,dice,at_ms);
 END IF;
 IF action='bank' AND cargo>=3 AND jsonb_array_length(s->'locked')=3 AND jsonb_array_length(s->'banks')<3 THEN
  bank:=jsonb_build_object('cargo',cargo,'roll',s->'roll')||private.ship_cap_voyage_quote(cargo,(s->>'roll')::int);
  s:=s||jsonb_build_object('banks',(s->'banks')||jsonb_build_array(bank),'cargo',NULL);
  IF jsonb_array_length(s->'banks')=3 OR s->>'roll'='12' THEN RETURN private.ship_cap_voyage_finish(s,at_ms);END IF;
  RETURN s;
 END IF;
 RAISE EXCEPTION 'arcade:illegal_action';
END $$;

CREATE OR REPLACE FUNCTION private.ship_cap_voyage_valid(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE r jsonb;b jsonb;n integer:=0;total integer:=0;subtotal integer;previous_roll integer;points integer;
BEGIN
 IF s->'config' IS DISTINCT FROM private.ship_cap_voyage_rules() OR s->>'phase' IS DISTINCT FROM 'summary' OR s->>'round' IS DISTINCT FROM '3' OR jsonb_array_length(s->'results') IS DISTINCT FROM 3 THEN RETURN false;END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(s->'results') LOOP
  n:=n+1;subtotal:=0;previous_roll:=0;
  IF r->>'id' IS DISTINCT FROM (s->>'runId')||':'||n OR r->>'round' IS DISTINCT FROM n::text OR jsonb_array_length(r->'banks')>3 THEN RETURN false;END IF;
  FOR b IN SELECT value FROM jsonb_array_elements(r->'banks') LOOP
   IF (b->>'cargo')::int NOT BETWEEN 3 AND 12 OR (b->>'roll')::int NOT BETWEEN previous_roll+1 AND 12 THEN RETURN false;END IF;
   previous_roll:=(b->>'roll')::int;points:=(s->'config'->'base'->>(b->>'cargo')::int)::int;
   IF (b->>'base')::int IS DISTINCT FROM points OR (b->>'bonus')::int IS DISTINCT FROM 30*(12-previous_roll) OR (b->>'points')::int IS DISTINCT FROM points+30*(12-previous_roll) THEN RETURN false;END IF;
   subtotal:=subtotal+(b->>'points')::int;
  END LOOP;
  IF jsonb_array_length(r->'banks')<>3 THEN subtotal:=0;END IF;
  IF (r->>'total')::int IS DISTINCT FROM subtotal THEN RETURN false;END IF;total:=total+subtotal;
 END LOOP;
 RETURN (s->>'score')::int=total;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
