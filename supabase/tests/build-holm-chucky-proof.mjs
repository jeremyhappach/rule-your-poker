// Assemble one rollback transaction with the established settlement regression.
// Usage: bun supabase/tests/build-holm-chucky-proof.mjs [candidate-migration.sql] [--stdout]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const base = readFileSync('supabase/tests/holm_settlement_boundary_rollback_proof.sql', 'utf8');
const extra = readFileSync('supabase/tests/holm_chucky_secure_randomness_rollback_proof.sql', 'utf8');
const candidatePath = process.argv.slice(2).find(arg => arg !== '--stdout');
const candidate = candidatePath ? readFileSync(candidatePath, 'utf8') : '';
if (!base.startsWith('-- Synthetic') || !/ROLLBACK;\s*$/.test(base)) throw new Error('Unexpected settlement proof boundary');
const sql = base.replace('BEGIN;', `BEGIN;\n${candidate}`).replace(/SET CONSTRAINTS ALL IMMEDIATE;\s*ROLLBACK;\s*$/, extra);
if (process.argv.includes('--stdout')) {
  process.stdout.write(sql);
} else {
  mkdirSync('artifacts', { recursive: true });
  const output = resolve('artifacts/holm-chucky-rollback-proof.sql');
  writeFileSync(output, sql);
  console.log(output);
}
