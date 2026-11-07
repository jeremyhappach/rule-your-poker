import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
function fixture(){
 const handlers={},store=new Map(),shown=[],navigation=[];
 const self={location:{origin:'https://local.invalid'},addEventListener:(name,fn)=>handlers[name]=fn,
  registration:{getNotifications:async()=>[],showNotification:async(title,options)=>{const previous=shown.findIndex(n=>n.tag===options.tag);if(previous>=0)shown.splice(previous,1);shown.push({title,...options});}},
  clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async path=>navigation.push(path)}};
 vm.runInNewContext(readFileSync('public/ptown-push-sw.js','utf8'),{self,URL,Response,caches:{open:async()=>({match:async key=>store.get(key)?.clone(),put:async(key,value)=>store.set(key,value)})}});
 const fire=async(name,event)=>{let task;handlers[name]({...event,waitUntil:p=>task=p});await task;};
 const bind=value=>fire('message',{source:{url:'https://local.invalid/'},data:{type:'push-binding',value},ports:[{postMessage:()=>{}}]});
 return {fire,bind,shown,navigation,self};
}
const payload={eventId:'11111111-1111-4111-8111-111111111111',matchId:'22222222-2222-4222-8222-222222222222',binding:'binding-a',kind:'turn',expiresAt:Date.now()+60000};

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
  assert.equal(f.shown[0].silent,false);assert.equal(f.shown[0].renotify,false);
  assert.equal(f.shown[0].tag,(kind==='table_open'?'ptown-table-':'ptown-match-')+payload.matchId);
  assert(!/SECRET|900|poker|ptown|money/i.test(JSON.stringify({title:f.shown[0].title,body:f.shown[0].body})));
  await f.fire('push',{data:{json:()=>({...payload,kind,tableId:payload.matchId,expiresAt:Date.now()-1})}});
  assert.equal(f.shown[0].title,kind==='table_open'?'Table Update':'Match Update');assert.equal(f.shown[0].silent,true);
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
