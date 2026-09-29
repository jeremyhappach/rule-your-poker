import { readFileSync } from 'node:fs';

// Only the pg_temp copies are installed by the resulting rollback transaction.
const candidate = readFileSync(new URL('./authority.sql', import.meta.url), 'utf8')
  .replaceAll('private.waiting_start_is_blocked', 'pg_temp.waiting_start_is_blocked')
  .replaceAll('public.get_waiting_start_blocked', 'pg_temp.get_waiting_start_blocked')
  .replace('FUNCTION public.begin_session_dealer_selection(', 'FUNCTION pg_temp.waiting_start_candidate(');
const proof = readFileSync(new URL('./proof.sql', import.meta.url), 'utf8');
process.stdout.write(`BEGIN;
SET LOCAL statement_timeout='45s';
CREATE TEMP TABLE waiting_start_bootstrap(x integer);
DO $capture$
BEGIN
 EXECUTE replace(pg_get_functiondef('public.begin_session_dealer_selection(uuid)'::regprocedure),
   'FUNCTION public.begin_session_dealer_selection(', 'FUNCTION pg_temp.waiting_start_baseline(');
END $capture$;
${candidate}
${proof}
ROLLBACK;
`);
