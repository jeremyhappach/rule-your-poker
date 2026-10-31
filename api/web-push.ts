import type {IncomingMessage,ServerResponse} from 'node:http';
import {createScheduledHandler,scheduledBatch} from '../server/webPush/scheduled.mjs';
import {createTransport} from '../server/webPush/transport.mjs';

// No vercel.json schedule is installed by this local candidate. Every switch defaults closed.
export default function handler(req:IncomingMessage,res:ServerResponse){
 const env=process.env;
 return createScheduledHandler({enabled:env.WEB_PUSH_DELIVERY_ENABLED==='true'&&env.VERCEL_ENV==='production',secret:env.CRON_SECRET,
  run:async()=>{
   const url=env.RUN21_SUPABASE_URL,key=env.RUN21_SUPABASE_SERVICE_ROLE_KEY;
   if(url!=='https://xvhmbuppghwmwpwrkzao.supabase.co'||!key||!env.WEB_PUSH_VAPID_PUBLIC_KEY||!env.WEB_PUSH_VAPID_PRIVATE_KEY||!env.WEB_PUSH_VAPID_SUBJECT)throw Error('push:configuration');
   const rpc=async(name:string,args:Record<string,unknown>)=>{
    if(!['async_push_claim','async_push_authorize','async_push_receipt'].includes(name))throw Error('push:rpc');
    const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
     headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(args)});
    if(!response.ok)throw Error('push:database');return response.json();
   };
   const send=createTransport({publicKey:env.WEB_PUSH_VAPID_PUBLIC_KEY,privateKey:env.WEB_PUSH_VAPID_PRIVATE_KEY,subject:env.WEB_PUSH_VAPID_SUBJECT},fetch);
   return scheduledBatch(rpc,send);
  }})(req,res);
}
