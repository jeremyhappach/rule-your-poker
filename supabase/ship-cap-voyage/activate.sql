-- DO NOT EXECUTE without Jeremy's explicit production publication approval.
-- Apply the reviewed migration and publish matching client/recovery code first.
BEGIN;
UPDATE private.arcade_rulesets SET enabled=true WHERE id='ship-cap-voyage/1' AND game='ship-cap-voyage';
COMMIT;
