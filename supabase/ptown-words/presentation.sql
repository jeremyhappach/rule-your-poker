-- LOCAL REVIEW CANDIDATE ONLY. No hosted installation/publication authorized.
-- Presentation orchestration is frozen at configuration; /1 rules are unchanged.
CREATE OR REPLACE FUNCTION private.ptown_words_presentation_config() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":1,"focusMs":200,"flipMs":260,"noticeMs":1600,"holdMs":350}'::jsonb
$$;
REVOKE ALL ON FUNCTION private.ptown_words_presentation_config() FROM PUBLIC,anon,authenticated,service_role;

DO $patch$
DECLARE source text;changed text;
BEGIN
 SELECT pg_get_functiondef('public.ptown_words_configure(uuid,uuid,integer,text,jsonb,timestamp with time zone)'::regprocedure) INTO source;
 changed:=replace(source,'''rules'',private.ptown_words_rules()))','''rules'',private.ptown_words_rules(),''presentation'',private.ptown_words_presentation_config()))');
 IF changed=source THEN RAISE EXCEPTION 'Words presentation configure preimage missing';END IF;EXECUTE changed;
 SELECT pg_get_functiondef('private.ptown_words_reduce(jsonb,text,jsonb,bigint)'::regprocedure) INTO source;
 changed:=replace(source,'IF action NOT IN(''place'',''exchange'',''pass'')',
  'IF action<>''tick'' AND at_ms<coalesce((s#>>''{movePresentation,readyAt}'')::bigint,0) THEN RAISE EXCEPTION ''ptown_words:presenting_move'';END IF;'||chr(10)||' IF action NOT IN(''place'',''exchange'',''pass'')');
 IF changed=source THEN RAISE EXCEPTION 'Words presentation reducer preimage missing';END IF;EXECUTE changed;
 SELECT pg_get_functiondef('private.ptown_words_schedule_bot()'::regprocedure) INTO source;
 changed:=replace(source,'floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750','greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((NEW.state#>>''{movePresentation,readyAt}'')::bigint,0))+750');
 IF changed=source THEN RAISE EXCEPTION 'Words presentation bot preimage missing';END IF;EXECUTE changed;
 SELECT pg_get_functiondef('private.ptown_words_settle(uuid)'::regprocedure) INTO source;
 changed:=replace(source,'''startedAt'',floor(extract(epoch FROM clock_timestamp())*1000)::bigint,''deadline'',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+3000',
  '''startedAt'',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>''{movePresentation,readyAt}'')::bigint,0)),''deadline'',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>''{movePresentation,readyAt}'')::bigint,0))+3000');
 IF changed=source THEN RAISE EXCEPTION 'Words presentation terminal preimage missing';END IF;EXECUTE changed;
END $patch$;

CREATE OR REPLACE FUNCTION private.ptown_words_present_move() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE config jsonb;move jsonb;squares jsonb;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);announce_at bigint;ready_at bigint;delta bigint;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT dg.config->'presentation' INTO config FROM public.dealer_games dg WHERE dg.id=NEW.dealer_game_id;
  IF config IS NOT NULL THEN NEW.state:=NEW.state||jsonb_build_object('presentationConfig',config);END IF;
  RETURN NEW;
 END IF;
 config:=OLD.state->'presentationConfig';
 IF config IS NULL THEN RETURN NEW;END IF;
 IF NEW.paused_at IS NULL AND OLD.paused_at IS NOT NULL AND (OLD.state#>>'{movePresentation,readyAt}')::bigint>OLD.paused_at THEN
  delta:=at_ms-OLD.paused_at;
  NEW.state:=jsonb_set(NEW.state,'{movePresentation}',(NEW.state->'movePresentation')||jsonb_build_object(
   'startedAt',(OLD.state#>>'{movePresentation,startedAt}')::bigint+delta,
   'announceAt',(OLD.state#>>'{movePresentation,announceAt}')::bigint+delta,
   'readyAt',(OLD.state#>>'{movePresentation,readyAt}')::bigint+delta));
 END IF;
 IF (NEW.state->>'turn')::int<>(OLD.state->>'turn')::int+1 THEN RETURN NEW;END IF;
 NEW.state:=NEW.state-'movePresentation';move:=NEW.state->'moves'->-1;
 IF move->>'action'<>'place' THEN RETURN NEW;END IF;
 SELECT jsonb_agg(i ORDER BY i) INTO squares FROM generate_series(0,224)i WHERE OLD.state->'board'->i='null'::jsonb AND NEW.state->'board'->i<>'null'::jsonb;
 announce_at:=at_ms+(config->>'focusMs')::int+jsonb_array_length(squares)*(config->>'flipMs')::int;
 ready_at:=announce_at+(config->>'noticeMs')::int+(config->>'holdMs')::int;
 NEW.state:=NEW.state||jsonb_build_object('movePresentation',jsonb_build_object('version',1,'turn',move->'turn','playerId',move->'playerId',
  'squares',squares,'startedAt',at_ms,'announceAt',announce_at,'readyAt',ready_at,'flipMs',config->'flipMs','focusMs',config->'focusMs','noticeMs',config->'noticeMs'));
 IF NEW.state->>'phase'='playing' THEN NEW.state:=jsonb_set(NEW.state,'{deadline}',to_jsonb(ready_at+(NEW.state#>>'{rules,turnMs}')::int));END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.ptown_words_present_move() FROM PUBLIC,anon,authenticated,service_role;
-- Runs before the existing bot schedule and public revision/history publication.
CREATE TRIGGER ptown_words_00_present_move BEFORE INSERT OR UPDATE ON private.ptown_words_matches
FOR EACH ROW EXECUTE FUNCTION private.ptown_words_present_move();
