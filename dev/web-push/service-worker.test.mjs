import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
function fixture({trace=false,diagnosticWriteFails=false,now}={}){
 const handlers={},store=new Map(),shown=[],navigation=[];
 const self={location:{origin:'https://local.invalid'},addEventListener:(name,fn)=>handlers[name]=fn,
  registration:{getNotifications:async()=>[],showNotification:async(title,options)=>{const previous=shown.findIndex(n=>n.tag===options.tag);if(previous>=0)shown.splice(previous,1);shown.push({title,...options});}},
  clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async path=>navigation.push(path)}};
 let source=readFileSync('public/ptown-push-sw.js','utf8');
 if(trace)source=source.replace('d78bc9e8-2ede-4bbd-9032-80cfdef01aa6',payload.matchId).replace('ce088752b9efb265bf36c0cb633c195a2d829c9aaf55d0476eaa6ed8c4c78111',createHash('sha256').update(payload.binding).digest('hex'));
 const fixedNow=now??(trace?Date.parse('2026-11-07T16:00:00Z'):undefined);
 class Channel{constructor(){this.port1={close(){},onmessage:null};this.port2={postMessage:data=>this.port1.onmessage?.({data})};}}
 vm.runInNewContext(source,{self,URL,Response,TextEncoder,MessageChannel:Channel,setTimeout,clearTimeout,crypto:webcrypto,Date:class extends Date{static now(){return fixedNow??Date.now();}},caches:{open:async()=>({match:async key=>store.get(key)?.clone(),put:async(key,value)=>{if(diagnosticWriteFails&&key.endsWith('/diagnostics'))throw Error('disk unavailable');store.set(key,value);}})}});
 const fire=async(name,event)=>{let task;handlers[name]({...event,waitUntil:p=>task=p});await task;};
 const bind=value=>fire('message',{source:{url:'https://local.invalid/'},data:{type:'push-binding',value},ports:[{postMessage:()=>{}}]});
 return {fire,bind,shown,navigation,self,read:async name=>(await store.get('https://local.invalid/__push_local__/'+name)?.clone().json())};
}
const payload={eventId:'11111111-1111-4111-8111-111111111111',matchId:'22222222-2222-4222-8222-222222222222',binding:'binding-a',kind:'turn',expiresAt:Date.now()+60000};

test('scoped worker trace distinguishes binding rejection, successful display and silent retry without raw secrets',async()=>{
 const f=fixture({trace:true});await f.bind({binding:'wrong',userId:'other'});
 await f.fire('push',{data:{json:()=>payload}});
 assert.equal(f.shown.length,0);assert.equal((await f.read('diagnostics')).at(-1).stage,'binding_rejected');
 await f.bind({binding:payload.binding,userId:'d7dc1928-3727-4351-b0ff-0e80c81c2953'});
 const fresh={...payload,expiresAt:Date.parse('2026-11-08T00:00:00Z')};
 await f.fire('push',{data:{json:()=>fresh}});await f.fire('push',{data:{json:()=>fresh}});
 const log=await f.read('diagnostics');
 assert(log.some(x=>x.stage==='show_resolved'));assert.equal(log.at(-1).stage,'receipt_saved');
 assert.equal(log.filter(x=>x.stage==='show_attempt').at(-1).silent,true);
 assert(!JSON.stringify(log).includes('binding-a'));assert(!JSON.stringify(log).includes('wrong'));
});
test('worker trace records showNotification rejection and never fabricates a saved receipt',async()=>{
 const f=fixture({trace:true});await f.bind({binding:payload.binding});
 f.self.registration.showNotification=async()=>{const e=Error('blocked');e.name='NotAllowedError';throw e;};
 await assert.rejects(f.fire('push',{data:{json:()=>payload}}),/blocked/);
 const log=await f.read('diagnostics');assert(log.some(x=>x.stage==='show_rejected'&&x.errorName==='NotAllowedError'));
 assert(!(await f.read('receipts')).includes(payload.eventId));
});
test('trace follows Hap reenrollment in the scoped match without tracing another account',async()=>{
 for(const userId of ['d7dc1928-3727-4351-b0ff-0e80c81c2953','other-account']){
  const f=fixture({trace:true});await f.bind({binding:'new-binding',userId});
  await f.fire('push',{data:{json:()=>({...payload,binding:'new-binding'})}});
  assert.equal(f.shown.length,1);
  if(userId==='other-account')assert.equal(await f.read('diagnostics'),undefined);
  else assert.equal((await f.read('diagnostics')).at(-1).stage,'receipt_saved');
 }
});
test('diagnostic storage failures, other matches and expired scope cannot affect delivery',async()=>{
 for(const options of [{trace:true,diagnosticWriteFails:true},{},{trace:true,now:Date.parse('2026-11-10T00:00:00Z')}]){
  const f=fixture(options);await f.bind({binding:payload.binding});await f.fire('push',{data:{json:()=>payload}});
  assert.equal(f.shown.length,1);assert((await f.read('receipts')).includes(payload.eventId));assert.equal(await f.read('diagnostics'),undefined);
 }
});

test('turns name each opponent and retain the existing match receipt and destination',async()=>{
 const f=fixture();await f.bind({binding:'binding-a'});
 for(const [suffix,opponentName] of [['3','mcru81'],['4','Happach Gmail']]){
  const p={...payload,eventId:suffix.repeat(8)+'-1111-4111-8111-111111111111',matchId:suffix.repeat(8)+'-2222-4222-8222-222222222222',opponentName};
  await f.fire('push',{data:{json:()=>p}});
  const notice=f.shown.find(n=>n.tag==='ptown-match-'+p.matchId);
  assert.equal(notice.body,'Your turn in an async match with '+opponentName+'.');
  await f.fire('notificationclick',{notification:{data:notice.data,close:()=>{}}});
  assert.equal(f.navigation.at(-1),'/delayed/'+p.matchId);
  await f.fire('push',{data:{json:()=>p}});
  assert.equal(f.shown.find(n=>n.tag===notice.tag).silent,true);
 }
 assert.equal(f.shown.length,2);
});

test('registration alert deduplicates and opens the exact admin player record',async()=>{
 const f=fixture();await f.bind({binding:'binding-a'});
 const p={...payload,kind:'registration',registrationUserId:payload.matchId,username:'newplayer87'};
 await f.fire('push',{data:{json:()=>p}});
 assert.equal(f.shown[0].title,'New P-Town Poker User');
 assert.equal(f.shown[0].body,'newplayer87 — Approval Required');
 await f.fire('push',{data:{json:()=>p}});
 assert.equal(f.shown.length,1);assert.equal(f.shown[0].silent,true);
 await f.fire('notificationclick',{notification:{data:f.shown[0].data,close:()=>{}}});
 assert.deepEqual(f.navigation,['/?adminPlayer='+payload.matchId]);
 await f.bind({binding:'different-account'});
 await f.fire('push',{data:{json:()=>p}});assert.equal(f.shown.length,1);
});

test('all push kinds render event titles and ignore unauthorized display fields',async()=>{
 for(const [kind,title,body] of [
  ['turn','Your turn','Your turn in an async match.'],
  ['invite','New Match Invitation','You have a new async match invitation.'],
  ['last_call','Last Call!','An async turn is still waiting. Check its deadline.'],
  ['table_open','New Table Available','A new table is open for joining.'],
 ]){
  const f=fixture();await f.bind({binding:'binding-a'});
  await f.fire('push',{data:{json:()=>({...payload,kind,tableId:payload.matchId,title:'SECRET',body:'SECRET',gameName:'SECRET',stake:900,balance:900,rack:'SECRET',score:900})}});
  assert.equal(f.shown.length,1);assert.equal(f.shown[0].title,title);assert.equal(f.shown[0].body,body);
  assert.equal(f.shown[0].silent,false);assert.equal(f.shown[0].renotify,kind!=='table_open');
  assert.equal(f.shown[0].tag,(kind==='table_open'?'ptown-table-':'ptown-match-')+payload.matchId);
  assert(!/SECRET|900|poker|ptown|money/i.test(JSON.stringify({title:f.shown[0].title,body:f.shown[0].body})));
  await f.fire('push',{data:{json:()=>({...payload,kind,tableId:payload.matchId,expiresAt:Date.now()-1})}});
  assert.equal(f.shown[0].title,kind==='table_open'?'Table Update':'Match Update');assert.equal(f.shown[0].silent,true);
 }
});
test('fresh async events re-alert over an earlier same-match alert, but retries and expired events stay silent',async()=>{
 for(const kind of ['invite','turn','last_call']){
  const f=fixture();await f.bind({binding:'binding-a'});
  await f.fire('push',{data:{json:()=>payload}});
  const fresh={...payload,kind,eventId:'44444444-4444-4444-8444-444444444444'};
  await f.fire('push',{data:{json:()=>fresh}});
  assert.equal(f.shown.length,1);assert.equal(f.shown[0].tag,'ptown-match-'+payload.matchId);
  assert.equal(f.shown[0].data.eventId,fresh.eventId);
  assert.equal(f.shown[0].renotify,true);assert.equal(f.shown[0].silent,false);
  await f.fire('push',{data:{json:()=>fresh}});
  assert.equal(f.shown.length,1);assert.equal(f.shown[0].renotify,false);assert.equal(f.shown[0].silent,true);
  const expired={...fresh,eventId:'55555555-5555-4555-8555-555555555555',expiresAt:Date.now()-1};
  await f.fire('push',{data:{json:()=>expired}});
  assert.equal(f.shown[0].renotify,false);assert.equal(f.shown[0].silent,true);
 }
});

test('fresh table and registration replacements retain their existing alert behavior',async()=>{
 for(const kind of ['table_open','registration']){
  const f=fixture();await f.bind({binding:'binding-a'});
  const p={...payload,kind,tableId:payload.matchId,registrationUserId:payload.matchId};
  await f.fire('push',{data:{json:()=>p}});
  await f.fire('push',{data:{json:()=>({...p,eventId:'44444444-4444-4444-8444-444444444444'})}});
  assert.equal(f.shown.length,1);assert.equal(f.shown[0].renotify,false);assert.equal(f.shown[0].silent,false);
 }
});

test('worker persists receipt across duplicate delivery and never displays private game data',async()=>{
 const f=fixture();await f.bind({binding:'binding-a'});await f.fire('push',{data:{json:()=>({...payload,rack:'SECRET',score:900})}});await f.fire('push',{data:{json:()=>payload}});
 assert.equal(f.shown.length,1);assert.equal(f.shown[0].silent,true);assert(!JSON.stringify(f.shown).includes('SECRET'));assert(!JSON.stringify(f.shown).includes('900'));
 await f.fire('notificationclick',{notification:{data:f.shown[0].data,close:()=>{}}});assert.deepEqual(f.navigation,['/delayed/'+payload.matchId]);
});
test('expired delivery stays user-visible without claiming an actionable turn or alerting',async()=>{
 const f=fixture();await f.bind({binding:'binding-a'});await f.fire('push',{data:{json:()=>({...payload,expiresAt:Date.now()-1})}});
 assert.equal(f.shown[0].body,'Open the app to check your async matches.');assert.equal(f.shown[0].silent,true);
});
test('logout and account switching reject queued old-account pushes and clicks',async()=>{
 const f=fixture();await f.bind({binding:'binding-a'});await f.bind(null);await f.fire('push',{data:{json:()=>payload}});assert.equal(f.shown.length,0);
 await f.bind({binding:'binding-b'});await f.fire('push',{data:{json:()=>payload}});assert.equal(f.shown.length,0);
 await f.fire('notificationclick',{notification:{data:payload,close:()=>{}}});assert.equal(f.navigation.length,0);
 await f.fire('push',{data:{json:()=>({...payload,binding:'binding-b'})}});assert.equal(f.shown.length,1);
});
test('worker serializes simultaneous duplicate events and rejects foreign binding messages',async()=>{
 const f=fixture();await f.fire('message',{source:{url:'https://evil.invalid/'},data:{type:'push-binding',value:{binding:'binding-a'}},ports:[]});
 await f.fire('push',{data:{json:()=>payload}});assert.equal(f.shown.length,0);await f.bind({binding:'binding-a'});
 await Promise.all([f.fire('push',{data:{json:()=>payload}}),f.fire('push',{data:{json:()=>payload}})]);assert.equal(f.shown.length,1);
});
test('real-money table alerts are generic, deduplicated and click through the guarded landing route',async()=>{
 const f=fixture();await f.bind({binding:'binding-a'});
 const p={...payload,kind:'table_open',matchId:null,tableId:'33333333-3333-4333-8333-333333333333',name:'RESTRICTED NAME'};
 await f.fire('push',{data:{json:()=>p}});await f.fire('push',{data:{json:()=>p}});
 assert.equal(f.shown.length,1);assert.equal(f.shown[0].silent,true);assert(!JSON.stringify(f.shown).includes('RESTRICTED'));
 await f.fire('notificationclick',{notification:{data:f.shown[0].data,close:()=>{}}});
 assert.deepEqual(f.navigation,['/notifications/table/'+p.tableId]);
 await f.bind({binding:'other'});await f.fire('notificationclick',{notification:{data:f.shown[0].data,close:()=>{}}});assert.equal(f.navigation.length,1);
});
test('expired table pushes never claim the table is open; malformed targets cannot navigate',async()=>{
 const f=fixture();await f.bind({binding:'binding-a'});
 await f.fire('push',{data:{json:()=>({...payload,kind:'table_open',tableId:payload.matchId,expiresAt:Date.now()-1})}});
 assert.equal(f.shown[0].body,'Open the app to check available tables.');assert.equal(f.shown[0].silent,true);
 await f.fire('notificationclick',{notification:{data:{binding:'binding-a',kind:'table_open',tableId:'https://evil.invalid'},close:()=>{}}});assert.equal(f.navigation.length,0);
});
test('invitation uses guarded match landing, suppresses duplicate alerts and shares the match tag with a later turn',async()=>{
 const f=fixture();await f.bind({binding:'binding-a'});const invite={...payload,kind:'invite'};
 await f.fire('push',{data:{json:()=>invite}});assert.equal(f.shown[0].body,'You have a new async match invitation.');
 await f.fire('push',{data:{json:()=>invite}});assert.equal(f.shown.length,1);assert.equal(f.shown[0].silent,true);
 await f.fire('notificationclick',{notification:{data:f.shown[0].data,close:()=>{}}});assert.deepEqual(f.navigation,['/delayed/'+payload.matchId]);
 await f.fire('push',{data:{json:()=>({...payload,eventId:'44444444-4444-4444-8444-444444444444'})}});assert.equal(f.shown.length,1);assert.equal(f.shown[0].body,'Your turn in an async match.');
 await f.fire('push',{data:{json:()=>({...invite,expiresAt:Date.now()-1})}});assert.equal(f.shown[0].body,'Open the app to check your async matches.');assert.equal(f.shown[0].silent,true);
});

test('cold registration destination survives auth restoration, is owner-bound and clears only on record acknowledgement',async()=>{
 const f=fixture();await f.bind({binding:'binding-a',userId:'admin-a'});
 const p={...payload,kind:'registration',registrationUserId:payload.matchId};await f.fire('push',{data:{json:()=>p}});
 await f.fire('notificationclick',{notification:{data:f.shown[0].data,close(){}}});await f.bind(null);
 async function request(type,ownerId,userId){let result;await f.fire('message',{source:{url:'https://local.invalid/'},data:{type,ownerId,userId},ports:[{postMessage:v=>result=v}]});return result;}
 assert.equal(await request('push-pending-registration','other'),null);
 assert.equal((await request('push-pending-registration','admin-a')).registrationUserId,payload.matchId);
 await request('push-registration-opened','admin-a','wrong');assert(await request('push-pending-registration','admin-a'));
 await request('push-registration-opened','admin-a',payload.matchId);assert.equal(await request('push-pending-registration','admin-a'),null);
});
test('warm registration clicks navigate and wake an existing window; failed navigation falls back safely',async()=>{
 for(const failure of [false,true]){const f=fixture();await f.bind({binding:'binding-a',userId:'admin-a'});const calls=[];
 f.self.clients.matchAll=async()=>[{url:'https://local.invalid/',navigate:async path=>{calls.push(path);if(failure)throw Error('window closed');},focus:async()=>calls.push('focus'),postMessage:v=>calls.push(v.type)}];
 const p={...payload,kind:'registration',registrationUserId:payload.matchId};await f.fire('notificationclick',{notification:{data:p,close(){}}});
 assert.equal(calls[0],'/?adminPlayer='+payload.matchId);if(failure)assert.equal(f.navigation[0],calls[0]);else assert(calls.includes('push-navigation'));
 }
});

test('warm async tap hands exact owner/match/event to existing app without document navigation',async()=>{
 const f=fixture();await f.bind({binding:payload.binding,userId:'owner'});const calls=[];
 f.self.clients.matchAll=async()=>[{url:'https://local.invalid/arcade',navigate:async()=>{throw Error('must not reload');},focus:async()=>calls.push('focus'),postMessage:(message,ports)=>{
  calls.push(JSON.parse(JSON.stringify(message)));ports[0].postMessage({accepted:true,eventId:message.destination.eventId});
 }}];
 await f.fire('notificationclick',{notification:{data:payload,close(){}}});
 assert.deepEqual(calls,['focus',{type:'push-match-navigation',destination:{eventId:payload.eventId,matchId:payload.matchId,userId:'owner'}}]);
 assert.equal(f.navigation.length,0);
});
test('a legacy window without the handoff receiver falls back to the exact guarded URL',async()=>{
 const f=fixture();await f.bind({binding:payload.binding,userId:'owner'});const calls=[];
 f.self.clients.matchAll=async()=>[{url:'https://local.invalid/',postMessage(){},navigate:async p=>calls.push(p),focus:async()=>{}}];
 await f.fire('notificationclick',{notification:{data:payload,close(){}}});
 assert.deepEqual(calls,['/delayed/'+payload.matchId]);
});
test('focus failure with accepted handoff never opens a duplicate window',async()=>{
 const f=fixture();await f.bind({binding:payload.binding,userId:'owner'});
 f.self.clients.matchAll=async()=>[{url:'https://local.invalid/',focus:async()=>{throw Error('cannot focus');},postMessage:(message,ports)=>ports[0].postMessage({accepted:true,eventId:message.destination.eventId})}];
 await f.fire('notificationclick',{notification:{data:payload,close(){}}});assert.deepEqual(f.navigation,[]);
});
