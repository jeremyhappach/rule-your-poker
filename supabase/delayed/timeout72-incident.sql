-- Exact owner-authorized incident repair. Replay returns existing receipts.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';
SELECT set_config('request.jwt.claim.sub','d7dc1928-3727-4351-b0ff-0e80c81c2953',true);
SELECT public.admin_restore_async_availability('2edff61e-435f-4e0c-890c-1ed5ec7b417f','3b990ac7-af90-4eb4-a718-b98ccd871e85',767,'[{"id":"38318206-7bd4-497d-8744-44af80c17a00","revision":75,"outcomeHash":"f53a50428323411dd02c6673aa58da8b"}]'::jsonb,'Jeremy approved restoration of 36-hour availability forfeits with fresh 72-hour turns and renewed push alerts on 2026-11-18');
SELECT public.admin_restore_async_availability('a4c2e884-b81b-4700-9b9b-a73f667adfab','678aebe0-29ff-4a0e-a4f1-0282ea622afc',243,'[{"id":"181f8754-2425-4802-b918-ca9c599b41a5","revision":46,"outcomeHash":"b3f13f36c6a8ecdf933a805187961358"},{"id":"a8d4272a-0b66-4f22-b712-cbad9aa89aa5","revision":4,"outcomeHash":"33ce501c2a83b869e5fb0bdc4ea8445c"},{"id":"f749e475-e29d-48e1-be9f-10499d51caf3","revision":2,"outcomeHash":"9468c89709ce384c0439f3fc1c4224e3"}]'::jsonb,'Jeremy approved restoration of 36-hour availability forfeits with fresh 72-hour turns and renewed push alerts on 2026-11-18');
SELECT public.admin_restore_async_availability('b36a32e9-bfba-43df-ae87-395b7b3a9c9b','c75914a4-aa6a-4bb8-a6d9-46ba45287805',28,'[{"id":"8664c23c-2f3f-4d13-9415-46a431e964be","revision":26,"outcomeHash":"5e5f5a630e8689f18843c925b72d7591"}]'::jsonb,'Jeremy approved restoration of 36-hour availability forfeits with fresh 72-hour turns and renewed push alerts on 2026-11-18');
COMMIT;
