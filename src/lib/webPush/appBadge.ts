export type BadgeSnapshot={count:number;version:number};
export const validBadge=(value:unknown):value is BadgeSnapshot=>{
 const v=value as BadgeSnapshot|undefined;
 return !!v&&Number.isSafeInteger(v.count)&&v.count>=0&&Number.isSafeInteger(v.version)&&v.version>0;
};
type BadgeNavigator=Navigator&{setAppBadge?:(count:number)=>Promise<void>;clearAppBadge?:()=>Promise<void>};
let tail=Promise.resolve(),account:string|null|undefined,latest:BadgeSnapshot|undefined;
let registration:Promise<ServiceWorkerRegistration>|undefined;
async function bounded<T>(promise:Promise<T>){
 let timer:ReturnType<typeof setTimeout>;
 try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Badge worker unavailable')),5000);})]);}
 finally{clearTimeout(timer!);}
}

// The same worker serializes foreground and push writes, across app restarts.
// Badge setup never requests notification permission or subscribes to push.
export function syncAppBadge(userId:string|null,snapshot?:BadgeSnapshot){
 const task=tail.then(async()=>{
  const nav=navigator as BadgeNavigator;
  if(!nav.setAppBadge||!nav.clearAppBadge)return;
  if('serviceWorker' in nav){
   try{
    registration??=nav.serviceWorker.register('/ptown-push-sw.js',{scope:'/',updateViaCache:'none'}).catch(error=>{registration=undefined;throw error;});
    const reg=await bounded(registration);
    const active=reg.active??(await bounded(nav.serviceWorker.ready)).active;
    if(active){
     const supported=await new Promise<boolean>((resolve,reject)=>{
      const channel=new MessageChannel();
      const timeout=setTimeout(()=>{channel.port1.close();reject(Error('Badge worker unavailable'));},5000);
      channel.port1.onmessage=event=>{clearTimeout(timeout);channel.port1.close();resolve(event.data?.badgeSupported===true);};
      active.postMessage({type:'async-app-badge',userId,snapshot},[channel.port2]);
     });
     if(supported)return;
    }
   }catch{return;} // Keep the last badge; retry on the next authoritative refresh.
  }
  // Platforms exposing document badging without worker badging.
  const changed=account!==userId;
  if(changed){account=userId;latest=undefined;}
  if(changed||!userId)await nav.clearAppBadge();
  if(!userId||!validBadge(snapshot))return;
  if(latest&&(snapshot.version<latest.version||snapshot.version===latest.version&&snapshot.count!==latest.count))return;
  if(snapshot.count)await nav.setAppBadge(snapshot.count);else await nav.clearAppBadge();
  latest=snapshot;
 });
 tail=task.catch(()=>{});return tail;
}
