-- Versioned presentation settings; base six-card-golf/1 gameplay stays unchanged.
ALTER TABLE public.game_defaults ADD COLUMN IF NOT EXISTS golf_scoring_delay_ms integer NOT NULL DEFAULT 1200 CHECK (golf_scoring_delay_ms BETWEEN 200 AND 5000);
ALTER TABLE public.game_defaults ADD COLUMN IF NOT EXISTS golf_results_duration_ms integer NOT NULL DEFAULT 5000 CHECK (golf_results_duration_ms BETWEEN 1000 AND 30000);
CREATE OR REPLACE FUNCTION private.golf_admission_rules() RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE d public.game_defaults;BEGIN
 SELECT * INTO STRICT d FROM public.game_defaults WHERE game_type='six-card-golf';
 RETURN private.golf_rules()||jsonb_build_object('presentation',jsonb_build_object('version',1,'scoringDelayMs',d.golf_scoring_delay_ms,'resultsDurationMs',d.golf_results_duration_ms));
END $$;
CREATE OR REPLACE FUNCTION private.golf_supported_rules(r jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE p jsonb:=r->'presentation';BEGIN
 IF r=private.golf_rules() THEN RETURN true;END IF;
 RETURN coalesce(r-'presentation'=private.golf_rules() AND p=jsonb_build_object('version',1,'scoringDelayMs',(p->>'scoringDelayMs')::integer,'resultsDurationMs',(p->>'resultsDurationMs')::integer)
 AND (p->>'scoringDelayMs')::integer BETWEEN 200 AND 5000 AND (p->>'resultsDurationMs')::integer BETWEEN 1000 AND 30000,false);
 EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE OR REPLACE FUNCTION private.golf_presentation(s jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE p jsonb;b jsonb;hidden jsonb:='{}';indices jsonb;count_ms integer:=0;i integer;delay_ms integer:=(s#>>'{rules,presentation,scoringDelayMs}')::integer;
BEGIN
 FOR p IN SELECT value FROM jsonb_array_elements(s->'players') LOOP
  b:=s->'tableaus'->(p->>'id');indices:='[]';
  FOR i IN 0..5 LOOP IF NOT (b->'exposed'->>i)::boolean THEN indices:=indices||to_jsonb(i);END IF;END LOOP;
  hidden:=hidden||jsonb_build_object(p->>'id',indices);
  count_ms:=count_ms+700+2000+180+jsonb_array_length(indices)*delay_ms;
  FOR i IN 0..2 LOOP count_ms:=count_ms+delay_ms*CASE WHEN (b->'cards'->>i)::integer%13=(b->'cards'->>(i+3))::integer%13 THEN 1 ELSE 2 END;END LOOP;
 END LOOP;
 RETURN jsonb_build_object('version',1,'startedAt',at_ms,'resultsAt',at_ms+count_ms,'endsAt',at_ms+count_ms+(s#>>'{rules,presentation,resultsDurationMs}')::integer,'hidden',hidden);
END $$;
CREATE OR REPLACE FUNCTION private.golf_shift_presentation(s jsonb,delta bigint) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text;BEGIN
 IF s ? 'presentation' THEN FOREACH k IN ARRAY ARRAY['startedAt','resultsAt','endsAt'] LOOP s:=jsonb_set(s,ARRAY['presentation',k],to_jsonb((s#>>ARRAY['presentation',k])::bigint+delta));END LOOP;END IF;
 IF s ? 'terminal' THEN FOREACH k IN ARRAY ARRAY['startedAt','deadline'] LOOP s:=jsonb_set(s,ARRAY['terminal',k],to_jsonb((s#>>ARRAY['terminal',k])::bigint+delta));END LOOP;END IF;
 RETURN s||jsonb_build_object('deadline',(s->>'deadline')::bigint+delta)||CASE WHEN s ? 'startedAt' THEN jsonb_build_object('startedAt',(s->>'startedAt')::bigint+delta) ELSE '{}'::jsonb END;
END $$;
REVOKE ALL ON FUNCTION private.golf_admission_rules(),private.golf_supported_rules(jsonb),private.golf_presentation(jsonb,bigint),private.golf_shift_presentation(jsonb,bigint) FROM PUBLIC,anon,authenticated;
