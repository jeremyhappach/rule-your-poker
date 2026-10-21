// Combined local qualification. Never writes to the source snapshot or a hosted database.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'file:///C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {installReleasedBaseline} from '../../dev/battle31/released-baseline.mjs';
const database='canasta_reconciled_20261021_2155';
const connect=async database=>{assert(database==='postgres'||/^canasta_reconciled_\d+_\d+$/.test(database));const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database,connectionTimeoutMillis:3000});await c.connect();return c;};
const admin=await connect('postgres');let c;
try{
 await admin.query(`CREATE DATABASE ${database} TEMPLATE money_qualification_1792441147994`);
 c=await connect(database);
 // Restore the exact deployed deferred financial trigger omitted by this old snapshot.
 await c.query('CREATE CONSTRAINT TRIGGER gameplay_transfer_pending_finalize AFTER INSERT ON public.gameplay_transfer_pending_changes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.finalize_gameplay_transfer_batch()');
 await c.query('BEGIN');await installReleasedBaseline(c);
 // Same registration-only scheduler fixture as the released Battle31 package proof.
 await c.query(`ALTER TABLE cron.job ADD COLUMN command text,ADD COLUMN database text DEFAULT current_database(),ADD COLUMN username text DEFAULT current_user,ADD COLUMN nodename text,ADD COLUMN nodeport integer;
 CREATE OR REPLACE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO cron.job(jobname,schedule,command,active) VALUES($1,$2,$3,true) RETURNING jobid $$;
 CREATE FUNCTION cron.alter_job(job_id bigint,active boolean) RETURNS void LANGUAGE sql AS $$ UPDATE cron.job SET active=$2 WHERE jobid=$1 $$;
 CREATE PUBLICATION supabase_realtime;`);
 const battle=readFileSync('supabase/migrations/20261021202023_battle31_v1.sql','utf8').replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,'');
 await c.query(battle);await c.query('COMMIT');
 const fingerprint=async()=> (await c.query("SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS name,md5(replace(pg_get_functiondef(p.oid),chr(13),'')) AS hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.prokind='f' AND p.proname NOT LIKE 'canasta%' ORDER BY 1")).rows;
 const before=await fingerprint();
 const defaults=(await c.query('SELECT to_jsonb(d) d FROM public.game_defaults d ORDER BY game_type')).rows;
 await c.query(readFileSync('supabase/canasta/release/candidate-rollback-proof.sql','utf8'));
 assert.deepEqual(await fingerprint(),before,'candidate rollback preserves existing owners');
 assert.deepEqual((await c.query('SELECT to_jsonb(d) d FROM public.game_defaults d ORDER BY game_type')).rows,defaults);
 await c.query(readFileSync('supabase/canasta/release/closed-install.sql','utf8'));
 await c.query(readFileSync('supabase/canasta/release/closed-verify.sql','utf8'));
 assert.deepEqual((await c.query("SELECT to_jsonb(d) d FROM public.game_defaults d WHERE game_type<>'canasta' ORDER BY game_type")).rows,defaults);
 const after=await fingerprint(),differences=after.filter((row,i)=>JSON.stringify(row)!==JSON.stringify(before[i]));
 assert.equal(differences.length,1,'only Ante Up dispatcher may change');assert(differences[0].name.startsWith('private.advance_ante_phase_exact('));
 await c.query('BEGIN');
 for(const file of ['proof.sql','consent.proof.sql','admission.proof.sql','concurrency.fixture.sql','terminal-control.proof.sql'])await c.query(readFileSync('supabase/canasta/'+file,'utf8').replaceAll('SET LOCAL ROLE postgres','RESET ROLE'));
 await c.query('ROLLBACK');await c.query('BEGIN');
 for(const file of ['core-proof','financial-proof','rollback-failure-proof','v2-controls-proof'])await c.query(readFileSync('supabase/race-poker/'+file+'.sql','utf8'));
 const controls=/const controls=`([\s\S]*?)`;/.exec(readFileSync('dev/eleven-up/combined-production-proof.mjs','utf8'));assert(controls);
 const array='ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()]';
 await c.query("CREATE FUNCTION pg_temp.money_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'proof: %',label;END IF;END $$");
 await c.query(controls[1].replace('${array}',array));await c.query('ROLLBACK');
 const result={at:new Date().toISOString(),database,passed:true,existingFunctionsCompared:before.length,onlyChangedOwner:differences[0].name,
  checks:['exact candidate rollback and closed install','Canasta financial/consent/fake-only/control/RLS','Race rules/financial/replay/rollback/timeout','11 Up Ready/reclaim/all-human controls'],
  limitations:['Native local snapshot; no hosted network delivery','Snapshot uses local scheduler fixture; Docker package separately exercises pg_cron']};
 writeFileSync('supabase/canasta/release/reconciliation-evidence.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{if(c){await c.query('ROLLBACK');await c.end();}await admin.query(`DROP DATABASE IF EXISTS ${database}`);await admin.end();}
