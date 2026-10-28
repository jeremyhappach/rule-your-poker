import {createClient} from '@supabase/supabase-js';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {delayedOperation} from '../server/delayed/service.js';

export default async function handler(req:IncomingMessage&{body?:unknown},res:ServerResponse){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 try{
  if(req.method!=='POST'){res.statusCode=405;throw Error('delayed:method');}
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){res.statusCode=403;throw Error('delayed:origin');}
  const token=/^Bearer (\S+)$/.exec(req.headers.authorization??'')?.[1];
  if(!token){res.statusCode=401;throw Error('delayed:authentication_required');}
  const url=process.env.RUN21_SUPABASE_URL,key=process.env.RUN21_SUPABASE_SERVICE_ROLE_KEY;
  if(url!=='https://xvhmbuppghwmwpwrkzao.supabase.co'||!key){res.statusCode=503;throw Error('delayed:unavailable');}
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.auth.getUser(token);
  if(error||!data.user){res.statusCode=401;throw Error('delayed:authentication_required');}
  let raw='';
  if(req.body!==undefined)raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  else for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('delayed:request_size');}
  if(raw.length>4096)throw Error('delayed:request_size');
  const body=JSON.parse(raw);
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('delayed:invalid_request');
  const rpc=async(name:string,args:Record<string,unknown>)=>{
   const {data,error,status}=await db.rpc(name,args);
   if(error){if(status>=500)res.statusCode=503;throw Error(error.message.startsWith('delayed:')?error.message:'delayed:database_rejected');}
   return data;
  };
  // Identity comes only from verified Auth, never from request JSON.
  const result=await delayedOperation(rpc,data.user.id,body);
  res.statusCode=200;res.end(JSON.stringify(result));
 }catch(error){
  if(res.statusCode===200)res.statusCode=409;
  res.end(JSON.stringify({error:error instanceof Error&&error.message.startsWith('delayed:')?error.message:'delayed:request_failed'}));
 }
}
