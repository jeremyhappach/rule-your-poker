import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const strip = sql => sql.replace(/^BEGIN;\s*$/gm, '').replace(/^ROLLBACK;\s*$/gm, '');
const provenance = read('supabase/tests/decision_provenance_rollback_proof.sql');
const fixture = provenance.slice(provenance.indexOf('CREATE OR REPLACE FUNCTION pg_temp.decision_proof_fixture'), provenance.indexOf('CREATE OR REPLACE FUNCTION pg_temp.decision_proof_benchmark'));
const sql = [
 'BEGIN;', "SET LOCAL lock_timeout='2s';", "SET LOCAL statement_timeout='90s';",
 read('supabase/policies/real_money_poker_timeout.sql'),
 strip(read('supabase/tests/holm_settlement_boundary_rollback_proof.sql')),
 'SET CONSTRAINTS ALL DEFERRED;', fixture,
 read('supabase/tests/all_human_auto_fold_pause_rollback_proof.sql'),
 read('supabase/tests/real_money_poker_timeout_rollback_proof.sql'),
 'SET CONSTRAINTS ALL IMMEDIATE;',
 "SELECT 'PASS' result, 'HOLM settlement/replay/terminal, fake-money aggregate policy, first real-money HOLM/357 timeout, authorized reclaim/resume and dice policy' coverage;",
 'ROLLBACK;',
].join('\n');
mkdirSync('.codex/evidence/oct24-smoke', { recursive: true });
writeFileSync('.codex/evidence/oct24-smoke/timeout-candidate.sql', sql);
console.log('Built rollback-only timeout candidate proof.');
