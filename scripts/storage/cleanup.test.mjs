import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TEAM,PROJECT,FIRST_THREE,REQUIRED,DOMAINS,validatePlan,validateApproval,evaluate,makeApi,collectSnapshot,runCleanup,batchHash} from './cleanup.mjs';
import {compareHealth} from './cleanup-health.mjs';
const plan=JSON.parse(readFileSync(new URL('./cleanup-first-batch.json',import.meta.url),'utf8'));
const now=1794240523535;
function fixture(){
 const rows=plan.candidates.map(c=>({...c,state:'READY',target:c.branch==='main'?'production':null,isRollbackCandidate:false,meta:{githubCommitRef:c.branch,githubCommitSha:c.sha}}));
 for(let i=0;i<7;i++)rows.push({id:REQUIRED[i]??'dpl_recent_'+i,created:now-i*10000,state:'READY',target:'production',isRollbackCandidate:i<2,meta:{githubCommitRef:'main',githubCommitSha:'f'.repeat(40)}});
 rows.push({id:'dpl_newer_preview',created:now-100000,state:'READY',target:null,isRollbackCandidate:false,meta:{githubCommitRef:plan.candidates[2].branch,githubCommitSha:'f'.repeat(40)}});
 return {complete:true,capturedAt:new Date().toISOString(),project:{id:PROJECT,accountId:TEAM},deployments:rows,aliases:DOMAINS.map(alias=>({alias,deploymentId:REQUIRED[0]})),details:Object.fromEntries(rows.slice(0,3).map(d=>[d.id,{...d,project:{id:PROJECT}}])),deploymentAliases:Object.fromEntries(FIRST_THREE.map(id=>[id,[]]))};
}
const approval=()=>({authorized:true,batchId:plan.batchId,planSha256:batchHash(plan),ids:[...FIRST_THREE],residualRiskAccepted:true,authorizedAt:new Date().toISOString(),authorizationReference:'offline test fixture; no live authorization'});
const review=()=>({checkedAt:new Date().toISOString(),residualRiskAccepted:true,activeUsageIds:[],activeDependencyIds:[],testingHolds:[]});
function harness(adapt=()=>{}){
 const removed=[],events=[];let reads=0;const health={manifests:[{buildId:'f'.repeat(40)}],resources:[]};
 return {removed,events,deps:{collect:async()=>{const s=fixture();s.deployments=s.deployments.filter(d=>!removed.includes(d.id));adapt(s,++reads);return s;},health:async()=>structuredClone(health),remove:async id=>{removed.push(id);return{uid:id,state:'DELETED'};},verifyRemoved:async id=>assert(removed.includes(id)),audit:async e=>events.push(e)}};
}
test('default dry-run never calls deletion even when every candidate is eligible',async()=>{
 const h=harness();const r=await runCleanup(plan,{},h.deps);assert(r.decisions.every(d=>d.eligible));assert.deepEqual(h.removed,[]);assert.equal(r.estimatedPublicBytes,197337216);
});
test('fixed allowlist cannot expand to a fourth or different original candidate',()=>{
 for(const mutate of [p=>p.candidates.push(p.candidates[0]),p=>p.candidates[0].id='dpl_unknown',p=>p.candidates.reverse(),p=>p.teamId='other']){const p=structuredClone(plan);mutate(p);assert.throws(()=>validatePlan(p));}
});
test('approval binds exact batch, full plan hash, accepted risk, date and authorization reference',()=>{
 validateApproval(plan,approval());for(const field of ['authorized','planSha256','ids','residualRiskAccepted','authorizedAt','authorizationReference']){const a=approval();delete a[field];assert.throws(()=>validateApproval(plan,a));}
});
test('missing approval stops before any live calls',async()=>{let called=false;await assert.rejects(runCleanup(plan,{execute:true},{collect:()=>{called=true;}}));assert.equal(called,false);});
test('fresh active-traffic and dependency evidence prevents eligibility',()=>{
 for(const key of ['activeUsageIds','activeDependencyIds','testingHolds']){const r=evaluate(plan,fixture(),{[key]:[FIRST_THREE[0]]});assert.equal(r.decisions[0].eligible,false);}
});
test('active alias, rollback, identity drift and missing direct alias verification fail closed',()=>{
 const changes=[s=>s.aliases.push({alias:'test.example',deploymentId:FIRST_THREE[0]}),s=>s.deployments[0].isRollbackCandidate=true,s=>s.details[FIRST_THREE[0]].sha='a'.repeat(40),s=>delete s.deploymentAliases[FIRST_THREE[0]]];
 // Change the authoritative Git SHA rather than the optional normalized field.
 changes[2]=s=>s.details[FIRST_THREE[0]].meta.githubCommitSha='a'.repeat(40);
 for(const change of changes){const s=fixture();change(s);assert.equal(evaluate(plan,s,{}).decisions[0].eligible,false);}
});
test('production advancement preserves the new production and its predecessor',()=>{
 const s=fixture();const d={...s.deployments.find(d=>d.id===REQUIRED[0]),id:'dpl_new_production',created:now+1};s.deployments.push(d);s.aliases.forEach(a=>a.deploymentId=d.id);
 const r=evaluate(plan,s,{});assert.equal(r.currentProduction,d.id);assert.equal(r.predecessor,REQUIRED[0]);assert(r.decisions.every(d=>d.eligible));
});
test('incomplete pagination and conflicting production aliases stop the entire batch',()=>{
 const s=fixture();s.complete=false;assert.throws(()=>evaluate(plan,s,{}));s.complete=true;s.aliases[0].deploymentId=REQUIRED[1];assert.throws(()=>evaluate(plan,s,{}));
});
test('authorization or protection error stops at the first DELETE without retry',async()=>{
 const h=harness();let attempts=0;h.deps.remove=async()=>{attempts++;throw Error('403 protection');};
 await assert.rejects(runCleanup(plan,{execute:true,approval:approval(),review:review()},h.deps),/403/);assert.equal(attempts,1);assert.deepEqual(h.removed,[]);
});
test('audit failure stops before mutation',async()=>{
 const h=harness();h.deps.audit=async e=>{if(e.event==='delete-intent')throw Error('disk full');};
 await assert.rejects(runCleanup(plan,{execute:true,approval:approval(),review:review()},h.deps),/disk full/);assert.deepEqual(h.removed,[]);
});
test('alias assigned between dry-run and deletion blocks all DELETE requests',async()=>{
 const h=harness((s,n)=>{if(n>1)s.aliases.push({alias:'late-preview',deploymentId:FIRST_THREE[0]});});
 await assert.rejects(runCleanup(plan,{execute:true,approval:approval(),review:review()},h.deps),/Alias mappings changed/);assert.deepEqual(h.removed,[]);
});
test('successful batch deletes exactly three, verifies each, then stops; repeat is idempotent',async()=>{
 const h=harness();await runCleanup(plan,{execute:true,approval:approval(),review:review()},h.deps);assert.deepEqual(h.removed,FIRST_THREE);
 assert.equal(h.events.filter(e=>e.event==='post-delete-verified').length,3);
 await runCleanup(plan,{execute:true,approval:approval(),review:review(),completed:[...FIRST_THREE]},h.deps);assert.equal(h.removed.length,3);
});
test('post-deletion health mismatch stops before the second deployment',async()=>{
 const h=harness();let checks=0;h.deps.health=async()=>({manifests:[],resources:++checks===1?[]:[{status:500}]});
 await assert.rejects(runCleanup(plan,{execute:true,approval:approval(),review:review()},h.deps),/resources changed/);assert.equal(h.removed.length,1);
});
test('API transport pins account, host and deletion ID and never supplies an alias URL',async()=>{
 const requests=[];const api=makeApi('offline-fixture',async(url,options)=>{requests.push({url,options});return{ok:true,json:async()=>({uid:FIRST_THREE[0],state:'DELETED'})};});
 await api('DELETE','/v13/deployments/'+FIRST_THREE[0]);assert.equal(requests[0].url.origin,'https://api.vercel.com');assert.equal(requests[0].url.searchParams.get('teamId'),TEAM);assert.equal(requests[0].url.searchParams.has('url'),false);
 for(const [method,path,query]of [['POST','/v9/projects/'+PROJECT,{}],['DELETE','/v13/deployments/'+REQUIRED[0],{}],['GET','//attacker.example',{}],['GET','/v9/projects/'+PROJECT,{teamId:'other'}],['DELETE','/v13/deployments/'+FIRST_THREE[0],{url:'holm357.com'}]])await assert.rejects(api(method,path,query));
 assert.equal(requests.length,1);
});
test('GET authorization errors and repeated pagination cursors stop collection',async()=>{
 const denied=makeApi('offline-fixture',async()=>({ok:false,status:403}));await assert.rejects(collectSnapshot(denied),/403/);
 await assert.rejects(collectSnapshot(async(_,path)=>path.includes('/projects/')?fixture().project:path.includes('aliases')?{aliases:[],pagination:{count:0,next:1}}:{deployments:[],pagination:{count:0,next:1}}),/cursor repeated/);
});
test('health comparison rejects build or resource drift',()=>{assert.throws(()=>compareHealth({manifests:[1],resources:[]},{manifests:[2],resources:[]}));});
