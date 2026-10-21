import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildProofs,sanitizeFixture,migrationPath,migrationHash} from './production-proof.mjs';
import {createHash} from 'node:crypto';
import {validateEvidence} from './production-evidence.mjs';
const names=['core-proof','proof','financial-proof','recovery-proof','mixed-proof','qualification-proof'];
const input={migration:readFileSync(migrationPath,'utf8'),fixtures:Object.fromEntries(names.map(n=>[n,readFileSync(`supabase/six-card-golf/${n}.sql`,'utf8')])),namespace:'12345678-1234-4123'};
test('exact migration bytes and authority source remain pinned',()=>{
 assert.equal(createHash('sha256').update(input.migration).digest('hex'),migrationHash);
 assert.throws(()=>buildProofs({...input,migration:input.migration+'\n'}),/repin/);
});
test('production fixtures never seed heartbeat or disable integrity triggers',()=>{
 for(const name of names){
  const sql=sanitizeFixture(name,input.fixtures[name]);
  assert.doesNotMatch(sql,/(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+private\.game_recovery_dispatch_state/i);
  assert.doesNotMatch(sql,/DISABLE\s+TRIGGER/i);
 }
 assert.throws(()=>sanitizeFixture('proof',input.fixtures.proof.replace("last_outcome='completed'","last_outcome='fake'")),/seed count/);
 assert.throws(()=>sanitizeFixture('core-proof',input.fixtures['core-proof']+'\nALTER TABLE private.golf_matches DISABLE TRIGGER golf_guard;'),/Unsafe/);
});
test('each unit is bounded, rollback-only, isolated and checks both sides of rollback',()=>{
 const units=buildProofs(input);assert.equal(units.length,11);assert.equal(new Set(units.map(x=>x.namespace)).size,11);
 for(const {sql} of units){
  assert.equal((sql.match(/^BEGIN ISOLATION LEVEL REPEATABLE READ;/gm)||[]).length,1);
  assert.equal((sql.match(/^ROLLBACK;/gm)||[]).length,1);
  assert.doesNotMatch(sql,/^\s*COMMIT\s*;/im);
  assert.match(sql,/live_scheduler_stale/);assert.match(sql,/existing_or_unscoped_records_changed/);
  assert.match(sql,/idle_in_transaction_session_timeout='20s'/);
  assert.ok(sql.indexOf('golf_unchanged();')<sql.indexOf('\nROLLBACK;'));
  assert.ok(sql.lastIndexOf('residual_or_collision')>sql.indexOf('\nROLLBACK;'));
  assert.doesNotMatch(sql,/installLocalReference|local-reference.sql/);
 }
 for(const x of units.filter(x=>x.name.startsWith('mixed'))){assert.match(x.sql,/FOR money IN [01]\.\.[01] LOOP FOR n IN [234]\.\.[234] LOOP/);assert.match(x.sql,/golf_metrics VALUES\('bot_finishes'/);}
});
test('installed payload cannot be built without reviewed candidate fingerprints',()=>{
 assert.throws(()=>buildProofs({...input,installed:true}),/reviewed candidate/);
 const fingerprints=Object.fromEntries(Array.from({length:25},(_,i)=>[`private.golf_test_${i}()`, 'a'.repeat(32)]));
 const units=buildProofs({...input,installed:true,fingerprints,catalogFingerprint:'b'.repeat(32)});
 assert.ok(units.every(x=>!x.sql.includes('CREATE TABLE private.golf_release')));
 assert.ok(units.every(x=>x.sql.includes('installed_function_drift')));
});
test('evidence rejects partial runs, missing rollback, changed authority and no bot finish',()=>{
 const units=buildProofs(input),manifest={migrationHash,installed:false,units};
 const fingerprints=Object.fromEntries(Array.from({length:25},(_,i)=>[`private.golf_test_${i}()`,'a'.repeat(32)]));
 const evidence={units:units.map(u=>({sql_sha256:u.sha256,candidate_evidence:{unit:u.name,function_fingerprints:fingerprints,catalog_fingerprint:'b'.repeat(32),fixture_namespace:u.namespace,existing_records_unchanged:true,metrics:{bot_finishes:u.name.startsWith('mixed')?1:0}},rollback_evidence:{unit:u.name,fixture_namespace:u.namespace,rollback_verified:true,golf_release_exists:false}}))};
 assert.equal(validateEvidence(manifest,evidence).botFinishes,6);
 const change=f=>{const e=structuredClone(evidence);f(e);return e;};
 assert.throws(()=>validateEvidence(manifest,change(e=>e.units.pop())),/eleven/);
 assert.throws(()=>validateEvidence(manifest,change(e=>e.units[0].rollback_evidence.rollback_verified=false)),/Unverified/);
 assert.throws(()=>validateEvidence(manifest,change(e=>e.units[0].candidate_evidence.function_fingerprints={...e.units[0].candidate_evidence.function_fingerprints,'private.golf_test_0()':'b'.repeat(32)})),/differs/);
 assert.throws(()=>validateEvidence(manifest,change(e=>e.units[0].candidate_evidence.catalog_fingerprint='c'.repeat(32))),/Catalog differs/);
 assert.throws(()=>validateEvidence(manifest,change(e=>e.units.forEach(u=>u.candidate_evidence.metrics.bot_finishes=0))),/No earned/);
});
