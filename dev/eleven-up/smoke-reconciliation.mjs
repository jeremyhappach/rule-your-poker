// Loopback-only reconciliation with the released Battle31/Race/11 Up baseline.
import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {createHash} from 'node:crypto';
import {connect,context,body} from './human-ready-local.mjs';
import {runFinancialProof} from '../battle31/financial-cases.mjs';
const out='qualification.local/eleven-up-timeout/';
if(process.argv.includes('--prepare')) {
 const source=JSON.parse(read('dev/battle31/evidence/package-proof.json','utf8')).database;
 assert.match(source,/^battle31_package_\d+$/);
 const database='eleven_up_timeout_'+Date.now(),admin=await connect('postgres');
 try{await admin.query(`CREATE DATABASE "${database}" TEMPLATE "${source}"`);}finally{await admin.end();}
 write(out+'context-before-reconciliation.json',read(out+'context.json'));
 write(out+'context.json',JSON.stringify({database,source}));
}
const c=await connect(context().database);
const facts=async()=> (await c.query("SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proname NOT IN ('eleven_up_expiry_control','eleven_up_schedule_bot') ORDER BY 1")).rows;
const gates=async()=> (await c.query("SELECT (SELECT to_jsonb(r) FROM private.race_poker_release r) race,(SELECT to_jsonb(r) FROM private.battle31_release r) battle,(SELECT to_jsonb(r) FROM private.eleven_up_release r) eleven")).rows;
try {
 // The exact installed package repeat validates the inherited shared authority.
 await c.query(read('supabase/battle31/release.sql','utf8'));
 const before=await facts(),beforeGates=await gates();
 await c.query(read('supabase/eleven-up/smoke-controls.sql','utf8'));
 assert.deepEqual(await facts(),before);assert.deepEqual(await gates(),beforeGates);
 // Idempotent repeat must preserve the paced definition and installed trigger.
 const first=(await c.query("SELECT pg_get_functiondef('private.eleven_up_schedule_bot()'::regprocedure) d")).rows;
 await c.query(read('supabase/eleven-up/smoke-controls.sql','utf8'));
 assert.deepEqual((await c.query("SELECT pg_get_functiondef('private.eleven_up_schedule_bot()'::regprocedure) d")).rows,first);
 await c.query('BEGIN');
 for(const file of ['core-proof','financial-proof','rollback-failure-proof','v2-controls-proof'])await c.query(body(read('supabase/race-poker/'+file+'.sql','utf8')));
 await c.query('ROLLBACK');
 const battle=await runFinancialProof(c,{seedLocalHealth:true});
 assert.deepEqual(await facts(),before);assert.deepEqual(await gates(),beforeGates);
 const evidence={at:new Date().toISOString(),...context(),main:'6b15f4eb060df319df13d576948c343920a23b21',migrationSHA256:createHash('sha256').update(read('supabase/eleven-up/smoke-controls.sql')).digest('hex'),passed:true,allOtherFunctionBodiesAndACLsUnchanged:true,allThreeAdmissionRowsUnchanged:true,idempotent:true,race:'core, financial, injected rollback, v2 controls passed',battle};
 write(out+'smoke-reconciliation.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}finally{await c.query('ROLLBACK');await c.end();}
