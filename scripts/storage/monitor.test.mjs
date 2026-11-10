import {test} from 'node:test';
import assert from 'node:assert/strict';
import {storageReport,readOnlyApi} from './monitor.mjs';
import {TEAM,PROJECT,REQUIRED,DOMAINS} from './cleanup.mjs';

function fixture(){
 const deployment=(id,created,target='production',branch='main')=>({id,created,target,branch,sha:'a'.repeat(40),state:'READY',rollbackCandidate:false});
 return {capturedAt:'2026-11-10T00:00:00Z',complete:true,project:{id:PROJECT,accountId:TEAM},
  deployments:[...REQUIRED.map((key,i)=>deployment(key,100-i)),deployment('old',1),deployment('latest-preview',8,'preview','review'),deployment('old-preview',2,'preview','review'),deployment('aliased',3,'preview','other'),deployment('unknown',4,'preview',null)],
  aliases:[...DOMAINS.map(alias=>({alias,deploymentId:REQUIRED[0]})),{alias:'test.example',deploymentId:'aliased'}]};
}
const estimate=()=>({bytes:10,files:[{hash:'one-blob',bytes:10,path:'public/art/a.png'}]});
test('production, rollback, aliases, latest previews, explicit testing and unknown states stay protected',()=>{
 const snapshot=fixture();snapshot.deployments.push({...snapshot.deployments[0],id:'rollback',created:0,rollbackCandidate:true});
 const report=storageReport(snapshot,{estimate,testingHolds:['old-preview']});
 for(const key of [...REQUIRED,'latest-preview','old-preview','aliased','unknown','rollback'])assert(!report.reviewCandidates.includes(key),key);
 assert.equal(report.currentProduction,REQUIRED[0]);assert.equal(report.immediateRollback,REQUIRED[1]);
 assert(report.deployments.every(d=>d.disposition!=='delete'));
});
test('asset estimates distinguish per-deployment logical bytes, unique blobs and unknown output',()=>{
 const snapshot=fixture();snapshot.deployments.push({id:'failed',state:'ERROR',sha:null,created:0});
 const report=storageReport(snapshot,{estimate});
 assert.equal(report.assetEstimate.logicalRetainedBytes,90);assert.equal(report.assetEstimate.uniqueGitBlobBytes,10);assert.equal(report.assetEstimate.unknownDeployments,1);
 assert.equal(report.assetEstimate.majorContributors[0].path,'public/art');
});
test('operator readings produce warning thresholds without deletion decisions',()=>{
 for(const [gb,threshold]of [[8.77,'below-warning'],[9,'warning'],[9.5,'critical']])assert.equal(storageReport(fixture(),{estimate,usageGb:gb,usageObservedAt:'2026-11-10'}).usage.threshold,threshold);
 assert.equal(storageReport(fixture(),{estimate}).usage.threshold,'unknown');
 assert.throws(()=>storageReport(fixture(),{estimate,usageGb:9}),/observation date/);
});
test('unresolved aliases block all cleanup recommendations',()=>{
 const snapshot=fixture();snapshot.aliases.push({alias:'old-test.example',deploymentId:'no-longer-listed'});
 const report=storageReport(snapshot,{estimate});assert.equal(report.cleanupBlocked,true);assert.deepEqual(report.reviewCandidates,[]);
 assert.deepEqual(report.unresolvedAliasTargets,['no-longer-listed']);
});
test('new deployment IDs and exact reusable candidate URLs are reported, not guessed from time',()=>{
 const snapshot=fixture(),previous={deployments:snapshot.deployments.slice(1)};
 const report=storageReport(snapshot,{estimate,previous,candidateSha:'a'.repeat(40)});
 assert.deepEqual(report.newDeployments,[REQUIRED[0]]);assert.equal(report.existingCandidateDeployments.length,9);
});
test('incomplete pagination, wrong projects, duplicate pages and divergent aliases fail closed',()=>{
 const snapshot=fixture();snapshot.complete=false;assert.throws(()=>storageReport(snapshot),/pagination/);
 snapshot.complete=true;snapshot.project.id='other';assert.throws(()=>storageReport(snapshot));snapshot.project.id=PROJECT;
 snapshot.deployments.push(snapshot.deployments[0]);assert.throws(()=>storageReport(snapshot),/Duplicate/);snapshot.deployments.pop();
 snapshot.aliases[0].deploymentId='other';assert.throws(()=>storageReport(snapshot),/disagree/);
});
test('monitor transport refuses mutations and arbitrary endpoint/scope overrides before network',async()=>{
 let requests=0;const api=readOnlyApi('fixture',async()=>{requests++;return {ok:true,json:async()=>({})};});
 await assert.rejects(api('DELETE','/v13/deployments/old'));
 await assert.rejects(api('POST','/v9/projects/'+PROJECT));
 await assert.rejects(api('GET','/v13/deployments/old'));
 await assert.rejects(api('GET','/v7/deployments',{projectId:PROJECT,teamId:'other'}));
 assert.equal(requests,0);
 await api('GET','/v7/deployments',{projectId:PROJECT});assert.equal(requests,1);
});
