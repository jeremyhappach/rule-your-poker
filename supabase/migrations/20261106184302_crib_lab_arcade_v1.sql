-- Crib Lab v1. Admission stays closed until the matching app and recovery worker qualify.
ALTER TABLE public.game_defaults ADD COLUMN IF NOT EXISTS crib_lab_round_seconds integer NOT NULL DEFAULT 240
  CHECK (crib_lab_round_seconds BETWEEN 60 AND 600);

CREATE OR REPLACE FUNCTION private.crib_lab_defaults_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  seconds_i integer := NEW.crib_lab_round_seconds;
  id_i text := CASE WHEN seconds_i=240 THEN 'crib-lab/1' ELSE 'crib-lab/1-duration-'||seconds_i END;
  open_i boolean;
  rules jsonb := jsonb_build_object('version','crib-lab/1','durationMs',seconds_i*1000);
BEGIN
  SELECT EXISTS(SELECT FROM private.arcade_rulesets WHERE game='crib-lab' AND enabled) INTO open_i;
  INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES(id_i,'crib-lab',rules,false) ON CONFLICT(id) DO NOTHING;
  IF NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id=id_i AND config=rules AND game='crib-lab') THEN
    RAISE EXCEPTION 'arcade:rules_conflict';
  END IF;
  UPDATE private.arcade_rulesets SET enabled=false WHERE game='crib-lab' AND enabled AND id<>id_i;
  IF open_i THEN UPDATE private.arcade_rulesets SET enabled=true WHERE id=id_i AND NOT enabled; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.crib_lab_defaults_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS crib_lab_duration ON public.game_defaults;
CREATE TRIGGER crib_lab_duration AFTER INSERT OR UPDATE OF crib_lab_round_seconds ON public.game_defaults
FOR EACH ROW WHEN (NEW.game_type='crib-lab') EXECUTE FUNCTION private.crib_lab_defaults_v1();

INSERT INTO public.game_defaults(game_type) VALUES('crib-lab') ON CONFLICT(game_type) DO NOTHING;

-- Extend only the two existing Arcade registration lists. Fail closed on drift.
DO $$
DECLARE definition text; anchor text := 'p_game NOT IN (''quintzee'',''run21''';
BEGIN
  definition:=pg_get_functiondef('public.arcade_start(uuid,uuid,text)'::regprocedure);
  IF position('p_game NOT IN (''crib-lab'',''quintzee''' IN definition)=0 THEN
    IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'arcade:start_registration_changed'; END IF;
    EXECUTE replace(definition,anchor,'p_game NOT IN (''crib-lab'',''quintzee'',''run21''');
  END IF;
  SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint
    WHERE conrelid='public.arcade_game_artwork'::regclass AND conname='arcade_game_artwork_game_check';
  IF position('''crib-lab''' IN definition)=0 THEN
    IF position('ARRAY[' IN definition)=0 THEN RAISE EXCEPTION 'arcade:artwork_registration_changed'; END IF;
    ALTER TABLE public.arcade_game_artwork DROP CONSTRAINT arcade_game_artwork_game_check;
    EXECUTE 'ALTER TABLE public.arcade_game_artwork ADD CONSTRAINT arcade_game_artwork_game_check '||
      replace(definition,'ARRAY[','ARRAY[''crib-lab''::text,');
  END IF;
END $$;
INSERT INTO public.arcade_game_artwork(game) VALUES('crib-lab') ON CONFLICT(game) DO NOTHING;

CREATE OR REPLACE FUNCTION private.crib_lab_deal_v1(s jsonb, round_i integer, at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE deck jsonb:=private.cribbage_new_deck(); hands jsonb; stock jsonb;
BEGIN
  SELECT jsonb_agg(hand ORDER BY h) INTO hands FROM (
    SELECT i/6 h,jsonb_agg(deck->i ORDER BY i) hand FROM generate_series(0,29) i GROUP BY i/6
  ) rows;
  SELECT jsonb_agg(deck->i ORDER BY i) INTO stock FROM generate_series(30,34) i;
  RETURN s||jsonb_build_object('round',round_i,'roundId',(s->>'runId')||':'||round_i,
    'hands',hands,'discardMasks','[0,0,0,0,0]'::jsonb,'stock',stock,'stockIndex',0,'cut',deck->35,
    'swapsLeft',3,'phase','discard','deadline',at_ms+(s#>>'{config,durationMs}')::integer,'phaseUntil',NULL);
END $$;

CREATE OR REPLACE FUNCTION private.crib_lab_lock_v1(s jsonb, expired boolean) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE h integer; i integer; mask_i integer; kept jsonb; hands jsonb:='[]';
BEGIN
  FOR h IN 0..4 LOOP
    mask_i:=(s->'discardMasks'->>h)::int;
    IF expired THEN
      -- Fill from the right. Keep every already admitted discard selection.
      FOR i IN REVERSE 5..0 LOOP
        EXIT WHEN bit_count(mask_i::bit(6))=2;
        mask_i:=mask_i|(1<<i);
      END LOOP;
    END IF;
    IF bit_count(mask_i::bit(6))<>2 THEN RAISE EXCEPTION 'arcade:incomplete_discards'; END IF;
    SELECT jsonb_agg(s->'hands'->h->i1 ORDER BY i1) INTO kept FROM generate_series(0,5) i1 WHERE (mask_i & (1<<i1))=0;
    hands:=hands||jsonb_build_array(kept);
  END LOOP;
  RETURN s||jsonb_build_object('hands',hands,'phase','stock');
END $$;

CREATE OR REPLACE FUNCTION private.crib_lab_multiplier_v1(remaining_ms bigint,duration_ms integer) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
  SELECT 100+(200*greatest(0,least(duration_ms,remaining_ms))/duration_ms)::integer
$$;

CREATE OR REPLACE FUNCTION private.crib_lab_score_v1(s jsonb, at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE hands jsonb; base integer; award integer; result jsonb;
  multiplier integer:=private.crib_lab_multiplier_v1((s->>'deadline')::bigint-at_ms,(s#>>'{config,durationMs}')::integer);
BEGIN
  IF s->>'phase'='scoring' THEN RETURN s; END IF;
  IF s->>'phase'='discard' THEN s:=private.crib_lab_lock_v1(s,true); END IF;
  SELECT jsonb_agg(points ORDER BY n),sum((points->>'total')::integer) INTO hands,base FROM (
    SELECT n,private.cribbage_hand_score(hand,s->'cut',false) points
    FROM jsonb_array_elements(s->'hands') WITH ORDINALITY AS t(hand,n)
  ) counts;
  award:=base*multiplier;
  result:=jsonb_build_object('id',s->'roundId','hands',hands,'base',base,'multiplier',multiplier,'award',award,
    'before',s->'score','cumulative',(s->>'score')::integer+award,'scoredAt',at_ms);
  RETURN s||jsonb_build_object('results',(s->'results')||jsonb_build_array(result),'score',result->'cumulative',
    'stockIndex',5,'phase','scoring','phaseUntil',at_ms+10000,'status',CASE WHEN (s->>'round')::integer=3 THEN 'completed' ELSE 'active' END);
END $$;

CREATE OR REPLACE FUNCTION private.crib_lab_action_v1(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE
  phase text:=s->>'phase'; h integer:=items[1]; i integer:=items[2]; h2 integer:=items[3]; i2 integer:=items[4];
  n integer:=cardinality(items); idx integer:=(s->>'stockIndex')::integer; mask_i integer; card jsonb;
BEGIN
  IF action='abandon' AND n=0 THEN RETURN s||'{"status":"abandoned"}'::jsonb; END IF;
  IF phase='discard' AND action='select' AND n=2 AND h BETWEEN 0 AND 4 AND i BETWEEN 0 AND 5 THEN
    mask_i:=(s->'discardMasks'->>h)::int # (1<<i);
    IF bit_count(mask_i::bit(6))>2 THEN RAISE EXCEPTION 'arcade:two_discards'; END IF;
    RETURN jsonb_set(s,ARRAY['discardMasks',h::text],to_jsonb(mask_i));
  ELSIF phase='discard' AND action='lock' AND n=0 THEN RETURN private.crib_lab_lock_v1(s,false);
  ELSIF phase='stock' AND ((action='pass' AND n=0) OR (action='replace' AND n=2 AND h BETWEEN 0 AND 4 AND i BETWEEN 0 AND 3)) THEN
    IF action='replace' THEN s:=jsonb_set(s,ARRAY['hands',h::text,i::text],s->'stock'->idx); END IF;
    RETURN s||jsonb_build_object('stockIndex',idx+1,'phase',CASE WHEN idx=4 THEN 'cut' ELSE 'stock' END,
      'phaseUntil',CASE WHEN idx=4 THEN least(at_ms+1000,(s->>'deadline')::bigint) END);
  ELSIF phase='swap' AND action='swap' AND n=4 AND h BETWEEN 0 AND 4 AND h2 BETWEEN 0 AND 4 AND h<>h2
      AND i BETWEEN 0 AND 3 AND i2 BETWEEN 0 AND 3 AND (s->>'swapsLeft')::int>0 THEN
    card:=s->'hands'->h->i;
    s:=jsonb_set(s,ARRAY['hands',h::text,i::text],s->'hands'->h2->i2);
    s:=jsonb_set(s,ARRAY['hands',h2::text,i2::text],card)||jsonb_build_object('swapsLeft',(s->>'swapsLeft')::integer-1);
    IF (s->>'swapsLeft')::int=0 THEN RETURN private.crib_lab_score_v1(s,at_ms); END IF;
    RETURN s;
  ELSIF phase='swap' AND action='stand' AND n=0 THEN RETURN private.crib_lab_score_v1(s,at_ms);
  END IF;
  RAISE EXCEPTION 'arcade:illegal_action';
END $$;

CREATE OR REPLACE FUNCTION private.crib_lab_advance_v1(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
BEGIN
  WHILE s->>'status'='active' LOOP
    IF s->>'phase'='scoring' THEN
      EXIT WHEN at_ms<(s->>'phaseUntil')::bigint;
      s:=private.crib_lab_deal_v1(s,(s->>'round')::integer+1,(s->>'phaseUntil')::bigint);
    ELSIF at_ms>=(s->>'deadline')::bigint THEN
      s:=private.crib_lab_score_v1(s,(s->>'deadline')::bigint);
    ELSIF s->>'phase'='cut' AND at_ms>=(s->>'phaseUntil')::bigint THEN
      s:=s||'{"phase":"swap","phaseUntil":null}'::jsonb;
    ELSE EXIT;
    END IF;
  END LOOP;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION private.crib_lab_valid_completion_v1(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE r jsonb; cumulative integer:=0; subtotal integer; i integer:=0;
BEGIN
  IF s->>'phase' IS DISTINCT FROM 'scoring' OR s->>'round' IS DISTINCT FROM '3' OR jsonb_array_length(s->'results') IS DISTINCT FROM 3 THEN RETURN false; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(s->'results') LOOP
    i:=i+1;
    SELECT sum((h->>'total')::integer) INTO subtotal FROM jsonb_array_elements(r->'hands') h;
    IF r->>'id' IS DISTINCT FROM (s->>'runId')||':'||i OR jsonb_array_length(r->'hands') IS DISTINCT FROM 5
      OR subtotal IS NULL OR (r->>'base')::integer IS DISTINCT FROM subtotal OR (r->>'before')::integer IS DISTINCT FROM cumulative
      OR (r->>'multiplier')::int NOT BETWEEN 100 AND 300 OR (r->>'multiplier') IS NULL
      OR (r->>'award')::integer IS DISTINCT FROM subtotal*(r->>'multiplier')::integer THEN RETURN false; END IF;
    cumulative:=cumulative+(r->>'award')::integer;
    IF (r->>'cumulative')::integer IS DISTINCT FROM cumulative THEN RETURN false; END IF;
  END LOOP;
  RETURN (s->>'score')::integer=cumulative;
END $$;

DO $$
DECLARE definition text; anchor text:=' IF run.game=''quintzee'' AND status_i=''completed''';
BEGIN
  definition:=pg_get_functiondef('public.arcade_commit(uuid,uuid,bigint,jsonb,bigint,uuid,text,uuid)'::regprocedure);
  IF position('private.crib_lab_valid_completion_v1' IN definition)=0 THEN
    IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'arcade:commit_registration_changed'; END IF;
    EXECUTE replace(definition,anchor,' IF run.game=''crib-lab'' AND status_i=''completed'' AND private.crib_lab_valid_completion_v1(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION ''arcade:invalid_completion''; END IF;'||chr(10)||anchor);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_crib_lab_step(p_actor uuid,p_run uuid,p_revision bigint DEFAULT NULL,p_round text DEFAULT NULL,
  p_request uuid DEFAULT NULL,p_action text DEFAULT NULL,p_items integer[] DEFAULT '{}',p_token uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE run private.arcade_runs; receipt private.arcade_command_receipts; s jsonb; at_ms bigint; due bigint;
  fingerprint text; outcome text:='current'; command_id uuid; phase text; projection jsonb;
BEGIN
  IF p_actor IS NULL THEN
    IF p_action IS NOT NULL OR NOT EXISTS(SELECT FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN
      RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';
    END IF;
  ELSE
    PERFORM private.require_account_enabled(p_actor);
    IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
  IF NOT FOUND OR run.game<>'crib-lab' OR (p_actor IS NOT NULL AND p_actor<>run.user_id) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501'; END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  IF p_action IS NOT NULL THEN
    IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_items IS NULL OR array_position(p_items,NULL) IS NOT NULL THEN RAISE EXCEPTION 'arcade:invalid_command'; END IF;
    fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_items)::text;
    SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
    IF FOUND THEN
      IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict'; END IF;
      outcome:='duplicate';
    END IF;
  END IF;
  s:=run.state;
  IF run.status='active' THEN
    IF s IS NULL THEN
      s:=private.crib_lab_deal_v1(jsonb_build_object('runId',run.id,'userId',run.user_id,'status','active','config',run.config,'score',0,'results','[]'::jsonb),
        1,floor(extract(epoch FROM run.created_at)*1000)::bigint);
    END IF;
    s:=private.crib_lab_advance_v1(s,at_ms);
  END IF;
  IF p_action IS NOT NULL AND outcome<>'duplicate' THEN
    IF s IS DISTINCT FROM run.state OR run.status<>'active' OR p_revision<>run.revision OR p_round IS DISTINCT FROM s->>'roundId' THEN outcome:='stale';
    ELSE
      s:=private.crib_lab_action_v1(s,p_action,p_items,at_ms);
      command_id:=p_request; outcome:='committed';
    END IF;
  END IF;
  phase:=s->>'phase';
  due:=coalesce((s->>'phaseUntil')::bigint,(s->>'deadline')::bigint);
  IF s IS DISTINCT FROM run.state THEN
    PERFORM public.arcade_commit(p_actor,p_run,run.revision,s,due,command_id,fingerprint,p_token);
    SELECT * INTO STRICT run FROM private.arcade_runs WHERE id=p_run;
  END IF;
  -- Explicit allowlist. No unoffered card or concealed starter crosses this boundary.
  projection:=jsonb_build_object('id',run.id,'revision',run.revision,'status',run.status,'ruleset',run.ruleset,
    'serverAt',at_ms,'round',s->'round','roundId',s->'roundId','score',s->'score','phase',phase,'hands',s->'hands',
    'discardMasks',s->'discardMasks','stockLeft',5-(s->>'stockIndex')::integer,'swapsLeft',s->'swapsLeft',
    'offer',CASE WHEN phase='stock' THEN s->'stock'->((s->>'stockIndex')::integer) END,
    'cut',CASE WHEN phase IN ('cut','swap','scoring') THEN s->'cut' END,'durationMs',run.config->'durationMs',
    'deadline',s->'deadline','phaseUntil',s->'phaseUntil','result',CASE WHEN phase='scoring' THEN s->'results'->-1 END,
    'completion',(SELECT record FROM private.arcade_results WHERE run_id=run.id));
  RETURN jsonb_build_object('outcome',outcome,'record',jsonb_build_object('id',run.id,'revision',run.revision,'status',run.status),'projection',projection);
END $$;

REVOKE ALL ON FUNCTION private.crib_lab_deal_v1(jsonb,integer,bigint),private.crib_lab_lock_v1(jsonb,boolean),
  private.crib_lab_multiplier_v1(bigint,integer),private.crib_lab_score_v1(jsonb,bigint),
  private.crib_lab_action_v1(jsonb,text,integer[],bigint),private.crib_lab_advance_v1(jsonb,bigint),
  private.crib_lab_valid_completion_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.arcade_crib_lab_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_crib_lab_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) TO service_role;
