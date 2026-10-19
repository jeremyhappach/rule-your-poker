-- Execute only after the matching production client is READY and each game's installed proof passes.
BEGIN;
DO $$ BEGIN
 IF public.tri_towers_capabilities(NULL)->>'version' IS DISTINCT FROM '2'
 OR public.eleven_up_capabilities(NULL)->>'version' IS DISTINCT FROM '2'
 OR public.royal_flash_capabilities(NULL)->>'version' IS DISTINCT FROM '2' THEN
  RAISE EXCEPTION 'money_admission:capability_contract_not_ready';
 END IF;
END $$;
UPDATE private.tri_towers_release SET admission_enabled=true WHERE singleton AND enabled;
UPDATE private.eleven_up_release SET admission_enabled=true WHERE singleton AND enabled;
UPDATE private.royal_flash_release SET admission_enabled=true WHERE singleton AND enabled;
COMMIT;
