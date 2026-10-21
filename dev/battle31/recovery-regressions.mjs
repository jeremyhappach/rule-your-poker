import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write,copyFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {connect} from './database.mjs';
const proof=JSON.parse(read('dev/battle31/evidence/package-proof.json','utf8'));
if(!proof.passed||!/^battle31_package_[0-9]+$/.test(proof.database))throw Error('Run package-proof.mjs first');
const results=[];
for(const [name,evidence] of [['proof','financial-proof'],['concurrency','concurrency-recovery'],['human-bot','human-bot']]){
 const r=spawnSync(process.execPath,['dev/battle31/'+name+'.mjs'],{env:{...process.env,BATTLE31_DATABASE:proof.database},encoding:'utf8',timeout:120000});
 console.log(name,r.status,r.stdout,r.stderr);
 if(r.status!==0)throw Error('Regression failed: '+name);
 copyFileSync('qualification.local/battle31/'+evidence+'.json','dev/battle31/evidence/'+evidence+'.json');results.push({script:name,passed:true});
}
const c=await connect(proof.database);
const facts=async()=>(await c.query(`SELECT jsonb_build_object('matches',(SELECT count(*) FROM private.battle31_matches),'requests',(SELECT count(*) FROM private.battle31_requests),'results',(SELECT count(*) FROM public.game_results WHERE game_type='battle-31'),'chips',(SELECT sum(chips) FROM public.players),'gates',(SELECT to_jsonb(r) FROM private.battle31_release r)) facts`)).rows[0].facts;
try{
 const before=await facts();await c.query(read('supabase/battle31/release.sql','utf8'));assert.deepEqual(await facts(),before);
 await c.query('UPDATE private.battle31_release SET enabled=false,admission_enabled=false');
 const evidence={at:new Date().toISOString(),database:proof.database,packageSHA256:proof.packageSHA256,results,exactReplayPreservesSettledData:true,replayFacts:before,localAdmissionClosedAfterProof:true};
 write('dev/battle31/evidence/recovery-regressions.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}finally{await c.end();}
