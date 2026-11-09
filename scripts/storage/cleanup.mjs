import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,openSync,writeSync,fsyncSync,closeSync,existsSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {probeProduction,compareHealth} from './cleanup-health.mjs';

export const TEAM='team_nQciG8fmHnUCogRJ7jaWawHq';
export const PROJECT='prj_ZvtOJ7ybERSObtP2WuhackqaS8Ds';
export const ALLOWLIST=Object.freeze(["dpl_HygmYvgTtqJwXXWDQ2oQn4JEtKtB","dpl_BDmoAMuKW7H2BHB6PkfG6eXoNTkA","dpl_CT6Z1qPgTueQ95p9oLxbq9QY5YwJ","dpl_F9Hyk5BrKRiV1DsYdhGG9p95zQrd","dpl_98gVba75crv5FY5JzNaGFsGVjnQN","dpl_8KfgkdVVfWTEmsxdZCtszL8FsTxQ","dpl_Gp2tU3F1K67r2u4ofaJeMdysv55o","dpl_7xCpvSG7PdNKDcpoFjx2BQbxyQQW","dpl_4pwNVo5GP2F6Do6eNyovqngqSHiB","dpl_8Vj8YxwypVXZVjTD4MY6NPN1UKWK","dpl_9unexg79SeLod2ooBk38gm3GhQPy","dpl_C9bfY3FeWbZ6HVEyK4yoyXH1gkXb","dpl_HVfwkjk2KrVFDo6EkzA87XSK1ivA","dpl_8Lr1KLyuzDtVbsePsGQWw2LGwQRa","dpl_35HxT5CjWjRdEW1TUxWx5YggQzvA","dpl_9FWyjDpXderHNqev73rcV1gK7H7L","dpl_56dijaBzpYuQcYtSPJFeRygQ1kNT","dpl_9q6n1TwmmxUTsd9w5rq5iRbVTAgC","dpl_3c8qCRB5Ab9pqToE5FeaLFT9jKbS","dpl_7tdKPHXYJDwe7edXThbFwhbnGzxh","dpl_HTow8nDGUzAzTim4JTiTokYG5a9x","dpl_BVkKyfihgnVkhj3Apj3nu51dYsCF","dpl_6noqqQFZdZ9xaSLTp2SvKHVQGPQ2","dpl_5B7tDAzAhbG4ynXham7fo3o6GmhG","dpl_2Anqd2PFeR1w1CUNf9JiDA6p8z1n","dpl_72J1wxQEz23j5zaHarr9x3wJTcfA","dpl_7tShrZGrMn4Px3cbkvnHT5GkFHQn"]);
export const FIRST_THREE=Object.freeze(ALLOWLIST.slice(0,3));
export const BATCH_IDS=Object.freeze(Object.fromEntries([
 ['ptown-storage-first-three-20261109',FIRST_THREE],
 ...Array.from({length:4},(_,i)=>['ptown-storage-remaining-'+(i+1)+'-of-4-20261109',Object.freeze(ALLOWLIST.slice(3+i*6,9+i*6))])
]));
export const REQUIRED=Object.freeze(['dpl_BDFK4NK8QiFFJeF6jUiuS1f12rHY','dpl_4n3BvhW4JnnEZzWg5WzUsQC1SSPH','dpl_BEoJpuZ5isvwcu77ggyri2rQPEYy','dpl_HtEQZ3FbutxpeYfZYunrr1DgbzVo']);
export const DOMAINS=Object.freeze(['holm357.com','ptown-poker.vercel.app','ptown-poker-jeremy-8e2b.vercel.app','ptown-poker-git-main-jeremy-8e2b.vercel.app']);
const idOf=a=>a.deploymentId??a.deployment?.id;
const sha=d=>d.meta?.githubCommitSha??d.sha;
const branch=d=>d.meta?.githubCommitRef??d.branch;
const created=d=>d.created??d.createdAt;
const state=d=>d.readyState??d.state;
export const batchHash=plan=>createHash('sha256').update(JSON.stringify(plan)).digest('hex');
export function validatePlan(plan){
 assert.equal(plan.teamId,TEAM);assert.equal(plan.projectId,PROJECT);
 const ids=BATCH_IDS[plan.batchId];assert(ids,'Unknown fixed batch');
 assert.equal(plan.maxDeletes,ids.length);assert(plan.maxDeletes<=6);
 assert.deepEqual(plan.candidates.map(d=>d.id),ids,'Only the exact fixed batch may be selected');
 for(const id of REQUIRED)assert(plan.mandatoryPreserve.includes(id),'Required hold removed');
 for(const d of plan.candidates){assert(ALLOWLIST.includes(d.id));assert(!REQUIRED.includes(d.id));assert(/^[a-f0-9]{40}$/.test(d.sha));}
}
export function validateApproval(plan,approval,now=Date.now()){
 assert(approval?.authorized===true,'Explicit approval file required; no authorization is bundled');
 assert.equal(approval.batchId,plan.batchId);assert.equal(approval.planSha256,batchHash(plan));
 assert.deepEqual(approval.ids,BATCH_IDS[plan.batchId]);assert.equal(approval.residualRiskAccepted,true);
 assert(typeof approval.authorizationReference==='string'&&approval.authorizationReference.trim().length>0);
 const issued=Date.parse(approval.authorizedAt);assert(Number.isFinite(issued)&&issued<=now&&now-issued<86400000,'Approval must be dated within 24 hours');
}
export function evaluate(plan,snapshot,review,completed=[]){
 validatePlan(plan);
 assert.equal(snapshot.project.id,PROJECT);assert.equal(snapshot.project.accountId,TEAM);
 assert.equal(snapshot.complete,true,'Complete deployment and alias pagination required');
 const aliases=snapshot.aliases.filter(a=>!a.deletedAt), deployments=snapshot.deployments;
 assert(Array.isArray(aliases)&&Array.isArray(deployments)&&deployments.length>0);
 const productionIds=DOMAINS.map(host=>{const a=aliases.filter(a=>a.alias===host);assert.equal(a.length,1,'Missing or duplicate production alias '+host);return idOf(a[0]);});
 assert.equal(new Set(productionIds).size,1,'Production aliases disagree');
 const current=deployments.find(d=>d.id===productionIds[0]);assert(current&&state(current)==='READY'&&current.target==='production','Production is not READY');
 const production=deployments.filter(d=>state(d)==='READY'&&d.target==='production').sort((a,b)=>created(b)-created(a));
 const predecessor=production.find(d=>created(d)<created(current));
 assert(predecessor,'No immediately preceding READY production deployment');
 const holds=new Set([...REQUIRED,...plan.mandatoryPreserve,...plan.knownTestingAndCheckpointHolds,...(review?.activeUsageIds??[]),...(review?.activeDependencyIds??[]),...(review?.testingHolds??[])]);
 for(const a of aliases){assert(idOf(a),'Alias target is unresolved');holds.add(idOf(a));}
 holds.add(current.id);holds.add(predecessor.id);production.slice(0,5).forEach(d=>holds.add(d.id));
 const latestPreviews=new Set();
 for(const d of [...deployments].sort((a,b)=>created(b)-created(a))){
  if(d.isRollbackCandidate===true||d.rollbackCandidate===true)holds.add(d.id);
  if(state(d)==='READY'&&d.target!=='production'&&!latestPreviews.has(branch(d))){latestPreviews.add(branch(d));holds.add(d.id);}
 }
 for(const id of REQUIRED)assert.equal(state(deployments.find(d=>d.id===id)??{}),'READY','Required checkpoint is not READY: '+id);
 const preservation=deployments.filter(d=>holds.has(d.id)).map(d=>[d.id,state(d),sha(d)]).sort();
 const decisions=plan.candidates.map(c=>{
  if(completed.includes(c.id))return{id:c.id,eligible:false,alreadyDeleted:true,reasons:['Confirmed successful deletion in this batch audit']};
  const d=deployments.find(d=>d.id===c.id),detail=snapshot.details?.[c.id],direct=snapshot.deploymentAliases?.[c.id],reasons=[];
  if(!d||!detail)reasons.push('Missing live identity');
  else {
   if(state(d)!=='READY'||state(detail)!=='READY')reasons.push('Not READY');
   if(sha(d)!==c.sha||sha(detail)!==c.sha||branch(d)!==c.branch||branch(detail)!==c.branch||created(d)!==c.created)reasons.push('Identity drift');
   if((detail.projectId??detail.project?.id)!==PROJECT)reasons.push('Wrong project');
   if(d.isRollbackCandidate!==false&&d.rollbackCandidate!==false)reasons.push('Rollback status not explicitly false');
   if(created(d)>=created(current))reasons.push('Not superseded by current production');
   if(detail.softDeletedByRetention===true||detail.deletedAt||detail.state==='DELETED')reasons.push('Deletion state needs reconciliation');
  }
  if(!Array.isArray(direct)||direct.length)reasons.push('Direct aliases present or unverified');
  if(holds.has(c.id))reasons.push('Production, alias, rollback, checkpoint, testing or usage hold');
  return{id:c.id,eligible:reasons.length===0,reasons};
 });
 return {currentProduction:current.id,currentSha:sha(current),predecessor:predecessor.id,aliasFingerprint:createHash('sha256').update(JSON.stringify(aliases.map(a=>[a.alias,idOf(a)]).sort())).digest('hex'),preservationFingerprint:createHash('sha256').update(JSON.stringify(preservation)).digest('hex'),holdCount:holds.size,inventoryCount:deployments.length,decisions,estimatedPublicBytes:plan.candidates.filter(c=>decisions.some(d=>d.id===c.id&&d.eligible)).reduce((n,c)=>n+c.estimatedPublicBytes,0)};
}
export function makeApi(token,fetchImpl=fetch,batchId='ptown-storage-first-three-20261109'){
 assert(token,'VERCEL_TOKEN is required for live REST access; never paste it into chat or a command argument');
 const ids=BATCH_IDS[batchId];assert(ids,'Unknown transport batch');
 return async(method,path,query={})=>{
  assert(['GET','DELETE'].includes(method),'No configuration mutations permitted');
  if(method==='DELETE')assert(ids.some(id=>path==='/v13/deployments/'+id),'DELETE outside fixed batch rejected');
  assert(path.startsWith('/')&&!path.startsWith('//')&&!path.includes('?')&&!path.includes('://'));
  assert(!Object.hasOwn(query,'url'),'Alias/URL deletion is forbidden');
  assert(!Object.hasOwn(query,'teamId')&&!Object.hasOwn(query,'slug'),'Scope override is forbidden');
  const url=new URL(path,'https://api.vercel.com');url.searchParams.set('teamId',TEAM);
  for(const [key,value]of Object.entries(query))if(value!==undefined)url.searchParams.set(key,String(value));
  const r=await fetchImpl(url,{method,headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!r.ok){const e=Error('Vercel '+method+' '+path+' returned '+r.status+'; stopped without retry');e.status=r.status;throw e;}
  const data=await r.json();Object.defineProperty(data,'__httpStatus',{value:r.status});return data;
 };
}
export async function collectSnapshot(api,ids=FIRST_THREE){
 const pageAll=async(path,key,query)=>{
  const rows=[],seen=new Set();let until;
  for(let page=0;page<50;page++){
   const data=await api('GET',path,{...query,limit:100,until});
   assert(data.pagination&&Number.isInteger(data.pagination.count),'Missing pagination metadata');
   assert(Array.isArray(data[key]),'Unexpected '+key+' response');rows.push(...data[key]);
   const next=data.pagination?.next;if(next===undefined||next===null)return rows;
   assert(!seen.has(next),'Pagination cursor repeated');seen.add(next);until=next;
  }throw Error('Pagination exceeded safe bound');
 };
 const [project,deployments,aliases]=await Promise.all([
  api('GET','/v9/projects/'+PROJECT),
  pageAll('/v7/deployments','deployments',{projectId:PROJECT}),
  pageAll('/v4/aliases','aliases',{projectId:PROJECT})
 ]);
 // REST lists use uid; the connector snapshots use id. Reject conflicting IDs.
 for(const d of deployments){
  assert(d.id===undefined||d.uid===undefined||d.id===d.uid,'Conflicting deployment identity');
  d.id??=d.uid;assert(typeof d.id==='string'&&d.id.startsWith('dpl_'),'Missing deployment identity');
 }
 const details={},deploymentAliases={};
 for(const id of ids){
  details[id]=await api('GET','/v13/deployments/'+id);
  const a=await api('GET','/v2/deployments/'+id+'/aliases');
  assert(Array.isArray(a.aliases)&&!a.pagination?.next,'Incomplete direct alias result');
  deploymentAliases[id]=a.aliases;
 }
 return {capturedAt:new Date().toISOString(),complete:true,project,deployments,aliases,details,deploymentAliases};
}
export async function runCleanup(plan,options,deps){
 validatePlan(plan);
 const execute=options.execute===true,completed=[...(options.completed??[])];
 if(execute){
  validateApproval(plan,options.approval);
  assert(options.review?.residualRiskAccepted===true,'A reviewed traffic/dependency assessment is required');
  const age=Date.now()-Date.parse(options.review.checkedAt);
  assert(age>=0&&age<3600000,'Traffic/dependency review must be refreshed within one hour');
  for(const id of completed)await deps.verifyRemoved(id);
 }
 const skipped=[],ids=BATCH_IDS[plan.batchId],allowSkips=ids!==FIRST_THREE;
 const pending=()=>ids.filter(id=>!completed.includes(id)&&!skipped.some(s=>s.id===id));
 const initial=await deps.collect(pending()),baseline=evaluate(plan,initial,options.review,completed);
 if(options.review?.campaignBaseline){
  for(const key of ['currentProduction','currentSha','aliasFingerprint','preservationFingerprint'])assert.equal(baseline[key],options.review.campaignBaseline[key],'Campaign baseline changed: '+key);
 }
 if(!allowSkips)assert(baseline.decisions.every(d=>d.eligible||d.alreadyDeleted),'Initial batch has exclusions: '+JSON.stringify(baseline.decisions));
 await deps.audit({event:execute?'preflight':'dry-run',...baseline,planSha256:batchHash(plan),snapshotAt:initial.capturedAt});
 if(!execute)return baseline;
 const beforeHealth=await deps.health(baseline.currentSha);
 await deps.audit({event:'health-before',health:beforeHealth});
 for(const id of pending()){
  const fresh=await deps.collect([id]),decision=evaluate(plan,fresh,options.review,completed);
  assert.equal(decision.currentProduction,baseline.currentProduction,'Production advanced during batch');
  assert.equal(decision.aliasFingerprint,baseline.aliasFingerprint,'Alias mappings changed during batch');
  assert.equal(decision.preservationFingerprint,baseline.preservationFingerprint,'Preserved deployments changed during batch');
  const candidateDecision=decision.decisions.find(d=>d.id===id);
  if(!candidateDecision?.eligible&&allowSkips){skipped.push({id,reasons:candidateDecision?.reasons??['Missing eligibility']});await deps.audit({event:'skipped',...skipped.at(-1)});continue;}
  assert(candidateDecision?.eligible,'Candidate became protected');
  const candidate=plan.candidates.find(d=>d.id===id);
  await deps.audit({event:'delete-intent',id,type:candidate.target??(candidate.branch==='main'?'production':'preview'),estimatedPublicBytes:candidate.estimatedPublicBytes,precheck:{snapshotAt:fresh.capturedAt,production:decision.currentProduction,sha:decision.currentSha,aliasFingerprint:decision.aliasFingerprint,preservationFingerprint:decision.preservationFingerprint,holdCount:decision.holdCount}});
  const receipt=await deps.remove(id);
  assert.equal(receipt.uid,id,'Deletion response identity mismatch');assert.equal(receipt.state,'DELETED','Deletion was not confirmed');
  await deps.audit({event:'delete-confirmed',id,type:candidate.target??(candidate.branch==='main'?'production':'preview'),estimatedPublicBytes:candidate.estimatedPublicBytes,receipt:{status:receipt.__httpStatus??null,uid:receipt.uid,state:receipt.state}});
  completed.push(id);
  await deps.audit({event:'delete-get-confirmed',id,confirmation:await deps.verifyRemoved(id)});
  const after=await deps.collect([]),checked=evaluate(plan,after,options.review,completed);
  assert.equal(checked.currentProduction,baseline.currentProduction,'Production changed after deletion');
  assert.equal(checked.aliasFingerprint,baseline.aliasFingerprint,'Aliases changed after deletion');
  assert.equal(checked.preservationFingerprint,baseline.preservationFingerprint,'Preserved deployments changed after deletion');
  const afterHealth=await deps.health(baseline.currentSha);compareHealth(beforeHealth,afterHealth);
  await deps.audit({event:'post-delete-verified',id,production:checked.currentProduction,sha:checked.currentSha,aliasFingerprint:checked.aliasFingerprint,preservationFingerprint:checked.preservationFingerprint,inventoryCount:checked.inventoryCount,resourceChecks:afterHealth.resources.length});
 }
 await deps.audit({event:'batch-complete',ids:completed,skipped,estimatedPublicBytes:plan.candidates.filter(c=>completed.includes(c.id)).reduce((n,c)=>n+c.estimatedPublicBytes,0),storageRecovery:'pending account verification; never infer more deletion authority from unchanged usage'});
 return {completed,skipped};
}
async function main(){
 const args=process.argv.slice(2),allowed=new Set(['--execute','--snapshot','--review','--approval','--audit','--plan']);
 for(let i=0;i<args.length;i++){assert(allowed.has(args[i]),'Unknown option '+args[i]);if(args[i]!=='--execute'){assert(args[i+1]&&!args[i+1].startsWith('--'),'Missing option value');i++;}}
 const value=key=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
 const plan=JSON.parse(readFileSync(value('--plan')??new URL('./cleanup-first-batch.json',import.meta.url),'utf8')),execute=args.includes('--execute');validatePlan(plan);
 assert(!(execute&&value('--snapshot')),'Execution may never use a saved snapshot');
 if(execute)assert(value('--review')&&value('--approval'),'Execution requires review and explicit approval files');
 const read=path=>path?JSON.parse(readFileSync(path,'utf8')):undefined;
 const review=read(value('--review')),approval=read(value('--approval')),snapshot=read(value('--snapshot'));
 const log=resolve(value('--audit')??'.storage-audit/cleanup/'+(execute?'execution':'dry-run')+'.jsonl');
 mkdirSync(dirname(log),{recursive:true});
 const lockPath=resolve('.storage-audit/cleanup/'+plan.batchId+'.lock');
 let lock;
 if(execute){mkdirSync(dirname(lockPath),{recursive:true});lock=openSync(lockPath,'wx');}
 const audit=async event=>{const fd=openSync(log,'a');try{writeSync(fd,JSON.stringify({at:new Date().toISOString(),batchId:plan.batchId,...event})+'\n');fsyncSync(fd);}finally{closeSync(fd);}};
 try{
  const past=existsSync(log)?readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];
  const completed=[...new Set(past.filter(e=>e.event==='delete-confirmed'&&e.batchId===plan.batchId).map(e=>e.id))];
  assert(past.every(e=>e.batchId===plan.batchId),'Audit belongs to another fixed batch');
  assert(!past.some(e=>e.event==='delete-intent'&&!completed.includes(e.id)),'Unconfirmed deletion intent requires read-only reconciliation; never retry automatically');
  for(const id of completed)assert(BATCH_IDS[plan.batchId].includes(id),'Invalid audit receipt');
  const api=snapshot?null:makeApi(process.env.VERCEL_TOKEN,fetch,plan.batchId);
  const result=await runCleanup(plan,{execute,approval,review,completed},{
   collect:ids=>snapshot?Promise.resolve(snapshot):collectSnapshot(api,ids),
   health:sha=>probeProduction(sha),
   remove:id=>api('DELETE','/v13/deployments/'+id),
   verifyRemoved:async id=>{try{const d=await api('GET','/v13/deployments/'+id);assert(d.state==='DELETED'||d.readyState==='DELETED'||d.deletedAt,'Deleted deployment still READY');return {status:d.__httpStatus,state:'DELETED'};}catch(e){if(![404,410].includes(e.status))throw e;return {status:e.status};}},
   audit
  });
  console.log(JSON.stringify({mode:execute?'EXECUTED':'DRY RUN — no DELETE requests',...result},null,2));
 }catch(e){await audit({event:'stopped-error',message:e.message});throw e;}
 finally{if(lock!==undefined){closeSync(lock);unlinkSync(lockPath);}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
