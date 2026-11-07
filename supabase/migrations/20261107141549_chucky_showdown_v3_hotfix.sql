-- Frozen v3 bonuses; v1/v2 configuration and historical results are untouched.
CREATE OR REPLACE FUNCTION private.chucky_showdown_bonus(config jsonb,level_i integer) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF level_i NOT BETWEEN 1 AND 7 OR level_i IS NULL THEN RAISE EXCEPTION 'chucky_showdown:invalid_level'; END IF;
 IF config->>'version'='chucky-showdown/3' THEN
   IF config->'winBonuses' IS DISTINCT FROM '[100,250,500,800,1250,2000,3000]'::jsonb THEN RAISE EXCEPTION 'chucky_showdown:invalid_bonuses'; END IF;
   RETURN (config->'winBonuses'->>(level_i-1))::int;
 END IF;
 RETURN 100*level_i;
END $$;
REVOKE ALL ON FUNCTION private.chucky_showdown_bonus(jsonb,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.chucky_showdown_config_v3(d public.game_defaults) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT private.chucky_showdown_config_v2(d)||jsonb_build_object('version','chucky-showdown/3','winBonuses','[100,250,500,800,1250,2000,3000]'::jsonb)
$$;
CREATE OR REPLACE FUNCTION private.chucky_showdown_id_v3(c jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT replace(private.chucky_showdown_id_v2(c),'chucky-showdown/2','chucky-showdown/3')
$$;
CREATE OR REPLACE FUNCTION private.chucky_showdown_defaults_v3()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c jsonb:=private.chucky_showdown_config_v3(NEW); target text:=private.chucky_showdown_id_v3(c); is_open boolean;
BEGIN
  IF NEW.decision_timer_seconds NOT BETWEEN 5 AND 60 OR NEW.decision_timer_seconds IS NULL THEN RAISE EXCEPTION 'chucky_showdown:invalid_duration'; END IF;
  SELECT EXISTS(SELECT FROM private.arcade_rulesets WHERE game='chucky-showdown' AND enabled AND config->>'version'='chucky-showdown/3') INTO is_open;
  INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES(target,'chucky-showdown',c,false) ON CONFLICT(id) DO NOTHING;
  IF NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id=target AND config=c AND game='chucky-showdown') THEN RAISE EXCEPTION 'arcade:rules_conflict'; END IF;
  IF is_open THEN
    UPDATE private.arcade_rulesets SET enabled=false WHERE game='chucky-showdown' AND enabled AND id<>target;
    UPDATE private.arcade_rulesets SET enabled=true WHERE id=target AND NOT enabled;
  END IF;
  RETURN NEW;
END $function$
;
DROP TRIGGER IF EXISTS chucky_showdown_v3_settings ON public.game_defaults;
CREATE TRIGGER chucky_showdown_v3_settings AFTER INSERT OR UPDATE OF decision_timer_seconds,chucky_selection_seconds,chucky_max_folds,chucky_max_cracks ON public.game_defaults
FOR EACH ROW WHEN (NEW.game_type='chucky-showdown') EXECUTE FUNCTION private.chucky_showdown_defaults_v3();
REVOKE ALL ON FUNCTION private.chucky_showdown_config_v3(public.game_defaults),private.chucky_showdown_id_v3(jsonb),private.chucky_showdown_defaults_v3() FROM PUBLIC,anon,authenticated;
INSERT INTO private.arcade_rulesets(id,game,config,enabled)
 SELECT private.chucky_showdown_id_v3(c),'chucky-showdown',c,false FROM
 (SELECT private.chucky_showdown_config_v3(d) c FROM public.game_defaults d WHERE game_type='chucky-showdown') seed ON CONFLICT(id) DO NOTHING;
DO $stage$ BEGIN
 IF NOT EXISTS(SELECT FROM public.game_defaults d JOIN private.arcade_rulesets r ON r.id=private.chucky_showdown_id_v3(private.chucky_showdown_config_v3(d)) AND r.config=private.chucky_showdown_config_v3(d) WHERE d.game_type='chucky-showdown') THEN RAISE EXCEPTION 'arcade:rules_conflict'; END IF;
END $stage$;

-- Extend the existing owner in place; fail closed if its expected boundary changed.
DO $patch$ DECLARE f text:=pg_get_functiondef('private.chucky_showdown_advance_v2(jsonb,bigint)'::regprocedure); a text:=$anchor$risk_i+100*level_i$anchor$; b text:=$replacement$risk_i+private.chucky_showdown_bonus(s->'config',level_i)$replacement$;
BEGIN
 IF position(b IN f)>0 THEN RETURN; END IF;
 IF (length(f)-length(replace(f,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'chucky_v3:owner_drift:private.chucky_showdown_advance_v2'; END IF;
 EXECUTE replace(f,a,b);
END $patch$;

-- Extend the existing owner in place; fail closed if its expected boundary changed.
DO $patch$ DECLARE f text:=pg_get_functiondef('private.chucky_showdown_valid_completion_v2(jsonb)'::regprocedure); a text:=$anchor$points+100*play$anchor$; b text:=$replacement$points+private.chucky_showdown_bonus(s->'config',play)$replacement$;
BEGIN
 IF position(b IN f)>0 THEN RETURN; END IF;
 IF (length(f)-length(replace(f,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'chucky_v3:owner_drift:private.chucky_showdown_valid_completion_v2'; END IF;
 EXECUTE replace(f,a,b);
END $patch$;

-- Extend the existing owner in place; fail closed if its expected boundary changed.
DO $patch$ DECLARE f text:=pg_get_functiondef('private.chucky_showdown_act_v2(jsonb,text,integer,bigint)'::regprocedure); a text:=$anchor$IF action='fold' THEN$anchor$; b text:=$replacement$IF action='fold' THEN
     s:=s||jsonb_build_object('lastFold',private.chucky_showdown_scene_v2(s)||jsonb_build_object('phase','fold','since',at_ms,'due',at_ms));$replacement$;
BEGIN
 IF position(b IN f)>0 THEN RETURN; END IF;
 IF (length(f)-length(replace(f,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'chucky_v3:owner_drift:private.chucky_showdown_act_v2'; END IF;
 EXECUTE replace(f,a,b);
END $patch$;

-- Extend the existing owner in place; fail closed if its expected boundary changed.
DO $patch$ DECLARE f text:=pg_get_functiondef('public.arcade_chucky_showdown_step(uuid,uuid,bigint,text,uuid,text,integer,uuid)'::regprocedure); a text:=$anchor$run.config->>'version'='chucky-showdown/2'$anchor$; b text:=$replacement$run.config->>'version' IN ('chucky-showdown/2','chucky-showdown/3')$replacement$;
BEGIN
 IF position(b IN f)>0 THEN RETURN; END IF;
 IF (length(f)-length(replace(f,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'chucky_v3:owner_drift:public.arcade_chucky_showdown_step'; END IF;
 EXECUTE replace(f,a,b);
END $patch$;

-- Extend the existing owner in place; fail closed if its expected boundary changed.
DO $patch$ DECLARE f text:=pg_get_functiondef('public.arcade_chucky_showdown_step(uuid,uuid,bigint,text,uuid,text,integer,uuid)'::regprocedure); a text:=$anchor$'lastRound',s->'lastRound',$anchor$; b text:=$replacement$'lastRound',s->'lastRound','lastFold',s->'lastFold',$replacement$;
BEGIN
 IF position(b IN f)>0 THEN RETURN; END IF;
 IF (length(f)-length(replace(f,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'chucky_v3:owner_drift:public.arcade_chucky_showdown_step'; END IF;
 EXECUTE replace(f,a,b);
END $patch$;

-- Extend the existing owner in place; fail closed if its expected boundary changed.
DO $patch$ DECLARE f text:=pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='arcade_commit')); a text:=$anchor$run.config->>'version'='chucky-showdown/2'$anchor$; b text:=$replacement$run.config->>'version' IN ('chucky-showdown/2','chucky-showdown/3')$replacement$;
BEGIN
 IF position(b IN f)>0 THEN RETURN; END IF;
 IF (length(f)-length(replace(f,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'chucky_v3:owner_drift:public.arcade_commit'; END IF;
 EXECUTE replace(f,a,b);
END $patch$;

-- Extend the existing owner in place; fail closed if its expected boundary changed.
DO $patch$ DECLARE f text:=pg_get_functiondef('private.chucky_showdown_defaults_v1()'::regprocedure); a text:=$anchor$config->>'version'='chucky-showdown/2'$anchor$; b text:=$replacement$config->>'version' IN ('chucky-showdown/2','chucky-showdown/3')$replacement$;
BEGIN
 IF position(b IN f)>0 THEN RETURN; END IF;
 IF (length(f)-length(replace(f,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'chucky_v3:owner_drift:private.chucky_showdown_defaults_v1'; END IF;
 EXECUTE replace(f,a,b);
END $patch$;
