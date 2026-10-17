-- Publish the compatible client first. Both modes select this shared new default.
BEGIN;
SET LOCAL lock_timeout='100ms';
SET LOCAL statement_timeout='3s';
-- Existing admissions finish on their frozen registry view before the switch.
LOCK TABLE private.arcade_rulesets IN ACCESS EXCLUSIVE MODE;
UPDATE private.arcade_rulesets SET enabled=true WHERE id='eleven-up/2';
COMMIT;
