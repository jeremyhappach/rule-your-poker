-- Fail closed if the qualified configure entry point changed before installation.
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF md5(replace(pg_get_functiondef('public.quintzee_configure(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure),chr(13),''))<>'a6619af4ecf647b7c0a5e22dca3ba7bf' THEN RAISE EXCEPTION 'quintzee:unqualified_configure';END IF;
END $$;
-- Owner-approved configurable round duration: new admissions only.
-- Existing /1, /2, /3 rules and admitted configurations remain immutable.
ALTER TABLE public.game_defaults ADD COLUMN quintzee_round_seconds integer NOT NULL DEFAULT 240
 CONSTRAINT quintzee_round_seconds_bounds CHECK (quintzee_round_seconds BETWEEN 60 AND 600);

CREATE FUNCTION private.quintzee_default_rules() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE seconds_i integer;
BEGIN
 SELECT quintzee_round_seconds INTO STRICT seconds_i FROM public.game_defaults WHERE game_type='quintzee';
 RETURN private.quintzee_v3_rules(seconds_i*1000);
END $$;
REVOKE ALL ON FUNCTION private.quintzee_default_rules() FROM PUBLIC,anon,authenticated,service_role;

-- Duration selects an immutable leaderboard configuration. No scores are deleted
-- or rewritten. Returning to 180 seconds selects the original /3 board.
CREATE FUNCTION private.quintzee_duration_board(seconds_i integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rules_i jsonb; id_i text; open_i boolean;
BEGIN
 IF seconds_i IS NULL OR seconds_i NOT BETWEEN 60 AND 600 THEN RAISE EXCEPTION 'quintzee:round_duration';END IF;
 rules_i:=private.quintzee_v3_rules(seconds_i*1000);
 id_i:=CASE WHEN seconds_i=180 THEN 'quintzee/3' ELSE 'quintzee/3-duration-'||seconds_i END;
 IF EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE game='quintzee' AND enabled AND config->>'version' IS DISTINCT FROM 'quintzee/3') THEN RAISE EXCEPTION 'quintzee:active_rules_changed';END IF;
 SELECT EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE game='quintzee' AND enabled) INTO open_i;
 INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES(id_i,'quintzee',rules_i,false) ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE id=id_i AND game='quintzee' AND config=rules_i) THEN RAISE EXCEPTION 'quintzee:duration_rules_conflict';END IF;
 UPDATE private.arcade_rulesets SET enabled=(open_i AND id=id_i) WHERE game='quintzee' AND enabled IS DISTINCT FROM (open_i AND id=id_i);
END $$;
REVOKE ALL ON FUNCTION private.quintzee_duration_board(integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.quintzee_duration_defaults_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.game_type='quintzee' THEN RAISE EXCEPTION 'quintzee:defaults_required';END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD.game_type='quintzee' AND NEW.game_type IS DISTINCT FROM OLD.game_type THEN RAISE EXCEPTION 'quintzee:defaults_required';END IF;
 IF NEW.game_type='quintzee' THEN
  IF TG_OP='INSERT' THEN PERFORM private.quintzee_duration_board(NEW.quintzee_round_seconds);
  ELSIF NEW.quintzee_round_seconds IS DISTINCT FROM OLD.quintzee_round_seconds THEN PERFORM private.quintzee_duration_board(NEW.quintzee_round_seconds);
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.quintzee_duration_defaults_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER quintzee_duration_defaults_guard BEFORE INSERT OR UPDATE OR DELETE ON public.game_defaults
FOR EACH ROW EXECUTE FUNCTION private.quintzee_duration_defaults_guard();

-- Preserve all installed authorization, financial and replay checks.
DO $$ DECLARE source_i text;BEGIN
 source_i:=pg_get_functiondef('public.quintzee_configure(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure);
 IF (length(source_i)-length(replace(source_i,'private.quintzee_v3_rules()','')))/length('private.quintzee_v3_rules()')<>1 THEN RAISE EXCEPTION 'quintzee:configure_source_changed';END IF;
 EXECUTE replace(source_i,'private.quintzee_v3_rules()','private.quintzee_default_rules()');
 PERFORM private.quintzee_duration_board((SELECT quintzee_round_seconds FROM public.game_defaults WHERE game_type='quintzee'));
END $$;
