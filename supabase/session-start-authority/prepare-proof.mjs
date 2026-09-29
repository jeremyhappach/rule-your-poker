import { readFileSync } from 'node:fs';

// Only the pg_temp copies are installed by the resulting rollback transaction.
const candidate = readFileSync(new URL('./authority.sql', import.meta.url), 'utf8')
  .replaceAll('private.waiting_start_is_blocked', 'pg_temp.waiting_start_is_blocked')
  .replaceAll('public.get_waiting_start_blocked', 'pg_temp.get_waiting_start_blocked')
  .replace('FUNCTION public.begin_session_dealer_selection(', 'FUNCTION pg_temp.waiting_start_candidate(');
let proof = readFileSync(new URL('./proof.sql', import.meta.url), 'utf8');
// Release qualification exercises the installed public entrypoints on the same
// disposable fixtures. No production function or pre-existing row is replaced.
if (process.argv.includes('--deployed')) {
  proof = proof
    .replace('IF candidate THEN RETURN pg_temp.waiting_start_candidate(g); END IF;',
      'IF candidate THEN RETURN public.begin_session_dealer_selection(g); END IF;')
    .replaceAll('IF pg_temp.get_waiting_start_blocked(g) THEN',
      'IF public.get_waiting_start_blocked(g) THEN')
    .replaceAll('IF NOT pg_temp.get_waiting_start_blocked(g) THEN',
      'IF NOT public.get_waiting_start_blocked(g) THEN')
    .replace("IF baseline->>'outcome' NOT IN ('started','blocked_unfinished_state') THEN",
      "IF baseline->>'outcome'<>'blocked_unfinished_state' THEN");
}
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
