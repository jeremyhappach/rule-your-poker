-- Shared immutable gameplay registry. Deployment stages new defaults until both workers and API are compatible.
CREATE TABLE IF NOT EXISTS private.gameplay_rulesets(id text PRIMARY KEY,game text NOT NULL,config jsonb NOT NULL);
ALTER TABLE private.gameplay_rulesets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.gameplay_rulesets FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.gameplay_rules_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'gameplay:immutable_ruleset';END $$;
DROP TRIGGER IF EXISTS gameplay_rules_immutable ON private.gameplay_rulesets;
CREATE TRIGGER gameplay_rules_immutable BEFORE UPDATE OR DELETE ON private.gameplay_rulesets FOR EACH ROW EXECUTE FUNCTION private.gameplay_rules_immutable();
REVOKE ALL ON FUNCTION private.gameplay_rules_immutable() FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO private.gameplay_rulesets VALUES('run21/2','run21',$rules$__RULES__$rules$::jsonb) ON CONFLICT DO NOTHING;
DO $$ BEGIN
 IF (SELECT config FROM private.gameplay_rulesets WHERE id='run21/2') IS DISTINCT FROM $rules$__RULES__$rules$::jsonb THEN RAISE EXCEPTION 'gameplay:ruleset_conflict';END IF;
END $$;
INSERT INTO private.arcade_rulesets(id,game,config,enabled)
 SELECT id,game,config||'{"roundDurationMs":__DURATION__,"scorePresentationMs":5000,"silverCelebrationMs":2800,"goldCelebrationMs":3800}'::jsonb,false FROM private.gameplay_rulesets WHERE id='run21/2'
 ON CONFLICT DO NOTHING;
ALTER TABLE private.run21_matches ADD COLUMN IF NOT EXISTS gameplay_ruleset text REFERENCES private.gameplay_rulesets(id);
ALTER TABLE private.run21_matches ADD COLUMN IF NOT EXISTS gameplay_config jsonb;
CREATE OR REPLACE FUNCTION private.run21_freeze_gameplay_rules() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.gameplay_ruleset IS NOT NULL THEN
  IF NEW.deck_version<>2 THEN RAISE EXCEPTION 'run21:shared_rules_require_independent_decks';END IF;
  SELECT config INTO STRICT NEW.gameplay_config FROM private.gameplay_rulesets WHERE id=NEW.gameplay_ruleset AND game='run21';
 ELSIF TG_OP='UPDATE' AND (NEW.gameplay_ruleset IS DISTINCT FROM OLD.gameplay_ruleset OR NEW.gameplay_config IS DISTINCT FROM OLD.gameplay_config) THEN
  RAISE EXCEPTION 'run21:immutable_gameplay_rules';
 END IF;
 IF NEW.gameplay_config IS NOT NULL AND NEW.state IS NOT NULL AND NEW.state->'config' IS DISTINCT FROM NEW.gameplay_config THEN RAISE EXCEPTION 'run21:gameplay_rules_conflict';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.run21_freeze_gameplay_rules() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS run21_freeze_gameplay_rules ON private.run21_matches;
CREATE TRIGGER run21_freeze_gameplay_rules BEFORE INSERT OR UPDATE ON private.run21_matches FOR EACH ROW EXECUTE FUNCTION private.run21_freeze_gameplay_rules();
