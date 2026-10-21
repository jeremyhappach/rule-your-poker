import assert from 'node:assert/strict';
import {readFileSync as read} from 'node:fs';
import {connect,localContext} from './database.mjs';
import {buildProofs,migrationPath} from './production-proof.mjs';
import {wrapUnit} from './hosted-unit.mjs';
const names=['core-proof','proof','financial-proof','recovery-proof','mixed-proof','qualification-proof'];
const [generated]=buildProofs({migration:read(migrationPath,'utf8'),fixtures:Object.fromEntries(names.map(n=>[n,read('supabase/six-card-golf/'+n+'.sql','utf8')]))});
const start=generated.sql.indexOf('CREATE TEMP TABLE golf_existing'),end=generated.sql.indexOf('-- golf-proof:rehearsal-start');
const preparation=generated.sql.slice(start,end);
const c=await connect(localContext().database);
const existing='99999999-9999-4999-9999-999999999999';
try{
 await c.query('BEGIN');
 await c.query('INSERT INTO auth.users(id) VALUES($1)',[existing]);
 // This sentinel is intentionally committed only in the isolated local test DB,
 // so every connector-style request must preserve it independently.
 await c.query('COMMIT');
 const unit=mutation=>`BEGIN ISOLATION LEVEL REPEATABLE READ;
 CREATE TEMP TABLE snapshot_check ON COMMIT DROP AS SELECT pg_backend_pid() pid,txid_current_snapshot()::text snap,clock_timestamp() started;
 ${preparation}
 -- golf-proof:rehearsal-start
 DO $$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR
  (SELECT pid<>pg_backend_pid() OR snap<>txid_current_snapshot()::text FROM snapshot_check)
  THEN RAISE EXCEPTION 'snapshot changed';END IF;END $$;
 ${mutation}
 SELECT pg_temp.golf_unchanged();
 SELECT jsonb_build_object('unit','containment','existing_records_unchanged',true) candidate_evidence;
 ROLLBACK;
 SELECT jsonb_build_object('unit','containment','rollback_verified',true) rollback_evidence;`.replace('\n ROLLBACK;','\nROLLBACK;');
 const good=wrapUnit(unit('INSERT INTO auth.users(id) VALUES(pg_temp.golf_fixture_uuid());'));
 const passed=await c.query(good);
 assert.equal(passed.at(-1).rows[0].rollback_evidence.rollback_verified,true);
 for(const mutation of [
  `UPDATE auth.users SET id='77777777-7777-4777-7777-777777777777' WHERE id='${existing}';`,
  `DELETE FROM auth.users WHERE id='${existing}';`,
  "INSERT INTO auth.users(id) VALUES('88888888-8888-4888-8888-888888888888');"
 ]){
  await assert.rejects(c.query(wrapUnit(unit(mutation))),/existing_or_unscoped_records_changed:auth.users/);
  await c.query('ROLLBACK');
  assert.equal((await c.query('SELECT count(*)::int n FROM auth.users WHERE id=$1',[existing])).rows[0].n,1);
 }
 assert.equal((await c.query("SELECT to_regclass('pg_temp.golf_existing') v")).rows[0].v,null);
 const timed=unit("SELECT pg_sleep(6.1); DO $$ BEGIN IF (SELECT clock_timestamp()-started>interval '7 seconds' FROM snapshot_check) THEN RAISE EXCEPTION 'history hashing consumed action window';END IF;END $$;")
  .replace("captured jsonb:='[]';BEGIN","captured jsonb:='[]';BEGIN PERFORM pg_sleep(3.1);");
 const started=performance.now();await c.query(wrapUnit(timed));
 const elapsedMs=Math.round(performance.now()-started);assert(elapsedMs>=9200);
 console.log(JSON.stringify({deferredHistoryMs:3100,actionHoldMs:6100,elapsedMs,withinOriginalLimits:true}));
 console.log('PASS actual generated full-history capture: fixture exclusion, both-direction mutation/deletion/insertion rejection, same snapshot/backend, rollback and cleanup.');
}finally{
 await c.query('ROLLBACK');
 await c.query('DELETE FROM auth.users WHERE id=$1',[existing]);
 await c.end();
}
