-- Crib Lab Polish Pass 1. Install with v2 admission closed. Existing runs freeze their version.
CREATE OR REPLACE FUNCTION private.crib_lab_register_duration() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE active_version text; v text; board_id text; cfg jsonb;
BEGIN
  SELECT config->>'version' INTO active_version FROM private.arcade_rulesets WHERE game='crib-lab' AND enabled;
  FOREACH v IN ARRAY ARRAY['crib-lab/1','crib-lab/2'] LOOP
    board_id:=v||CASE WHEN NEW.crib_lab_round_seconds=240 THEN '' ELSE '-duration-'||NEW.crib_lab_round_seconds END;
    cfg:=jsonb_build_object('version',v,'durationMs',NEW.crib_lab_round_seconds*1000);
    INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES(board_id,'crib-lab',cfg,false) ON CONFLICT(id) DO NOTHING;
    IF NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id=board_id AND game='crib-lab' AND config=cfg) THEN RAISE EXCEPTION 'arcade:rules_conflict'; END IF;
    IF active_version=v THEN
      UPDATE private.arcade_rulesets SET enabled=false WHERE game='crib-lab' AND enabled AND id<>board_id;
      UPDATE private.arcade_rulesets SET enabled=true WHERE id=board_id AND NOT enabled;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crib_lab_duration ON public.game_defaults;
CREATE TRIGGER crib_lab_duration AFTER INSERT OR UPDATE OF crib_lab_round_seconds ON public.game_defaults
FOR EACH ROW WHEN (NEW.game_type='crib-lab') EXECUTE FUNCTION private.crib_lab_register_duration();
INSERT INTO private.arcade_rulesets(id,game,config,enabled)
SELECT 'crib-lab/2'||CASE WHEN crib_lab_round_seconds=240 THEN '' ELSE '-duration-'||crib_lab_round_seconds END,
  'crib-lab',jsonb_build_object('version','crib-lab/2','durationMs',crib_lab_round_seconds*1000),false
FROM public.game_defaults WHERE game_type='crib-lab' ON CONFLICT(id) DO NOTHING;

-- Card bits 0..3 are hand positions. Bit 4 is the shared starter.
-- These descriptors illustrate the pre-existing scorer's award; they never award points.
CREATE OR REPLACE FUNCTION private.crib_lab_combinations(hand jsonb, starter jsonb)
RETURNS TABLE(kind text,mask integer,points integer) LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  WITH cards AS (
    SELECT (n-1)::int pos,private.cribbage_rank_value(c->>'rank') rank,private.cribbage_card_value(c) val,c->>'suit' suit
    FROM jsonb_array_elements(hand||jsonb_build_array(starter)) WITH ORDINALITY AS t(c,n)
  ), subsets AS (
    SELECT m,count(*)::int n,sum(val) pip,min(rank) lo,max(rank) hi,count(DISTINCT rank) ranks,count(DISTINCT suit) suits
    FROM generate_series(1,31) m JOIN cards ON (m&(1<<pos))<>0 GROUP BY m
  ), runs AS (
    SELECT *,max(n) OVER () longest FROM subsets WHERE n>=3 AND ranks=n AND hi-lo+1=n
  ), events AS (
    SELECT 1 seq,'fifteen' kind,m,2 pts FROM subsets WHERE pip=15
    UNION ALL SELECT 2,'pair',m,2 FROM subsets WHERE n=2 AND ranks=1
    UNION ALL SELECT 3,'run',m,n FROM runs WHERE n=longest
    UNION ALL SELECT 4,'flush',m,n FROM subsets WHERE suits=1 AND (m=31 OR m=15 AND NOT EXISTS(SELECT FROM subsets WHERE m=31 AND suits=1))
    UNION ALL SELECT 5,'nobs',(1<<pos)|16,1 FROM cards WHERE pos<4 AND rank=11 AND suit=starter->>'suit'
  ) SELECT kind,m,pts FROM events ORDER BY seq,m
$$;

-- Internal presentation policy. Change to 'hands' to use the ten-second hand sequence.
-- Each scoring receipt freezes its own script and duration, including across refresh.
CREATE OR REPLACE FUNCTION private.crib_lab_count_policy() RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 'combinations'::text $$;

CREATE OR REPLACE FUNCTION private.crib_lab_count_receipt(s jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE r jsonb:=s->'results'->-1; beats jsonb:='[]'; clock_ms int:=0; bank int:=0; h int;
  e record; subtotal int; hand_start int; ms int; step_ms constant int:=450;
BEGIN
  IF private.crib_lab_count_policy()='hands' THEN RETURN s; END IF;
  FOR h IN 0..4 LOOP
    subtotal:=(r->'hands'->h->>'total')::int;hand_start:=bank;
    FOR e IN SELECT * FROM private.crib_lab_combinations(s->'hands'->h,s->'cut') LOOP
      beats:=beats||jsonb_build_object('hand',h,'kind',e.kind,'mask',e.mask,'points',e.points,'from',bank,'at',clock_ms,'ms',step_ms);
      bank:=bank+e.points;clock_ms:=clock_ms+step_ms;
    END LOOP;
    -- If presentation ever disagrees with the scorer, retain its award and original hand timeline.
    IF bank-hand_start<>subtotal THEN RETURN s; END IF;
    ms:=CASE WHEN subtotal=0 THEN 240 ELSE 480 END;
    beats:=beats||jsonb_build_object('hand',h,'kind','subtotal','mask',0,'points',subtotal,'from',bank,'at',clock_ms,'ms',ms);
    clock_ms:=clock_ms+ms;
  END LOOP;
  IF bank<>(r->>'base')::int THEN RETURN s; END IF;
  r:=r||jsonb_build_object('presentation',jsonb_build_object('beats',beats,'baseAt',clock_ms,
    'awardAt',clock_ms+750,'totalAt',clock_ms+2450,'endAt',clock_ms+3950));
  RETURN jsonb_set(s,'{results,-1}',r)||jsonb_build_object('phaseUntil',(r->>'scoredAt')::bigint+clock_ms+3950);
END $$;

CREATE OR REPLACE FUNCTION private.crib_lab_hold_v2(s jsonb,phase_i text,starts bigint,ms integer)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT s||jsonb_build_object('phase',phase_i,'phaseUntil',starts+ms,'deadline',(s->>'deadline')::bigint+ms,
    'transition',jsonb_build_object('id',(s->>'roundId')||':'||phase_i,'phase',phase_i,'startsAt',starts,'endsAt',starts+ms))
$$;

CREATE OR REPLACE FUNCTION private.crib_lab_deal(s jsonb,round_i int,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
BEGIN
  s:=private.crib_lab_deal_v1(s-'transition',round_i,at_ms);
  IF s#>>'{config,version}'='crib-lab/2' THEN RETURN private.crib_lab_hold_v2(s,'discard',at_ms,1100); END IF;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION private.crib_lab_action(s jsonb,action text,items int[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE next_s jsonb;
BEGIN
  IF s#>>'{config,version}'<>'crib-lab/2' THEN RETURN private.crib_lab_action_v1(s,action,items,at_ms); END IF;
  IF action<>'abandon' AND s ? 'transition' THEN RAISE EXCEPTION 'arcade:phase_transition'; END IF;
  next_s:=private.crib_lab_action_v1(s,action,items,at_ms);
  IF action='abandon' THEN RETURN next_s; END IF;
  IF next_s->>'phase'='scoring' THEN RETURN private.crib_lab_count_receipt(next_s); END IF;
  IF next_s->>'phase'='cut' THEN RETURN private.crib_lab_hold_v2(next_s,'cut',at_ms,1000); END IF;
  IF action='lock' THEN RETURN private.crib_lab_hold_v2(next_s,'stock',at_ms,1100); END IF;
  RETURN next_s;
END $$;

CREATE OR REPLACE FUNCTION private.crib_lab_advance(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE boundary bigint;
BEGIN
  IF s#>>'{config,version}'<>'crib-lab/2' THEN RETURN private.crib_lab_advance_v1(s,at_ms); END IF;
  WHILE s->>'status'='active' LOOP
    boundary:=(s->>'phaseUntil')::bigint;
    IF boundary IS NOT NULL THEN
      EXIT WHEN at_ms<boundary;
      CASE s->>'phase'
        WHEN 'scoring' THEN s:=private.crib_lab_deal(s,(s->>'round')::int+1,boundary);
        WHEN 'cut' THEN s:=private.crib_lab_hold_v2(s,'swap',boundary,1100);
        ELSE s:=(s-'transition')||'{"phaseUntil":null}'::jsonb;
      END CASE;
    ELSIF at_ms>=(s->>'deadline')::bigint THEN
      s:=private.crib_lab_count_receipt(private.crib_lab_score_v1(s,(s->>'deadline')::bigint));
    ELSE EXIT;
    END IF;
  END LOOP;
  RETURN s;
END $$;

-- Keep the same locked step, user checks, projection allowlist and receipt ownership.
DO $register$
DECLARE f text:=pg_get_functiondef('public.arcade_crib_lab_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)'::regprocedure);
  owner text;
BEGIN
  IF position('private.crib_lab_deal(' IN f)>0 THEN RETURN; END IF;
  FOREACH owner IN ARRAY ARRAY['deal','action','advance'] LOOP
    IF position('private.crib_lab_'||owner||'_v1(' IN f)=0 THEN RAISE EXCEPTION 'crib_lab:step_changed'; END IF;
    f:=replace(f,'private.crib_lab_'||owner||'_v1(','private.crib_lab_'||owner||'(');
  END LOOP;
  IF position('RETURN jsonb_build_object(''outcome'',outcome' IN f)=0 THEN RAISE EXCEPTION 'crib_lab:projection_changed'; END IF;
  EXECUTE replace(f,'RETURN jsonb_build_object(''outcome'',outcome',
    'IF run.config->>''version''=''crib-lab/2'' THEN projection:=projection||jsonb_build_object(''transition'',s->''transition''); END IF;
  RETURN jsonb_build_object(''outcome'',outcome');
END $register$;
REVOKE ALL ON FUNCTION private.crib_lab_register_duration(),private.crib_lab_combinations(jsonb,jsonb),
  private.crib_lab_count_policy(),private.crib_lab_count_receipt(jsonb),private.crib_lab_hold_v2(jsonb,text,bigint,integer),
  private.crib_lab_deal(jsonb,integer,bigint),private.crib_lab_action(jsonb,text,integer[],bigint),private.crib_lab_advance(jsonb,bigint)
FROM PUBLIC,anon,authenticated,service_role;
