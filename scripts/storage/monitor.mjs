// Read-only inventory and review plan. This module has no deletion transport.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {TEAM,PROJECT,REQUIRED,DOMAINS,collectSnapshot} from './cleanup.mjs';

const id=d=>d.id??d.uid,sha=d=>d.sha??d.meta?.githubCommitSha;
const state=d=>d.state??d.readyState,created=d=>d.created??d.createdAt;
const branch=d=>d.branch??d.meta?.githubCommitRef;
export function readOnlyApi(token,fetchImpl=fetch){
  assert(token,'Supply VERCEL_TOKEN through the environment, never a command argument');
  return async(method,path,query={})=>{
    assert.equal(method,'GET','Storage monitoring cannot mutate Vercel');
    assert(['/v9/projects/'+PROJECT,'/v7/deployments','/v4/aliases'].includes(path),'Unexpected read endpoint');
    assert(!('teamId'in query)&&!('slug'in query),'Scope override forbidden');
    if(path!=='/v9/projects/'+PROJECT)assert.equal(query.projectId,PROJECT);
    const url=new URL(path,'https://api.vercel.com');url.searchParams.set('teamId',TEAM);
    for(const [k,v]of Object.entries(query))if(v!==undefined)url.searchParams.set(k,String(v));
    const r=await fetchImpl(url,{method:'GET',headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});
    assert(r.ok,'Vercel read failed: '+r.status);return r.json();
  };
}
export function gitAssets(commit){
  if(!/^[a-f0-9]{40}$/.test(commit??''))return null;
  try{
    const data=execFileSync('git',['ls-tree','-r','-l','-z',commit,'--','public','src/assets'],{encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
    const files=data.split('\0').filter(Boolean).map(row=>{
      const match=row.match(/^\d+ blob ([a-f0-9]+)\s+(\d+)\t(.+)$/s);assert(match,'Non-blob asset');
      return {hash:match[1],bytes:Number(match[2]),path:match[3]};
    });
    if(!files.length)return null;
    return {bytes:files.reduce((sum,f)=>sum+f.bytes,0),files};
  }catch{return null;}
}
export function storageReport(snapshot,{previous,testingHolds=[],usageGb,usageObservedAt,estimate=gitAssets,candidateSha}={}){
  assert.equal(snapshot.complete,true,'Complete pagination required');
  assert.equal(snapshot.project.id,PROJECT);assert.equal(snapshot.project.accountId,TEAM);
  const deployments=snapshot.deployments,aliases=snapshot.aliases.filter(a=>!a.deletedAt);
  assert(Array.isArray(deployments)&&deployments.length>0);assert.equal(new Set(deployments.map(id)).size,deployments.length,'Duplicate deployment pages');
  const holds=new Map();const hold=(key,reason)=>{if(key){if(!holds.has(key))holds.set(key,new Set());holds.get(key).add(reason);}};
  for(const a of aliases){const key=a.deploymentId??a.deployment?.id;assert(key,'Unresolved alias');hold(key,'active alias');}
  for(const key of [...REQUIRED,...testingHolds])hold(key,'required testing/checkpoint');
  const domainIds=DOMAINS.map(host=>{const rows=aliases.filter(a=>a.alias===host);assert.equal(rows.length,1,'Missing production alias: '+host);return rows[0].deploymentId??rows[0].deployment?.id;});
  assert.equal(new Set(domainIds).size,1,'Production aliases disagree');
  const current=deployments.find(d=>id(d)===domainIds[0]);assert(current&&state(current)==='READY'&&current.target==='production','Current production must be READY');
  const production=deployments.filter(d=>d.target==='production'&&state(d)==='READY').sort((a,b)=>created(b)-created(a));
  const predecessor=production.find(d=>created(d)<created(current));assert(predecessor,'Immediate rollback missing');
  hold(id(current),'current production');hold(id(predecessor),'immediate predecessor');
  production.slice(0,5).forEach(d=>hold(id(d),'latest five production checkpoints'));
  const branches=new Set();
  for(const d of [...deployments].sort((a,b)=>created(b)-created(a))){
    if(d.rollbackCandidate!==false&&d.isRollbackCandidate!==false)hold(id(d),'rollback candidate or unknown rollback status');
    if(state(d)==='READY'&&d.target!=='production'){
      const key=branch(d);if(!key)hold(id(d),'unknown preview branch');
      else if(!branches.has(key)){branches.add(key);hold(id(d),'latest READY branch preview');}
    }
  }
  const cache=new Map(),unique=new Map(),contributors={},byState={},byTarget={},duplicates=new Map();let estimatedBytes=0,measured=0;
  const rows=deployments.map(d=>{
    byState[state(d)]=(byState[state(d)]??0)+1;byTarget[d.target??'preview']=(byTarget[d.target??'preview']??0)+1;
    // Failed/canceled builds may retain partial output, which Git cannot measure.
    let assets=null;if(state(d)==='READY'){
      if(!cache.has(sha(d)))cache.set(sha(d),estimate(sha(d)));assets=cache.get(sha(d));
    }
    if(assets){measured++;estimatedBytes+=assets.bytes;for(const f of assets.files){unique.set(f.hash,f.bytes);const folder=f.path.split('/').slice(0,2).join('/');contributors[folder]=(contributors[folder]??0)+f.bytes;}}
    if(state(d)==='READY'&&sha(d)){const key=(d.target??'preview')+':'+sha(d);if(!duplicates.has(key))duplicates.set(key,[]);duplicates.get(key).push(id(d));}
    const reasons=[...(holds.get(id(d))??[])];
    if(state(d)!=='READY')reasons.push('non-READY output needs separate review');
    if(created(d)>=created(current))reasons.push('not superseded by current production');
    return {id:id(d),sha:sha(d)??null,branch:branch(d)??null,url:d.url,state:state(d),target:d.target??'preview',created:created(d),estimatedAssetBytes:assets?.bytes??null,holds:reasons,
      disposition:reasons.length?'retain':'review only — usage/dependencies and explicit deletion approval still required'};
  });
  const oldIds=previous?new Set(previous.deployments.map(id)):null;
  const usage=usageGb===undefined?null:Number(usageGb);assert(usage===null||(Number.isFinite(usage)&&usage>=0&&Number.isFinite(Date.parse(usageObservedAt))),'Usage needs a nonnegative measurement and observation date');
  const unresolvedAliasTargets=[...new Set(aliases.map(a=>a.deploymentId??a.deployment?.id))].filter(key=>!rows.some(d=>d.id===key));
  const missingRequiredCheckpoints=REQUIRED.filter(key=>!rows.some(d=>d.id===key&&d.state==='READY'));
  const cleanupBlocked=unresolvedAliasTargets.length>0||missingRequiredCheckpoints.length>0;
  return {schemaVersion:1,capturedAt:snapshot.capturedAt,projectId:PROJECT,teamId:TEAM,mode:'READ ONLY / DRY RUN — no deletion authorization',
    retainedCount:rows.length,aliasCount:aliases.length,byState,byTarget,currentProduction:id(current),currentSha:sha(current),immediateRollback:id(predecessor),
    usage:{gb:usage,observedAt:usageObservedAt??null,source:usage===null?'unavailable':'operator-provided dashboard reading; not verified by this report',threshold:usage===null?'unknown':usage>=9.5?'critical':usage>=9?'warning':'below-warning'},
    assetEstimate:{logicalRetainedBytes:estimatedBytes,uniqueGitBlobBytes:[...unique.values()].reduce((n,v)=>n+v,0),coveredDeployments:measured,unknownDeployments:rows.length-measured,
      basis:'Git public + src/assets for READY deployments with locally available SHAs; raw bytes, excludes bundles/functions/partial builds. Unique Git blobs are not Vercel billing deduplication.',
      majorContributors:Object.entries(contributors).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([path,bytes])=>({path,bytes}))},
    newDeployments:oldIds?rows.filter(d=>!oldIds.has(d.id)).map(d=>d.id):null,
    noLongerListed:oldIds?[...oldIds].filter(key=>!rows.some(d=>d.id===key)):null,
    unresolvedAliasTargets,missingRequiredCheckpoints,cleanupBlocked,
    redundantReadyGroups:[...duplicates.entries()].filter(([,ids])=>ids.length>1).map(([key,ids])=>({key,ids})),
    existingCandidateDeployments:candidateSha?rows.filter(d=>d.sha===candidateSha&&d.state==='READY').map(d=>({id:d.id,target:d.target,url:d.url})):[],
    reviewCandidates:cleanupBlocked?[]:rows.filter(d=>d.holds.length===0).map(d=>d.id),deployments:rows};
}
async function main(){
  const args=process.argv.slice(2),allowed=new Set(['--live','--snapshot','--previous','--json','--save-snapshot','--testing-holds','--usage-gb','--usage-observed-at','--candidate-sha']);
  const opts={};for(let i=0;i<args.length;i++){const key=args[i];assert(allowed.has(key),'Unknown option '+key);assert(!(key in opts),'Duplicate option');opts[key]=key==='--live'?true:args[++i];assert(opts[key]&&!String(opts[key]).startsWith('--'),'Missing value');}
  assert(Boolean(opts['--live'])!==Boolean(opts['--snapshot']),'Choose --live or --snapshot');
  const read=p=>JSON.parse(readFileSync(p,'utf8'));
  const snapshot=opts['--live']?await collectSnapshot(readOnlyApi(process.env.VERCEL_TOKEN),[]):read(opts['--snapshot']);
  const report=storageReport(snapshot,{previous:opts['--previous']?read(opts['--previous']):undefined,testingHolds:opts['--testing-holds']?read(opts['--testing-holds']):[],usageGb:opts['--usage-gb'],usageObservedAt:opts['--usage-observed-at'],candidateSha:opts['--candidate-sha']});
  const save=(p,value)=>{mkdirSync(dirname(resolve(p)),{recursive:true});writeFileSync(p,JSON.stringify(value,null,2)+'\n');};
  if(opts['--save-snapshot'])save(opts['--save-snapshot'],snapshot);if(opts['--json'])save(opts['--json'],report);
  console.log(JSON.stringify({...report,deployments:undefined},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
