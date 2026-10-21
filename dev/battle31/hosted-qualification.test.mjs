import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {requireLiveScheduler,qualifyInstalled} from './hosted-qualification.mjs';

const now=Date.now(),fresh=new Date(now-1000).toISOString(),stale=new Date(now-60000).toISOString();
const calls=[];
function stub(overrides={}) {
 return {query:async(sql)=>{
  calls.push(sql);assert(!/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|COMMIT)\b/i.test(sql),'health preflight must only read');
  if(sql.includes('to_regclass'))return {rows:[{present:null}]};
  if(sql.includes('pg_extension'))return {rows:overrides.extensions??[{extname:'pg_cron'}]};
  if(sql.includes('cron.job_run_details'))return {rows:overrides.executions??Array.from({length:3},()=>({status:'succeeded',end_time:fresh}))};
  if(sql.includes('cron.job'))return {rows:overrides.jobs??[{jobid:7,active:true,schedule:'1 second',command:"SET statement_timeout='3s'; SELECT private.battle31_recover()"}]};
  return {rows:[{health:overrides.health??{last_completed_at:fresh,last_outcome:'completed'}}]};
 }};
}
const cases=[];
await requireLiveScheduler(stub(),now);cases.push('accepts three successful recent executions and actual healthy dispatcher');
for(const [label,overrides,pattern] of [
 ['metadata stub rejected',{extensions:[]},/Actual pg_cron/],
 ['missing job rejected',{jobs:[]},/Exactly one/],
 ['stale cron rejected',{executions:Array.from({length:3},()=>({status:'succeeded',end_time:stale}))},/stale/],
 ['failed cron rejected',{executions:Array.from({length:3},()=>({status:'failed',end_time:fresh}))},/failure/],
 ['stale dispatcher rejected',{health:{last_completed_at:stale,last_outcome:'completed'}},/stale/],
 ['partial dispatcher rejected',{health:{last_completed_at:fresh,last_outcome:'partial_failure'}},/failed/],
]) {await assert.rejects(requireLiveScheduler(stub(overrides),now),pattern);cases.push(label);}
await assert.rejects(qualifyInstalled(stub()),/Install and qualify/);cases.push('absent package refused before fixture writes');
const driver=read('dev/battle31/hosted-qualification.mjs','utf8');
assert(!/from ['"]\.\/database\.mjs/.test(driver));
assert(!/seedLocalHealth\s*:/.test(driver));
const evidence={passed:true,cases,readOnlyPreflightQueries:calls.length,hostedExecutionPerformed:false};
write('dev/battle31/evidence/hosted-preflight.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
