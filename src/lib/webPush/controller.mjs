import {enableFromGesture,deviceStatus} from './device.mjs';

/** One browser installation, one account binding. Ports permit deterministic race tests. */
export function createDeviceController(port){
 let account,epoch=0,tail=Promise.resolve();
 const serialize=fn=>{const task=tail.then(()=>port.exclusive?port.exclusive(fn):fn());tail=task.catch(()=>{});return task;};
 const assertCurrent=(owner,version)=>{if(account!==owner||version!==epoch)throw Error('Sign-in changed. Enable notifications again.');};
 const status=()=>deviceStatus(port.environment(),!!port.load());
 async function clear(){
  ++epoch;const old=port.load();
  const work=async()=>{
   // Another tab may have completed enrollment while this cleanup waited for
   // the origin lock. Never revoke that successor installation binding.
   const current=port.load();if(current&&(!old||current.binding!==old.binding))return;
   port.save(null);
   await port.worker(null);
   const subscription=await port.subscription();
   if(subscription&&!await subscription.unsubscribe())throw Error('This device could not unsubscribe. Please retry.');
   // OS unsubscribe + cleared worker binding already protect this device offline.
   // Server delivery also rejects a revoked session and retires expired endpoints.
   if(old)await port.revoke(old).catch(()=>{});
  };
  return serialize(work);
 }
 function setAccount(next){
  if(next===account)return Promise.resolve();const prior=account;account=next;++epoch;
  const old=port.load();
  return prior!==undefined||old&&old.userId!==next?clear():Promise.resolve();
 }
 async function reconcile(){
  await tail;const old=port.load();if(!old)return;
  if(old.userId!==account||port.environment().permission!=='granted'||!await port.subscription())await clear();
 }
 function enable(owner){
  if(account!==owner)return Promise.reject(Error('Wait for sign-in to finish.'));
  if(!port.configured())return Promise.reject(Error('Notification delivery is not configured yet.'));
  const version=++epoch;
  return enableFromGesture({gesture:port.gesture,status,permission:()=>port.environment().permission,requestPermission:port.requestPermission,
   subscribe:()=>serialize(async()=>{
    assertCurrent(owner,version);
    const subscription=await port.subscribe();
    try{
     assertCurrent(owner,version);
     if(await port.sessionUser()!==owner)throw Error('Sign-in changed. Enable notifications again.');
     const saved=await port.register(subscription);assertCurrent(owner,version);
     if(await port.sessionUser()!==owner)throw Error('Sign-in changed. Enable notifications again.');
     const value={...saved,userId:owner};
     await port.worker(value);assertCurrent(owner,version);
     port.save(value);
    }catch(error){
     await port.worker(null);await subscription.unsubscribe();throw error;
    }
   })});
 }
 return {status,setAccount,reconcile,enable,clear};
}
