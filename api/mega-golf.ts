import {createClient} from '@supabase/supabase-js';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {megaLiveOperation} from '../server/megaCardGolf/multiplayer.js';
export default async function handler(req:IncomingMessage&{body?:unknown},res:ServerResponse){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 try{
  if(req.method!=='POST'){res.statusCode=405;throw Error('mega:method');}
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){res.statusCode=403;throw Error('mega:origin');}
  const token=/^Bearer (\S+)$/.exec(req.headers.authorization??'')?.[1];
  if(!token){res.statusCode=401;throw Error('mega:authentication_required');}
  const url=process.env.RUN21_SUPABASE_URL,key=process.env.RUN21_SUPABASE_SERVICE_ROLE_KEY;
  if(url!=='https://xvhmbuppghwmwpwrkzao.supabase.co'||!key){res.statusCode=503;throw Error('mega:unavailable');}
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),{data,error}=await db.auth.getUser(token);
  if(error||!data.user){res.statusCode=401;throw Error('mega:authentication_required');}
  let raw='';if(req.body!==undefined)raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  else for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('mega:request_size');}
  if(raw.length>4096)throw Error('mega:request_size');const body=JSON.parse(raw);
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('mega:invalid_request');
  const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error,status}=await db.rpc(name,args);if(error){if(status>=500)res.statusCode=503;throw Error(error.message.startsWith('mega:')?error.message:'mega:database_rejected');}return data;};
  const result=await megaLiveOperation(rpc,data.user.id,body);res.statusCode=200;res.end(JSON.stringify(result));
 }catch(error){if(res.statusCode===200)res.statusCode=409;res.end(JSON.stringify({error:error instanceof Error&&error.message.startsWith('mega:')?error.message:'mega:request_failed'}));}
}
