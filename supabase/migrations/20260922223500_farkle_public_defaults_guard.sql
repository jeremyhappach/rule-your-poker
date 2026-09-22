-- Validate edits to Farkle Admin Defaults before they can affect new dealer games.
-- Existing dealer_games.config snapshots and all other game_defaults rows are unchanged.
CREATE OR REPLACE FUNCTION private.farkle_admin_defaults_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE rules jsonb;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.game_type='farkle' THEN RAISE EXCEPTION 'farkle:defaults_required' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND OLD.game_type='farkle' AND NEW.game_type<>'farkle' THEN
    RAISE EXCEPTION 'farkle:defaults_required' USING ERRCODE='23514';
  END IF;
  IF NEW.game_type<>'farkle' THEN RETURN NEW; END IF;
  -- The resolver holds the shared side of this lock through creation/commit.
  PERFORM pg_advisory_xact_lock(19092026,1);
  rules:=NEW.farkle_rules;
  IF rules IS NULL OR jsonb_typeof(rules)<>'object'
    OR (rules-ARRAY['scoring','endgame','botPolicy','botBankThreshold'])<>'{}'::jsonb
    OR NOT rules ?& ARRAY['scoring','endgame','botPolicy','botBankThreshold']
    OR coalesce(rules->>'endgame','') NOT IN ('immediate','equal_turns','one_last_turn')
    OR coalesce(rules->>'botPolicy','')<>'balanced'
    OR jsonb_typeof(rules->'botBankThreshold') IS DISTINCT FROM 'number'
    OR (rules->>'botBankThreshold') !~ '^[1-9][0-9]*$'
    OR (rules->>'botBankThreshold')::numeric>1000000000
    OR NEW.ante_amount NOT BETWEEN 1 AND 1000000
    OR NEW.points_to_win NOT BETWEEN 1 AND 1000000000
    OR NEW.decision_timer_seconds NOT BETWEEN 5 AND 60
    OR NEW.bot_decision_delay_seconds NOT BETWEEN 0.001 AND 10
    OR mod(NEW.bot_decision_delay_seconds*1000,1)<>0
  THEN RAISE EXCEPTION 'farkle:invalid_admin_defaults' USING ERRCODE='23514'; END IF;
  PERFORM private.farkle_validate_rules_v1(rules->'scoring');
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION private.farkle_admin_defaults_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS farkle_admin_defaults_guard ON public.game_defaults;
CREATE TRIGGER farkle_admin_defaults_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.game_defaults
FOR EACH ROW EXECUTE FUNCTION private.farkle_admin_defaults_guard_v1();

DO $verify$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM private.farkle_release WHERE singleton AND creation_enabled AND admin_only AND production_defaults_approved)
    OR NOT EXISTS (SELECT 1 FROM public.game_defaults WHERE game_type='farkle'
      AND points_to_win=10000 AND decision_timer_seconds=60 AND farkle_rules->>'botPolicy'='balanced')
  THEN RAISE EXCEPTION 'farkle:public_guard_precondition_failed'; END IF;
END $verify$;
