import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {connectionConfig,extractEvidence,runUnit,runDedicatedUnit,main} from './direct-proof.mjs';
import {wrapUnit} from './hosted-unit.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const namespace='12345678-1234-4000';
const sql=`BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='100ms'; SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='20s';
UPDATE direct_guard SET n=2;
SELECT pg_sleep(8.1);
SELECT pg_sleep(8.1);
SELECT jsonb_build_object('unit','transport','fixture_namespace','${namespace}','existing_records_unchanged',true) candidate_evidence;
ROLLBACK;
DO $$ BEGIN IF (SELECT n FROM direct_guard)<>1 THEN RAISE EXCEPTION 'rollback failed';END IF;END $$;
SELECT jsonb_build_object('unit','transport','fixture_namespace','${namespace}','rollback_verified',true,'golf_release_exists',false) rollback_evidence;`;
const unit={name:'transport',namespace,sha256:hash(sql)};
const rows=[{rows:[{candidate_evidence:{unit:unit.name,fixture_namespace:namespace,existing_records_unchanged:true}}]},
 {rows:[{rollback_evidence:{unit:unit.name,fixture_namespace:namespace,rollback_verified:true,golf_release_exists:false}}]}];

test('connection configuration rejects wrong projects, transaction pooling and TLS weakening',()=>{
 const direct='postgresql://postgres:test-only@db.xvhmbuppghwmwpwrkzao.supabase.co:5432/postgres';
 const c=connectionConfig(direct);assert.equal(c.ssl.rejectUnauthorized,true);assert.equal(c.port,5432);
 assert.equal(c.options,'-c statement_timeout=15000 -c lock_timeout=100 -c idle_in_transaction_session_timeout=20000');
 assert(!Object.hasOwn(c,'query_timeout'),'No whole-unit client timeout');
 const pool='postgresql://postgres.xvhmbuppghwmwpwrkzao:test-only@aws-0-us-east-2.pooler.supabase.com:5432/postgres';
 assert.equal(connectionConfig(pool).port,5432);
 for(const bad of [pool.replace(':5432',':6543'),direct.replace('xvhmbuppghwmwpwrkzao','wrong'),direct+'?sslmode=disable',direct+'?options=-c%20statement_timeout%3D0'])assert.throws(()=>connectionConfig(bad));
});

test('both exact receipts are required and altered units fail before connection',async()=>{
 assert.equal(extractEvidence(rows,unit,false).sql_sha256,unit.sha256);
 assert.throws(()=>extractEvidence([rows[1]],unit,false),/candidate receipt/);
 assert.throws(()=>extractEvidence([rows[0]],unit,false),/rollback receipt/);
 assert.throws(()=>extractEvidence([...rows,rows[0]],unit,false),/candidate receipt/);
 await assert.rejects(runDedicatedUnit(()=>{throw Error('must not connect');},sql+' ',unit),/hash mismatch/);
});

test('dedicated connection rolls back and closes on SQL or cleanup failure',async()=>{
 let closed=0;const calls=[];
 const client={connect:async()=>{},query:async text=>{calls.push(text);if(text===sql)throw Object.assign(Error('fixture failure'),{code:'57014'});},end:async()=>{closed++;}};
 await assert.rejects(runDedicatedUnit(()=>client,sql,unit),/fixture failure/);
 assert.deepEqual(calls,[sql,'ROLLBACK']);assert.equal(closed,1);
 client.query=async()=>{throw Error('connection lost');};
 await assert.rejects(runDedicatedUnit(()=>client,sql,unit),/connection lost/);assert.equal(closed,2);
});

test('missing credential binding stops before any connection or evidence file',async()=>{
 const output='qualification.local/six-card-golf/missing-binding-must-not-exist.json';
 assert(!existsSync(output));
 await assert.rejects(main(['--run','qualification.local/six-card-golf/production-candidate/manifest.json',output],{}),/No existing GOLF_QUALIFICATION_URL/);
 assert(!existsSync(output));
});

test('local PostgreSQL proves aggregate time above 15s, original per-statement limits and rollback',async()=>{
 const {database}=JSON.parse(readFileSync('qualification.local/six-card-golf/context.json','utf8'));
 assert.match(database,/^golf_\d+$/);
 const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database,
  options:'-c statement_timeout=15000 -c lock_timeout=100 -c idle_in_transaction_session_timeout=20000'});
 await c.connect();
 try{
  const version=(await c.query("SELECT current_setting('server_version_num')::integer n")).rows[0].n;assert(version>=130000);
  await c.query('CREATE TEMP TABLE direct_guard(n integer); INSERT INTO direct_guard VALUES(1)');
  const wrappedStart=performance.now();
  await assert.rejects(c.query(wrapUnit(sql)),e=>e.code==='57014');
  const wrapperMs=Math.round(performance.now()-wrappedStart);await c.query('ROLLBACK');
  assert.equal((await c.query('SELECT n FROM direct_guard')).rows[0].n,1);
  const directStart=performance.now();const receipt=await runUnit(c,sql,unit);
  const directMs=Math.round(performance.now()-directStart);assert(directMs>=16000);
  assert.equal(receipt.rollback_evidence.rollback_verified,true);
  assert.equal((await c.query('SELECT n FROM direct_guard')).rows[0].n,1);
  const limits=(await c.query("SELECT current_setting('statement_timeout') timeout,current_setting('lock_timeout') lock_timeout,current_setting('idle_in_transaction_session_timeout') idle_timeout")).rows[0];
  assert.deepEqual(limits,{timeout:'15s',lock_timeout:'100ms',idle_timeout:'20s'});
  const manifest=JSON.parse(readFileSync('qualification.local/six-card-golf/production-candidate/manifest.json','utf8'));
  const actual=manifest.units.find(u=>u.name==='core');
  await assert.rejects(runUnit(c,readFileSync('qualification.local/six-card-golf/production-candidate/core.sql','utf8'),actual),/live_services_required/);
  assert.equal((await c.query("SELECT to_regclass('private.golf_release') v")).rows[0].v,null);
  console.log(JSON.stringify({localOnly:true,version,wrapperMs,wrapperCode:'57014',directMs,bothReceipts:true,rollbackVerified:true,limits,actualCoreLiveServiceGatePreserved:true}));
 }finally{await c.query('ROLLBACK');await c.end();}
});
