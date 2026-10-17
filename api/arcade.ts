import {createClient} from '@supabase/supabase-js';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {arcadeOperation,triShortcut} from '../server/arcade/service.js';
export default async function handler(req:IncomingMessage&{body?:unknown},res:ServerResponse){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 const started=performance.now(),timings:string[]=[];
 try{
  if(req.method!=='POST')throw Error('arcade:method');
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw Error('arcade:origin');
  const token=/^Bearer (\S+)$/.exec(req.headers.authorization??'')?.[1];
  if(!token){res.statusCode=401;throw Error('arcade:authentication_required');}
  const url=process.env.RUN21_SUPABASE_URL,key=process.env.RUN21_SUPABASE_SERVICE_ROLE_KEY;
  if(url!=='https://xvhmbuppghwmwpwrkzao.supabase.co'||!key){res.statusCode=503;throw Error('arcade:unavailable');}
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const authAt=performance.now();const {data,error}=await db.auth.getUser(token);timings.push(`auth;dur=${(performance.now()-authAt).toFixed(1)}`);if(error||!data.user){res.statusCode=401;throw Error('arcade:authentication_required');}
  let raw='';
  if(req.body!==undefined)raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  else for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('arcade:request_size');}
  if(raw.length>4096)throw Error('arcade:request_size');
  const body=JSON.parse(raw);
  const rpc=async(name:string,args:Record<string,unknown>)=>{
   const at=performance.now();const {data,error,status}=await db.rpc(name,args);timings.push(`${name};dur=${(performance.now()-at).toFixed(1)}`);if(error){if(!error.code||status>=500)res.statusCode=503;throw Error(error.message.startsWith('arcade:')?error.message:'arcade:database_rejected');}return data;
  };
  const profile=triShortcut(body)?null:await db.from('profiles').select('username').eq('id',data.user.id).single();
  const result=await arcadeOperation(rpc,data.user.id,profile?.data?.username??'You',body);
  if(body.game==='tri-towers')res.setHeader('Server-Timing',[...timings,`total;dur=${(performance.now()-started).toFixed(1)}`].join(', '));
  res.statusCode=200;res.end(JSON.stringify(result));
 }catch(error){
  if(res.statusCode===200)res.statusCode=409;
  const message=error instanceof Error&&error.message.startsWith('arcade:')?error.message:'arcade:request_failed';
  res.end(JSON.stringify({error:message}));
 }
}

