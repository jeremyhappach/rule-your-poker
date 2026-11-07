// Temporary phone investigation; no raw endpoint, key, binding or auth token in reports.
export const diagnosticUser='d7dc1928-3727-4351-b0ff-0e80c81c2953';
export const diagnosticMatch='d78bc9e8-2ede-4bbd-9032-80cfdef01aa6';
export const diagnosticUntil=Date.parse('2026-11-09T00:00:00Z');
export const diagnosticEvents={failed:'ee92e592-013d-4bff-a0ef-510562703c3a',morning:'663a1c16-93eb-4197-8d48-e6d81c7848ed'};
const hash=async value=>typeof value==='string'?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join(''):null;
export async function pushSnapshot({registration,localBinding,cacheStorage,origin,permission,standalone,visibility,activeVersion}){
 const report={matchId:diagnosticMatch,origin,permission,standalone,visibility,activeVersion,
  activeState:registration?.active?.state??null,waitingState:registration?.waiting?.state??null,
  subscriptionId:localBinding?.id??null,localAccountMatches:localBinding?.userId===diagnosticUser,
  localBindingHash:await hash(localBinding?.binding)};
 try{
  const cache=await cacheStorage.open('ptown-push-v1');
  const read=async name=>(await cache.match(new URL('/__push_local__/'+name,origin).href))?.json();
  const workerBinding=await read('binding'),receipts=await read('receipts');
  report.workerBindingHash=await hash(workerBinding?.binding);
  report.workerAccountMatches=workerBinding?.userId===diagnosticUser;
  report.receipts=Object.fromEntries(Object.entries(diagnosticEvents).map(([name,id])=>[name,Array.isArray(receipts)?receipts.includes(id):null]));
  report.trace=(await read('diagnostics')??[]).slice(-32);
 }catch(error){report.cacheError=error?.name??'Error';}
 try{
  const sub=(await registration?.pushManager.getSubscription())?.toJSON();
  report.subscriptionPresent=!!sub;
  report.endpointHash=await hash(sub?.endpoint);report.p256dhHash=await hash(sub?.keys?.p256dh);report.authHash=await hash(sub?.keys?.auth);
 }catch(error){report.subscriptionError=error?.name??'Error';}
 try{report.notifications=(await registration?.getNotifications({tag:'ptown-match-'+diagnosticMatch})??[]).map(n=>n.data?.eventId).filter(Boolean).slice(-8);}
 catch(error){report.notificationError=error?.name??'Error';}
 return report;
}
