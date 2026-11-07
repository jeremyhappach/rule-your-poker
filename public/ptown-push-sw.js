/* Push only: no fetch handler or application caching. */
const STORE='ptown-push-v1';
const key=name=>new URL('/__push_local__/'+name,self.location.origin).href;
const read=async name=>{const c=await caches.open(STORE);return (await c.match(key(name)))?.json();};
const write=async(name,value)=>{const c=await caches.open(STORE);await c.put(key(name),new Response(JSON.stringify(value)));};
let queue=Promise.resolve();
const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(!event.source?.url||new URL(event.source.url).origin!==self.location.origin)return;
 if(event.data?.type==='push-binding')event.waitUntil(serial(async()=>{
  const previous=await read('binding');
  const pending=await read('pending-registration');
  if(event.data.value&&pending&&(pending.userId?pending.userId!==event.data.value.userId:previous?.binding!==event.data.value.binding))await write('pending-registration',null);
  await write('binding',event.data.value);await write('receipts',[]);
  for(const n of await self.registration.getNotifications())n.close();event.ports[0]?.postMessage({ok:true});}));
 if(['push-pending-registration','push-registration-opened'].includes(event.data?.type))event.waitUntil(serial(async()=>{
  const current=await read('binding'),pending=await read('pending-registration');
  const valid=pending&&(pending.userId
   ?pending.userId===event.data.ownerId&&(!current||current.userId===pending.userId)
   :current&&current.binding===pending.binding&&current.binding===event.data.binding);
  if(event.data.type==='push-registration-opened'&&valid&&pending.registrationUserId===event.data.userId)await write('pending-registration',null);
  event.ports[0]?.postMessage(valid&&event.data.type==='push-pending-registration'?pending:null);
 }));
});
self.addEventListener('push',event=>event.waitUntil(serial(async()=>{
 let p;try{p=event.data?.json();}catch{return;}
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!p||!uuid.test(p.eventId)||!['invite','turn','last_call','table_open','registration'].includes(p.kind))return;
 const table=p.kind==='table_open',registration=p.kind==='registration';if(!uuid.test(registration?p.registrationUserId:table?p.tableId:p.matchId))return;
 const current=await read('binding');if(!current||current.binding!==p.binding)return;
 const receipts=await read('receipts')??[];
 const duplicate=receipts.includes(p.eventId),expired=!Number.isFinite(p.expiresAt)||p.expiresAt<=Date.now();
 // Fresh async events re-alert when replacing an earlier card for this match.
 // Safari requires visible handling even for retries; keep retries/expiry silent.
 const title=registration?'New P-Town Poker User':expired?(table?'Table Update':'Match Update'):{invite:'New Match Invitation',turn:'Your turn',last_call:'Last Call!',table_open:'New Table Available'}[p.kind];
 const opponent=typeof p.opponentName==='string'?p.opponentName.trim():'';
 const turnBody=opponent?'Your turn in an async match with '+opponent+'.':'Your turn in an async match.';
 await self.registration.showNotification(title,{
  body:registration?(expired?'Open Admin → Players to check account access.':String(p.username??'New player').slice(0,80)+' — Approval Required'):expired?(table?'Open the app to check available tables.':'Open the app to check your async matches.'):table?'A new table is open for joining.':p.kind==='invite'?'You have a new async match invitation.':p.kind==='last_call'?(opponent?'An async turn with '+opponent+' is still waiting. Check its deadline.':'An async turn is still waiting. Check its deadline.'):turnBody,
  tag:registration?'ptown-registration-'+p.registrationUserId:table?'ptown-table-'+p.tableId:'ptown-match-'+p.matchId,renotify:!table&&!registration&&!duplicate&&!expired,silent:duplicate||expired,
  data:{registrationUserId:p.registrationUserId,matchId:p.matchId,tableId:p.tableId,kind:p.kind,binding:p.binding,eventId:p.eventId},
 });
 await write('receipts',[...receipts.filter(id=>id!==p.eventId),p.eventId].slice(-128));
})));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(serial(async()=>{
 const p=event.notification.data,current=await read('binding');
 const table=p?.kind==='table_open',registration=p?.kind==='registration';
 if(!current||current.binding!==p?.binding||!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(registration?p?.registrationUserId:table?p?.tableId:p?.matchId))return;
 // The authenticated landing RPC checks membership, removal and current state again.
 const path=registration?'/?adminPlayer='+p.registrationUserId:table?'/notifications/table/'+p.tableId:'/delayed/'+p.matchId;
 if(registration)await write('pending-registration',{registrationUserId:p.registrationUserId,binding:p.binding,userId:current.userId,eventId:p.eventId});
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 const target=windows.find(w=>new URL(w.url).origin===self.location.origin);
 if(target){try{await target.navigate(path);await target.focus();target.postMessage?.({type:'push-navigation'});}catch{await self.clients.openWindow(path);}}else await self.clients.openWindow(path);
}));});
