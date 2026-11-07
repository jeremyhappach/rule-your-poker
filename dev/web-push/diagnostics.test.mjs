import test from 'node:test';import assert from 'node:assert/strict';
import {pushSnapshot,diagnosticUser,diagnosticMatch,diagnosticEvents,diagnosticUntil} from '../../src/lib/webPush/diagnostics.mjs';
import {createDiagnosticHandler,sanitizeSnapshot} from '../../server/webPush/diagnostics.mjs';
test('phone snapshot reads an old worker receipt and fingerprints local/subscription secrets',async()=>{
 const data={binding:{userId:diagnosticUser,binding:'private-binding'},receipts:[diagnosticEvents.failed],diagnostics:[]};
 const report=await pushSnapshot({registration:{active:{state:'activated'},pushManager:{getSubscription:async()=>({toJSON:()=>({endpoint:'https://web.push.apple.com/private-endpoint',keys:{p256dh:'private-key',auth:'private-auth'}})})},getNotifications:async()=>[{data:{eventId:diagnosticEvents.failed}}]},
  localBinding:{userId:diagnosticUser,id:'17bc3129-f596-4444-83e1-ad4c14682ac8',binding:'private-binding'},cacheStorage:{open:async()=>({match:async path=>new Response(JSON.stringify(data[path.split('/').at(-1)]))})},origin:'https://holm357.com',permission:'granted',standalone:true,visibility:'visible',activeVersion:'unavailable'});
 assert.equal(report.receipts.failed,true);assert.equal(report.receipts.morning,false);assert.equal(report.localBindingHash,report.workerBindingHash);
 assert.deepEqual(report.notifications,[diagnosticEvents.failed]);assert.equal(report.activeVersion,'unavailable');
 assert(!JSON.stringify(report).includes('private-'));assert.match(report.endpointHash,/^[0-9a-f]{64}$/);
});
test('missing on-device cache is reported separately from a missing receipt',async()=>{
 const report=await pushSnapshot({registration:null,localBinding:null,cacheStorage:{open:async()=>{throw new TypeError('secret');}},origin:'https://holm357.com'});
 assert.equal(report.cacheError,'TypeError');assert.equal(report.receipts,undefined);assert(!JSON.stringify(report).includes('secret'));
});
test('server diagnostic allowlist strips tokens, raw bindings, endpoint and unknown trace fields',()=>{
 const safe=sanitizeSnapshot({matchId:diagnosticMatch,access_token:'SECRET',endpoint:'SECRET',localBindingHash:'SECRET',trace:[{eventId:diagnosticEvents.failed,stage:'received',binding:'SECRET',at:123,errorName:'Error'}]});
 assert(!JSON.stringify(safe).includes('SECRET'));assert.equal(safe.trace[0].eventId,diagnosticEvents.failed);
 assert.throws(()=>sanitizeSnapshot({matchId:'different'}));
});
test('diagnostic HTTP receipt requires the scoped authenticated account, same origin and an unexpired size-limited request',async()=>{
 async function run({user=diagnosticUser,token='valid',now=diagnosticUntil-1000,body={matchId:diagnosticMatch},origin='https://holm357.com',method='POST'}={}){
  const recorded=[];let status,result;const handler=createDiagnosticHandler({verify:async()=>user,record:r=>recorded.push(r),now:()=>now});
  await handler({method,headers:{host:'holm357.com',origin,authorization:token?'Bearer '+token:undefined},body},{setHeader(){},set statusCode(v){status=v;},end(v){result=JSON.parse(v);}});
  return {status,result,recorded};
 }
 assert.equal((await run()).recorded.length,1);
 for(const [input,code]of [[{user:'other'},403],[{token:null},401],[{now:diagnosticUntil},410],[{origin:'https://elsewhere.invalid'},403],[{body:'x'.repeat(16385)},413],[{method:'GET'},405]]){
  const r=await run(input);assert.equal(r.status,code);assert.equal(r.recorded.length,0);
 }
});
