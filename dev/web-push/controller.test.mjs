import test from 'node:test';import assert from 'node:assert/strict';
import {createDeviceController} from '../../src/lib/webPush/controller.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(overrides={}){
 let stored=null,worker=null,permission='default',user='a',unsubscribed=0,registered=0,prompted=0,active=false;
 const sub={unsubscribe:async()=>{unsubscribed++;active=false;return true;}};
 const port={environment:()=>({secure:true,supported:true,permission}),load:()=>stored,save:v=>stored=v,worker:async v=>worker=v,
  subscription:async()=>active?sub:null,configured:()=>true,gesture:()=>true,requestPermission:async()=>{prompted++;permission='granted';return permission;},
  sessionUser:async()=>user,subscribe:async()=>{active=true;return sub;},register:async()=>{registered++;return {id:'device',binding:'secret-binding'};},revoke:async()=>{},...overrides};
 return {controller:createDeviceController(port),port,read:()=>({stored,worker,unsubscribed,registered,prompted}),user:v=>user=v,permission:v=>permission=v};
}
test('first confirmed account preserves saved binding and device enable requires explicit gesture',async()=>{
 const f=fixture();f.port.save({userId:'a',id:'device',binding:'b'});await f.controller.setAccount('a');assert(f.read().stored);assert.equal(f.read().unsubscribed,0);
 const g=fixture({gesture:()=>false});await g.controller.setAccount('a');await assert.rejects(g.controller.enable('a'));assert.equal(g.read().prompted,0);
});
test('permission alone never claims device setup; registration failure cleans up',async()=>{
 const f=fixture({register:async()=>{throw Error('network');}});await f.controller.setAccount('a');await assert.rejects(f.controller.enable('a'));
 assert.equal(f.read().stored,null);assert.equal(f.read().worker,null);assert.equal(f.read().unsubscribed,1);
});
test('configuration missing never requests OS permission',async()=>{
 const f=fixture({configured:()=>false});await f.controller.setAccount('a');await assert.rejects(f.controller.enable('a'));assert.equal(f.read().prompted,0);
});
test('account switches during server registration cannot bind old user',async()=>{
 const gate=deferred(),entered=deferred();const f=fixture({register:async()=>{entered.resolve();return gate.promise;}});await f.controller.setAccount('a');
 const pending=f.controller.enable('a');await entered.promise;f.user('b');const changed=f.controller.setAccount('b');gate.resolve({id:'old',binding:'old-binding'});
 await assert.rejects(pending);await changed;assert.equal(f.read().stored,null);assert.equal(f.read().worker,null);assert.equal(f.read().unsubscribed,1);
});
test('logout clears worker and OS subscription before server failure',async()=>{
 const f=fixture({revoke:async()=>{throw Error('offline');}});await f.controller.setAccount('a');await f.controller.enable('a');
 await f.controller.setAccount(null);assert.equal(f.read().stored,null);assert.equal(f.read().worker,null);assert.equal(f.read().unsubscribed,1);
 await f.controller.setAccount('a');await f.controller.enable('a');assert.equal(f.read().stored.userId,'a');
});
test('new-account enrollment waits for old enrollment cleanup and survives it',async()=>{
 const gate=deferred(),entered=deferred();let calls=0;
 const f=fixture({register:async()=>{if(++calls===1){entered.resolve();return gate.promise;}return {id:'new',binding:'new-binding'};}});
 await f.controller.setAccount('a');const old=f.controller.enable('a');const rejected=assert.rejects(old);await entered.promise;
 f.user('b');const switched=f.controller.setAccount('b'),next=f.controller.enable('b');assert.equal(calls,1);
 gate.resolve({id:'old',binding:'old-binding'});await rejected;await switched;await next;
 assert.equal(f.read().stored.userId,'b');assert.equal(f.read().worker.binding,'new-binding');assert.equal(f.read().unsubscribed,1);
});
test('shared browser lock serializes separate-tab enrollment and checks account again',async()=>{
 let tail=Promise.resolve();const exclusive=fn=>{const p=tail.then(fn);tail=p.catch(()=>{});return p;};
 const gate=deferred(),entered=deferred();const first=fixture({exclusive,register:async()=>{entered.resolve();return gate.promise;}}),second=fixture({exclusive});
 await first.controller.setAccount('a');await second.controller.setAccount('b');second.user('b');
 const old=first.controller.enable('a'),rejected=assert.rejects(old);await entered.promise;first.user('b');const next=second.controller.enable('b');
 gate.resolve({id:'old',binding:'old'});await rejected;await next;assert.equal(first.read().stored,null);assert.equal(second.read().stored.userId,'b');
});
test('delayed cleanup from another tab preserves the newly enrolled binding',async()=>{
 let tail=Promise.resolve(),stored=null,worker=null,unsubscribed=0;
 const exclusive=fn=>{const p=tail.then(fn);tail=p.catch(()=>{});return p;};
 const gate=deferred(),entered=deferred(),shared={exclusive,load:()=>stored,save:v=>stored=v,worker:async v=>worker=v,
  subscription:async()=>({unsubscribe:async()=>{unsubscribed++;return true;}})};
 const first=fixture(shared),second=fixture({...shared,register:async()=>{entered.resolve();return gate.promise;}});
 await first.controller.setAccount('a');await second.controller.setAccount('b');second.user('b');
 const pending=second.controller.enable('b');await entered.promise;const stale=first.controller.clear();gate.resolve({id:'new',binding:'new-binding'});
 await pending;await stale;assert.equal(stored.userId,'b');assert.equal(worker.binding,'new-binding');assert.equal(unsubscribed,0);
});
test('revocation and lost browser subscription clear persisted device enablement',async()=>{
 const f=fixture();await f.controller.setAccount('a');await f.controller.enable('a');f.permission('denied');await f.controller.reconcile();assert.equal(f.read().stored,null);
 const g=fixture({subscription:async()=>null});await g.controller.setAccount('a');await g.controller.enable('a');await g.controller.reconcile();assert.equal(g.read().stored,null);
});
