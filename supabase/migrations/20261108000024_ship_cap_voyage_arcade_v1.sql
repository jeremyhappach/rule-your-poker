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

-- Solo lifecycle, shared Arcade persistence. No financial/session owners.
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('ship-cap-voyage/1','ship-cap-voyage',private.ship_cap_voyage_rules(),false) ON CONFLICT(id) DO NOTHING;
DO $$
DECLARE definition text; anchor text;
BEGIN
 definition:=pg_get_functiondef('public.arcade_start(uuid,uuid,text)'::regprocedure);
 anchor:='p_game NOT IN (';
 IF position('''ship-cap-voyage''' IN definition)=0 THEN
  IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'arcade:start_registration_changed'; END IF;
  EXECUTE replace(definition,anchor,'p_game NOT IN (''ship-cap-voyage'',');
 END IF;
 definition:=pg_get_functiondef('public.arcade_commit(uuid,uuid,bigint,jsonb,bigint,uuid,text,uuid)'::regprocedure);
 anchor:=' IF run.game=''crib-lab'' AND status_i=''completed''';
 IF position('private.ship_cap_voyage_valid' IN definition)=0 THEN
  IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'arcade:commit_registration_changed'; END IF;
  EXECUTE replace(definition,anchor,' IF run.game=''ship-cap-voyage'' AND status_i=''completed'' AND private.ship_cap_voyage_valid(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION ''arcade:invalid_completion''; END IF;'||chr(10)||anchor);
 END IF;
 SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint WHERE conrelid='public.arcade_game_artwork'::regclass AND conname='arcade_game_artwork_game_check';
 IF position('''ship-cap-voyage''' IN definition)=0 THEN
  IF position('ARRAY[' IN definition)=0 THEN RAISE EXCEPTION 'arcade:artwork_registration_changed'; END IF;
  ALTER TABLE public.arcade_game_artwork DROP CONSTRAINT arcade_game_artwork_game_check;
  EXECUTE 'ALTER TABLE public.arcade_game_artwork ADD CONSTRAINT arcade_game_artwork_game_check '||replace(definition,'ARRAY[','ARRAY[''ship-cap-voyage''::text,');
 END IF;
END $$;
INSERT INTO public.arcade_game_artwork(game) VALUES('ship-cap-voyage') ON CONFLICT(game) DO NOTHING;

CREATE OR REPLACE FUNCTION public.arcade_ship_cap_voyage_step(p_actor uuid,p_run uuid,p_revision bigint DEFAULT NULL,p_round text DEFAULT NULL,
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
 IF NOT FOUND OR run.game<>'ship-cap-voyage' OR (p_actor IS NOT NULL AND p_actor<>run.user_id) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501'; END IF;
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
  IF s IS NULL THEN s:=private.ship_cap_voyage_round(jsonb_build_object('runId',run.id,'userId',run.user_id,'status','active','config',run.config,'round',0,'score',0,'results','[]'::jsonb),floor(extract(epoch FROM run.created_at)*1000)::bigint); END IF;

 END IF;
 IF p_action IS NOT NULL AND outcome<>'duplicate' THEN
  IF s IS DISTINCT FROM run.state OR run.status<>'active' OR p_revision<>run.revision OR p_round IS DISTINCT FROM s->>'roundId' THEN outcome:='stale';
  ELSE s:=private.ship_cap_voyage_action(s,p_action,p_items,at_ms);command_id:=p_request;outcome:='committed'; END IF;
 END IF;
 IF s IS DISTINCT FROM run.state THEN
  PERFORM public.arcade_commit(p_actor,p_run,run.revision,s,NULL,command_id,fingerprint,p_token);
  SELECT * INTO STRICT run FROM private.arcade_runs WHERE id=p_run;
 END IF;
 projection:=jsonb_build_object('id',run.id,'revision',run.revision,'status',run.status,'ruleset',run.ruleset,'serverAt',at_ms,
  'roundId',s->'roundId','round',s->'round','score',run.score,'phase',s->'phase','roll',s->'roll','dice',s->'dice','locked',s->'locked','cargo',s->'cargo','quote',private.ship_cap_voyage_quote((s->>'cargo')::int,(s->>'roll')::int),'banks',s->'banks','results',s->'results','startedAt',s->'startedAt','result',s->'result','completion',(SELECT record FROM private.arcade_results WHERE run_id=run.id));
 RETURN jsonb_build_object('outcome',outcome,'record',jsonb_build_object('id',run.id,'game',run.game,'revision',run.revision,'status',run.status),'projection',projection);
END $$;
REVOKE ALL ON FUNCTION public.arcade_ship_cap_voyage_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_ship_cap_voyage_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) TO service_role;
DO $$ DECLARE p record;BEGIN FOR p IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname LIKE 'ship_cap_voyage_%' LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||p.sig||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;END $$;
