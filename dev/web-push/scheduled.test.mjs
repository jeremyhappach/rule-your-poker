import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{createScheduledHandler,scheduledBatch}from'../../server/webPush/scheduled.mjs';
async function invoke(options,method='GET',authorization){let output;const res={setHeader(){},end(body){output={status:this.statusCode,body:JSON.parse(body)};}};await createScheduledHandler(options)({method,headers:{authorization}},res);return output;}
test('scheduled endpoint is closed by default and rejects missing/wrong auth and methods',async()=>{
 const secret='x'.repeat(40);let called=0;const config={enabled:true,secret,run:async()=>{called++;return {processed:2};}};
 assert.equal((await invoke({...config,enabled:false})).status,503);assert.equal((await invoke(config)).status,401);
 assert.equal((await invoke(config,'GET','Bearer '+'y'.repeat(40))).status,401);
 assert.equal((await invoke(config,'POST','Bearer '+secret)).status,405);assert.equal(called,0);
 assert.equal((await invoke(config,'GET','Bearer '+secret)).body.processed,2);assert.equal(called,1);
 assert.equal((await invoke({...config,run:async()=>{throw Error('must not expose details');}},'GET','Bearer '+secret)).body.error,'push:worker_failed');
});
test('between-job budget stops batch and configured duration covers worst in-flight job',async()=>{
 let time=0,claims=0;const rpc=async name=>{if(name==='async_push_claim'){claims++;return {eventId:'e',subscriptionId:'s',lease:'l'};}if(name==='async_push_authorize')return {};return true;};
 const result=await scheduledBatch(rpc,async()=>{time+=6000;return {status:201};},{now:()=>time});assert.equal(result.processed,2);assert.equal(claims,2);
 const duration=JSON.parse(readFileSync('vercel.json')).functions['api/web-push.ts'].maxDuration;
 assert(duration*1000>10000+10000+10000+15000+10000);
});
