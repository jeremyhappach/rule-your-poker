import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
function fixture(){
 const handlers={},store=new Map(),shown=[],navigation=[];
 const self={location:{origin:'https://local.invalid'},addEventListener:(name,fn)=>handlers[name]=fn,
  registration:{getNotifications:async()=>[],showNotification:async(title,options)=>{const previous=shown.findIndex(n=>n.tag===options.tag);if(previous>=0)shown.splice(previous,1);shown.push({title,...options});}},
  clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async path=>navigation.push(path)}};
 vm.runInNewContext(readFileSync('public/ptown-push-sw.js','utf8'),{self,URL,Response,caches:{open:async()=>({match:async key=>store.get(key)?.clone(),put:async(key,value)=>store.set(key,value)})}});
 const fire=async(name,event)=>{let task;handlers[name]({...event,waitUntil:p=>task=p});await task;};
 const bind=value=>fire('message',{source:{url:'https://local.invalid/'},data:{type:'push-binding',value},ports:[{postMessage:()=>{}}]});
 return {fire,bind,shown,navigation};
}
const payload={eventId:'11111111-1111-4111-8111-111111111111',matchId:'22222222-2222-4222-8222-222222222222',binding:'binding-a',kind:'turn',expiresAt:Date.now()+60000};
test('worker persists receipt across duplicate delivery and never displays private game data',async()=>{
 const f=fixture();await f.bind({binding:'binding-a'});await f.fire('push',{data:{json:()=>({...payload,rack:'SECRET',score:900})}});await f.fire('push',{data:{json:()=>payload}});
 assert.equal(f.shown.length,1);assert.equal(f.shown[0].silent,true);assert(!JSON.stringify(f.shown).includes('SECRET'));assert(!JSON.stringify(f.shown).includes('900'));
 await f.fire('notificationclick',{notification:{data:f.shown[0].data,close:()=>{}}});assert.deepEqual(f.navigation,['/delayed/'+payload.matchId]);
});
test('expired delivery stays user-visible without claiming an actionable turn or alerting',async()=>{
 const f=fixture();await f.bind({binding:'binding-a'});await f.fire('push',{data:{json:()=>({...payload,expiresAt:Date.now()-1})}});
 assert.equal(f.shown[0].body,'Open Ptown to check your async matches.');assert.equal(f.shown[0].silent,true);
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
