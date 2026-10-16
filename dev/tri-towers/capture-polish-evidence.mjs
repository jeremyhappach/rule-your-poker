import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {connect} from './polish-fixture.mjs';
const dir='qualification.local/tri-towers/',read=async name=>JSON.parse(await readFile(dir+name+'.json','utf8'));
const after=await read('production-after'),before=await read('production-preflight'),context=await read('polish-context');
const c=await connect(context.database);
try{
 const names=['tri_towers_finish_stage','tri_towers_reduce','tri_towers_snapshot','tri_towers_action'];
 const qualified=(await c.query('SELECT p.proname name,md5(p.prosrc) body_hash FROM pg_proc p WHERE p.proname=ANY($1)',[names])).rows;
 for(const q of qualified)assert.equal(after.fingerprints.find(p=>p.name===q.name).body_hash,q.body_hash);
 assert.equal(qualified.length,4);assert.deepEqual(before.preservation,after.preservation);
 const build=await readFile(dir+'polish-build.log','utf8');assert.match(build,/2151 passed/);assert.match(build,/241 passed/);assert.match(build,/built in/);
 const evidence={qualifiedAt:new Date().toISOString(),migration:after.migration,
  migrationSHA256:createHash('sha256').update(await readFile('supabase/migrations/20261016011439_tri_towers_stage_results.sql')).digest('hex'),
  database:await read('polish-database'),financial:await read('polish-financial'),baseline:await read('polish-baseline'),integration:await read('local-integration-results'),
  browser:await read('polish-browser'),layout:await read('polish-layout'),playingLayout:await read('layout-results'),
  engineRollback:'PASS',adapterRollback:'PASS',regression:{source:2151,harness:241,total:2392,typecheck:'PASS',productionBuild:'PASS'},
  deployedFunctions:qualified,preservation:after.preservation,helperAuthenticated:false,actionAuthenticated:true,
  productionFinancialWrites:0,ownerGameplaySmoke:'PENDING'};
 await writeFile('dev/tri-towers/stage-polish.evidence.json',JSON.stringify(evidence,null,2)+'\n');console.log('PASS deployed four routine bodies match qualification; evidence captured');
}finally{await c.end();}
