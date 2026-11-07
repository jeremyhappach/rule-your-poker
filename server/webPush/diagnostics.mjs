import {diagnosticUser,diagnosticMatch,diagnosticUntil} from '../../src/lib/webPush/diagnostics.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v),hash=v=>v===null||typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const name=v=>v===null||typeof v==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(v);
export function sanitizeSnapshot(value){
 if(!value||value.matchId!==diagnosticMatch)throw Error('scope');
 const out={matchId:diagnosticMatch};
 if(typeof value.origin==='string'&&/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(value.origin))out.origin=value.origin;
 if(Number.isFinite(value.clientAt))out.clientAt=value.clientAt;
 for(const k of ['localBindingHash','workerBindingHash','endpointHash','p256dhHash','authHash'])if(hash(value[k]))out[k]=value[k];
 for(const k of ['standalone','localAccountMatches','workerAccountMatches','subscriptionPresent'])if(typeof value[k]==='boolean')out[k]=value[k];
 for(const k of ['permission','visibility','activeVersion','activeState','waitingState','cacheError','subscriptionError','notificationError'])if(name(value[k]))out[k]=value[k];
 if(uuid(value.subscriptionId))out.subscriptionId=value.subscriptionId;
 out.receipts={};for(const k of ['failed','morning'])if(value.receipts?.[k]===null||typeof value.receipts?.[k]==='boolean')out.receipts[k]=value.receipts[k];
 out.notifications=Array.isArray(value.notifications)?value.notifications.filter(uuid).slice(-8):[];
 out.trace=Array.isArray(value.trace)?value.trace.slice(-32).filter(t=>t&&uuid(t.eventId)&&['received','binding_checked','binding_rejected','show_attempt','show_resolved','show_rejected','receipt_saved','worker_error'].includes(t.stage)).map(t=>{
  const row={eventId:t.eventId,stage:t.stage};
  for(const k of ['version','errorName'])if(name(t[k]))row[k]=t[k];
  if(Number.isFinite(t.at))row.at=t.at;
  for(const k of ['payloadBindingHash','currentBindingHash'])if(hash(t[k]))row[k]=t[k];
  for(const k of ['bindingPresent','currentAccountMatches','duplicate','expired','silent','renotify'])if(typeof t[k]==='boolean')row[k]=t[k];
  return row;
 }):[];
 return out;
}
export function createDiagnosticHandler({verify,record,enabled=true,now=Date.now}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 const reply=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
 if(!enabled||now()>=diagnosticUntil)return reply(410,{error:'push:diagnostic_expired'});
 if(req.method!=='POST')return reply(405,{error:'push:method'});
 try{
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return reply(403,{error:'push:origin'});
  const token=/^Bearer (\S+)$/.exec(req.headers.authorization??'')?.[1];
  if(!token)return reply(401,{error:'push:authentication'});
  let raw='';if(req.body!==undefined)raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  else for await(const chunk of req){raw+=chunk;if(raw.length>16384)return reply(413,{error:'push:size'});}
  if(raw.length>16384)return reply(413,{error:'push:size'});
  const report=sanitizeSnapshot(JSON.parse(raw));
  if(await verify(token)!==diagnosticUser)return reply(403,{error:'push:scope'});
  record({capturedAt:now(),...report});return reply(200,{ok:true});
 }catch{return reply(400,{error:'push:diagnostic_rejected'});}
};}
