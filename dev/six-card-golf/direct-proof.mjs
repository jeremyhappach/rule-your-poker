// Dedicated PostgreSQL transport. Never wraps or splits a reviewed SQL unit.
// A simple-query message preserves PostgreSQL's per-statement timeout and
// node-postgres returns every result set, including both rollback receipts.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {migrationPath,migrationHash} from './production-proof.mjs';
import {validateEvidence} from './production-evidence.mjs';

const project='xvhmbuppghwmwpwrkzao';
const sha=s=>createHash('sha256').update(s).digest('hex');
export function connectionConfig(value){
 let url;try{url=new URL(value);}catch{throw Error('Invalid qualification connection binding');}
 assert(['postgres:','postgresql:'].includes(url.protocol),'PostgreSQL binding required');
 const host=url.hostname,user=decodeURIComponent(url.username);
 const direct=host===`db.${project}.supabase.co`&&user==='postgres';
 const session=/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)&&user===`postgres.${project}`;
 assert((direct||session)&&(!url.port||url.port==='5432'),'Verified project direct/session endpoint on port 5432 required');
 assert(url.pathname==='/postgres'&&url.password,'Explicit database and existing credential required');
 // Do not let URL options override TLS verification or change server settings.
 assert([...url.searchParams.keys()].every(k=>k==='sslmode'),'Unexpected connection option');
 assert(!url.searchParams.has('sslmode')||url.searchParams.get('sslmode')==='verify-full','Verified TLS required');
 return {host,port:5432,user,password:decodeURIComponent(url.password),database:'postgres',
  ssl:{rejectUnauthorized:true,servername:host},application_name:'golf-bounded-rollback-proof',
  connectionTimeoutMillis:10000,
  options:'-c statement_timeout=15000 -c lock_timeout=100 -c idle_in_transaction_session_timeout=20000'};
}

export function checkUnit(sql,unit){
 assert.equal(sha(sql),unit.sha256,'Unit hash mismatch');
 assert.equal((sql.match(/^BEGIN ISOLATION LEVEL REPEATABLE READ;/gm)||[]).length,1,'Original transaction required');
 assert.equal((sql.match(/^ROLLBACK;/gm)||[]).length,1,'Original rollback required');
 assert(!/^\s*COMMIT\s*;/im.test(sql),'Commit forbidden');
 assert(sql.includes("SET LOCAL lock_timeout='100ms'; SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='20s'"),'Original limits required');
}

export function extractEvidence(results,unit,installed){
 const sets=Array.isArray(results)?results:[results];
 const candidates=sets.flatMap(r=>r.rows||[]).filter(r=>Object.hasOwn(r,'candidate_evidence'));
 const rollbacks=sets.flatMap(r=>r.rows||[]).filter(r=>Object.hasOwn(r,'rollback_evidence'));
 assert.equal(candidates.length,1,'Exactly one candidate receipt required');
 assert.equal(rollbacks.length,1,'Exactly one rollback receipt required');
 const a=candidates[0].candidate_evidence,b=rollbacks[0].rollback_evidence;
 assert.equal(a.unit,unit.name);assert.equal(b.unit,unit.name);
 assert.equal(a.fixture_namespace,unit.namespace);assert.equal(b.fixture_namespace,unit.namespace);
 assert.equal(a.existing_records_unchanged,true);assert.equal(b.rollback_verified,true);
 assert.equal(b.golf_release_exists,installed);
 return {sql_sha256:unit.sha256,candidate_evidence:a,rollback_evidence:b};
}

export async function runUnit(client,sql,unit,installed=false){
 checkUnit(sql,unit);
 try{
  // No values, prepared name, wrapper, SQL splitter or whole-unit client timer.
  const results=await client.query(sql);
  return extractEvidence(results,unit,installed);
 }finally{
  // Also covers unexpected errors before the original ROLLBACK is reached.
  // The caller closes this dedicated connection even if ROLLBACK itself fails.
  await client.query('ROLLBACK');
 }
}

export async function runDedicatedUnit(makeClient,sql,unit,installed=false,preflight=async()=>{}){
 checkUnit(sql,unit); // Fail before opening a connection on altered artifacts.
 const client=makeClient();
 try{
  await client.connect();
  await preflight(client);
  return await runUnit(client,sql,unit,installed);
 }finally{await client.end();}
}

export async function main(args,env=process.env){
 if(!args.includes('--run')){
  console.log('Prepared only. No connection made. A later authorized run needs --run <source-manifest.json> <new-evidence.json> and GOLF_QUALIFICATION_URL.');
  return;
 }
 assert.equal(args.length,3,'Usage: --run source-manifest.json new-evidence.json');
 assert.equal(args[0],'--run');
 const manifestPath=resolve(args[1]),output=resolve(args[2]);
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
 assert.equal(manifest.migrationHash,migrationHash,'Wrong migration manifest');
 assert.equal(sha(readFileSync(migrationPath)),migrationHash,'Migration bytes changed');
 assert.equal(manifest.units?.length,16,'All sixteen units required');
 assert.equal(typeof manifest.installed,'boolean');
 assert(!manifest.transport&&!manifest.units.some(u=>u.source_sha256),'Use original units, not MCP wrappers');
 const names=['core','financial','recovery','qualification',...['human','mixed'].flatMap(k=>['fake','real'].flatMap(m=>[2,3,4].map(n=>`${k}-${m}-${n}`)))];
 assert.deepEqual(manifest.units.map(u=>u.name).sort(),names.sort(),'Wrong coverage');
 const units=manifest.units.map(unit=>{
  const sql=readFileSync(resolve(dirname(manifestPath),unit.name+'.sql'),'utf8');
  checkUnit(sql,unit);return {unit,sql};
 });
 assert(env.GOLF_QUALIFICATION_URL,'No existing GOLF_QUALIFICATION_URL binding supplied');
 const config=connectionConfig(env.GOLF_QUALIFICATION_URL);
 const evidence={transport:'PostgreSQL simple query; original statements',startedAt:new Date().toISOString(),complete:false,units:[]};
 mkdirSync(dirname(output),{recursive:true});
 // Refuse to replace earlier proof evidence.
 writeFileSync(output,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
 for(const {unit,sql} of units){
  try{
   const row=await runDedicatedUnit(()=>new pg.Client(config),sql,unit,manifest.installed,async client=>{
    const {rows:[identity]}=await client.query("SELECT current_database() database,current_user role,current_setting('server_version_num')::integer version,current_setting('statement_timeout') timeout,current_setting('lock_timeout') lock_timeout,current_setting('idle_in_transaction_session_timeout') idle_timeout");
    assert.equal(identity.database,'postgres');assert.equal(identity.role,'postgres');
    assert(identity.version>=130000,'Per-statement simple-query timeouts require PostgreSQL 13 or newer');
    assert.equal(identity.timeout,'15s');assert.equal(identity.lock_timeout,'100ms');assert.equal(identity.idle_timeout,'20s');
   });
   evidence.units.push(row);
   writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
   console.log(JSON.stringify({unit:unit.name,rollbackVerified:true,completed:evidence.units.length}));
  }catch(error){
   evidence.failure={unit:unit.name,code:typeof error.code==='string'?error.code:'RUNNER_FAILURE'};
   writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
   // Driver messages can contain connection credentials or SQL data. Keep them out.
   throw Error(`Qualification stopped at ${unit.name} (${evidence.failure.code}); no subsequent unit executed`);
  }
 }
 const verified=validateEvidence(manifest,evidence);
 evidence.complete=true;evidence.completedAt=new Date().toISOString();
 writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({units:verified.units,botFinishes:verified.botFinishes,scope:verified.scope}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
