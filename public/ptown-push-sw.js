/* Push only: no fetch handler or application caching. */
const STORE='ptown-push-v1';
const key=name=>new URL('/__push_local__/'+name,self.location.origin).href;
const read=async name=>{const c=await caches.open(STORE);return (await c.match(key(name)))?.json();};
const write=async(name,value)=>{const c=await caches.open(STORE);await c.put(key(name),new Response(JSON.stringify(value)));};
let queue=Promise.resolve();
const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(event.data?.type!=='push-binding'||!event.source?.url||new URL(event.source.url).origin!==self.location.origin)return;
 event.waitUntil(serial(async()=>{await write('binding',event.data.value);await write('receipts',[]);
  for(const n of await self.registration.getNotifications())n.close();event.ports[0]?.postMessage({ok:true});}));
});
self.addEventListener('push',event=>event.waitUntil(serial(async()=>{
 let p;try{p=event.data?.json();}catch{return;}
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!p||!uuid.test(p.eventId)||!['turn','last_call','table_open'].includes(p.kind))return;
 const table=p.kind==='table_open';if(!uuid.test(table?p.tableId:p.matchId))return;
 const current=await read('binding');if(!current||current.binding!==p.binding)return;
 const receipts=await read('receipts')??[];
 const duplicate=receipts.includes(p.eventId),expired=!Number.isFinite(p.expiresAt)||p.expiresAt<=Date.now();
 // Valid retransmissions replace the same visible card without renotify. Safari
 // requires user-visible handling for each received push, including retries.
 await self.registration.showNotification('Ptown Poker',{
  body:expired?(table?'Open Ptown to check available tables.':'Open Ptown to check your async matches.'):table?'A new real-money table is open for joining.':p.kind==='last_call'?'Last Call: an async turn is still waiting.':'An async match is ready for your turn.',
  tag:table?'ptown-table-'+p.tableId:'ptown-match-'+p.matchId,renotify:false,silent:duplicate||expired,
  data:{matchId:p.matchId,tableId:p.tableId,kind:p.kind,binding:p.binding,eventId:p.eventId},
 });
 await write('receipts',[...receipts.filter(id=>id!==p.eventId),p.eventId].slice(-128));
})));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(serial(async()=>{
 const p=event.notification.data,current=await read('binding');
 const table=p?.kind==='table_open';
 if(!current||current.binding!==p?.binding||!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(table?p?.tableId:p?.matchId))return;
 // The authenticated landing RPC checks membership, removal and current state again.
 const path=table?'/notifications/table/'+p.tableId:'/delayed/'+p.matchId;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 const target=windows.find(w=>new URL(w.url).origin===self.location.origin);
 if(target){await target.navigate(path);await target.focus();}else await self.clients.openWindow(path);
}));});
