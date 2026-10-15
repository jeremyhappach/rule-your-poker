import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import pg from '../../../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
const dir='supabase/farkle/financial-correction/20261015/';
const local='qualification.local/farkle-audit-20261015/';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const source=read('qualification.local/farkle-full-stack/full-schema.json').functions;
const before=read(dir+'release-production-before.json');
assert.equal(before.gate.creation_enabled,false);
assert.equal(before.functions.length,source.length);
for(const f of source){const live=before.functions.find(x=>x.signature===f.signature);assert.equal(live?.hash,f.hash,f.signature+' deployed definition drift');assert.equal(live?.acl,f.acl,f.signature+' ACL drift');}
const metadata=read(local+'candidate-metadata-proof.json');
const candidate=fs.readFileSync(dir+'candidate.sql','utf8');
assert.equal(createHash('sha256').update(candidate).digest('hex'),'f38c212b9170c729ad26fffee90ecade00a35dee2cbe2046b158a6e18078f185');
const opts=read(local+'local-db.json');assert.equal(opts.host,'127.0.0.1');assert.equal(opts.port,55439);assert.match(opts.database,/^farkle_audit_empty_\d+$/);
const c=new pg.Client(opts);await c.connect();
try{
 const values=metadata.functionChanges.map(f=>`('${f.signature.includes('.')?f.signature:'public.'+f.signature}','${f.original}','${f.candidate}')`).join(',\n');
 const header=`-- Qualified Farkle correction: fresh active-account checks and nonblocking recovery lock order.
-- No admission, session, history, balance, ledger, trigger, index, or table changes.
-- Existing callers and ACLs are preserved. Unknown source drift aborts atomically.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(19092026,1);
DO $precondition$
DECLARE f record; actual text;
BEGIN
 IF (SELECT creation_enabled FROM private.farkle_release WHERE singleton) IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'farkle_correction:admission_must_be_closed';
 END IF;
 FOR f IN SELECT * FROM (VALUES
${values}
 ) AS expected(signature,original_hash,qualified_hash) LOOP
  SELECT md5(pg_get_functiondef(to_regprocedure(f.signature))) INTO actual;
  IF actual IS NULL OR actual NOT IN (f.original_hash,f.qualified_hash) THEN
   RAISE EXCEPTION 'farkle_correction:unexpected_definition:%',f.signature;
  END IF;
 END LOOP;
END $precondition$;

`;
 const migration=header+candidate;
 const file='supabase/migrations/20261015212154_farkle_active_account_and_recovery_lock_order.sql';
 fs.writeFileSync(file,migration);
 await c.query('BEGIN');
 await c.query('UPDATE private.farkle_release SET creation_enabled=false WHERE singleton');
 for(const f of metadata.functionChanges)await c.query(source.find(x=>x.signature===f.signature).definition);
 await c.query(migration);
 for(const f of metadata.functionChanges)assert.equal((await c.query('SELECT md5(pg_get_functiondef($1::regprocedure)) hash',[f.signature])).rows[0].hash,f.candidate);
 await c.query(migration);
 const functions=(await c.query("SELECT oid::regprocedure::text signature,md5(pg_get_functiondef(oid)) hash,proacl::text acl FROM pg_proc WHERE oid='private.farkle_require_active_actor_v1(uuid,uuid,boolean)'::regprocedure OR oid=ANY($1::regprocedure[])",[metadata.functionChanges.map(f=>f.signature)])).rows;
 await c.query('ROLLBACK');
 fs.writeFileSync(dir+'release-migration-proof.json',JSON.stringify({at:new Date().toISOString(),sourceRoutinesCompared:source.length,sourceAndAclDrift:0,migration:file,migrationSha256:createHash('sha256').update(migration).digest('hex'),originalAndRepeatApplicationPassed:true,rollback:true,lockTimeout:'5s',statementTimeout:'30s',functions},null,2));
 console.log(JSON.stringify({sourceAndAclDrift:0,migration:file,originalAndRepeatApplicationPassed:true,qualifiedRoutines:functions.length}));
}finally{await c.query('ROLLBACK');await c.end();}
