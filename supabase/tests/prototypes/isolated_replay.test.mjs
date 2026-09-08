import test from 'node:test';
import assert from 'node:assert/strict';
import {splitSql,buildReplay} from './isolated_replay.mjs';
test('quoted bodies and comments do not split at internal semicolons',()=>{
  assert.equal(splitSql("-- ;\nDO $x$ BEGIN PERFORM ';'; END $x$; SELECT 'a'';b'; /* ; /* nested */ */ SELECT 3;").length,3);
});
test('escape strings and quoted identifiers preserve semicolons',()=>{
  assert.equal(splitSql("SELECT E'a\\';b'; SELECT \"a;\"\"b\";").length,2);
});
test('unclosed bodies fail before replay',()=>assert.throws(()=>splitSql('DO $x$ BEGIN;')));
test('only outer transaction controls are removed',()=>{
  const r=buildReplay([{version:'x',statements:['BEGIN; DO $$ BEGIN RAISE NOTICE \'COMMIT;\'; END $$; COMMIT;']}]);
  assert.equal(r.statements.length,1);assert.equal(r.adaptations.length,2);
});
test('legacy job adaptation is exact and name-based',()=>{
  const r=buildReplay([{version:'20260706213441',statements:['SELECT cron.alter_job(job_id := 7, active := false); SELECT cron.alter_job(job_id := 9, active := false);']}]);
  assert.equal(r.adaptations.length,2);assert.match(r.statements[0].sql,/WHERE jobname = 'enforce-all-deadlines-every-30s'/);
});
test('unexpected legacy source fails closed',()=>assert.throws(()=>buildReplay([{version:'20260706213441',statements:['SELECT 1;']}])));
test('nontransactional operations are rejected',()=>assert.throws(()=>buildReplay([{version:'x',statements:['CREATE INDEX CONCURRENTLY t_idx ON t(id);']}])));
test('known rollback-only fixture is omitted without omitting persistent schema',()=>{
  const r=buildReplay([{version:'20260818141237',statements:['SELECT 1; SAVEPOINT codex_rollback_proof; SELECT 2; ROLLBACK TO SAVEPOINT codex_rollback_proof; RELEASE SAVEPOINT codex_rollback_proof; SELECT 3;']}]);
  assert.equal(r.statements.length,2);assert.equal(r.adaptations.length,1);
});
test('unclosed historical rollback fixture fails closed',()=>assert.throws(()=>buildReplay([{version:'20260818141237',statements:['SAVEPOINT codex_rollback_proof; SELECT 2;']}])));
test('release without rollback is not treated as a disposable fixture',()=>assert.throws(()=>buildReplay([{version:'20260818141237',statements:['SAVEPOINT codex_rollback_proof; SELECT 2; RELEASE SAVEPOINT codex_rollback_proof;']}])));
test('known production-only session repair is omitted, schema patch retained',()=>{
  const r=buildReplay([{version:'20260812022452',statements:["DO $migration$ BEGIN NULL; END $migration$; DO $repair$ BEGIN RAISE NOTICE 'holm_live_restore:unexpected_game_state:9d038912-c8b9-4512-977d-c2a7a4c5360c'; END $repair$;"]}]);
  assert.equal(r.statements.length,1);assert.equal(r.adaptations[0].kind,'omit-production-session-data-repair');
});
