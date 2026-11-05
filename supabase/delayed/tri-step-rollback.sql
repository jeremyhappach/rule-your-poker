-- Deployment rollback plan: first publish the previous client/API (846966411).
-- Both paths share receipts/state, so in-flight retries remain compatible.
-- Leave this additive operation installed until all new API requests drain.
-- Only then, if removal is needed, run this transaction as a reviewed migration.
BEGIN;
DROP FUNCTION public.delayed_tri_step(uuid,uuid,uuid,bigint,bigint,jsonb);
DROP FUNCTION private.delayed_tri_project(jsonb,uuid);
DROP FUNCTION private.delayed_tri_transition(jsonb,jsonb);
COMMIT;
-- No state, rules, scores, receipts, results or financial rows are reverted.
