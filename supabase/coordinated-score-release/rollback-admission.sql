-- Operational rollback for new admissions only. Never rewrite pinned runs,
-- receipts, historical rules or result rows. Client supports both old/new versions.
BEGIN;
SELECT private.drop357_select_ruleset('357-drop/5'::text);
UPDATE private.arcade_rulesets SET enabled=(id='horses-blitz/4') WHERE game='horses-blitz';
COMMIT;
