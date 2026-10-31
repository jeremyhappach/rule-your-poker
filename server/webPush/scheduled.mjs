import {timingSafeEqual} from 'node:crypto';
import {deliverOne} from './worker.mjs';
export async function scheduledBatch(rpc,send,{now=Date.now,maxJobs=20,budgetMs=10000}={}){
 const started=now();let processed=0;
 while(processed<maxJobs&&now()-started<budgetMs){if(!await deliverOne(rpc,send))break;processed++;}
 return {processed};
}
/** Shared by the dormant deployment endpoint and the local HTTP/schedule qualification. */
export function createScheduledHandler({enabled,secret,run}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  const reply=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
  if(!enabled)return reply(503,{error:'push:disabled'});
  if(req.method!=='GET')return reply(405,{error:'push:method'});
  const actual=Buffer.from(req.headers.authorization??''),expected=Buffer.from('Bearer '+(secret??''));
  if(!secret||secret.length<32||actual.length!==expected.length||!timingSafeEqual(actual,expected))return reply(401,{error:'push:unauthorized'});
  try{return reply(200,await run());}catch{return reply(503,{error:'push:worker_failed'});}
 };
}
