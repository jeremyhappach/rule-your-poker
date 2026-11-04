import {createClient} from '@supabase/supabase-js';
import type {IncomingMessage,ServerResponse} from 'node:http';

// Configuration injection is for isolated integration tests; HTTP callers cannot override it.
export function createAccountAccessHandler(config?:{url:string;key:string}) {
return async function handler(req:IncomingMessage&{body?:unknown},res:ServerResponse){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 res.setHeader('Referrer-Policy','no-referrer');
 try{
  if(req.method!=='POST'){res.statusCode=405;throw Error('Unsupported request.');}
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){res.statusCode=403;throw Error('Request rejected.');}
  const url=config?.url??process.env.RUN21_SUPABASE_URL,key=config?.key??process.env.RUN21_SUPABASE_SERVICE_ROLE_KEY;
  if((!config&&url!=='https://xvhmbuppghwmwpwrkzao.supabase.co')||!url||!key){res.statusCode=503;throw Error('Account service unavailable.');}
  let raw='';if(req.body!==undefined)raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  else for await(const chunk of req){raw+=chunk;if(raw.length>2048)throw Error('Request too large.');}
  if(raw.length>2048)throw Error('Request too large.');
  const body=JSON.parse(raw),db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  if(body.op==='resend'||body.op==='initial'){
   const token=/^Bearer (\S+)$/.exec(req.headers.authorization??'')?.[1];
   if(!token){res.statusCode=401;throw Error('Please sign in again.');}
   const {data,error}=await db.auth.getUser(token);
   if(error||!data.user){res.statusCode=401;throw Error('Please sign in again.');}
   const target=body.targetId??data.user.id;
   if(typeof target!=='string'||!/^[0-9a-f-]{36}$/i.test(target))throw Error('Invalid account.');
   const address=await db.rpc('account_email_dispatch_start',{p_actor:data.user.id,p_target:target,p_initial:body.op==='initial'});
   if(address.error){res.statusCode=address.error.message==='account:resend_wait'?429:403;throw Error(res.statusCode===429?'Please wait one minute before requesting another email.':'Request rejected.');}
   if(!address.data.skipped){
    let accepted=false;
    try{
     const {error:sendError}=await db.auth.signInWithOtp({email:address.data.email,options:{shouldCreateUser:false}});
     if(sendError){res.statusCode=503;throw Error('Verification email could not be sent. Use Resend Verification Email to try again.');}
     accepted=true;
    }finally{
     const saved=await db.rpc('account_email_dispatch_finish',{p_target:target,p_attempt:address.data.attemptId,p_success:accepted});
     if(saved.error&&accepted){res.statusCode=503;throw Error('Email was requested, but its status could not be saved. Check your inbox or try Resend Verification Email.');}
    }
   }
  }else if(body.op==='verify'){
   if(typeof body.tokenHash!=='string'||!/^[a-f0-9]{32,128}$/i.test(body.tokenHash))throw Error('Invalid verification link.');
   // A separate Auth client consumes the real email token. Neither a caller's
   // session nor Auth's automatic confirmation timestamp can grant evidence.
   const verifier=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
   const result=await verifier.auth.verifyOtp({token_hash:body.tokenHash,type:'email'});
   if(result.error||!result.data.user?.email){res.statusCode=400;throw Error('This verification link expired or was already used. Request another email.');}
   try{
    const saved=await db.rpc('account_email_verified',{p_user:result.data.user.id,p_email:result.data.user.email});
    if(saved.error){res.statusCode=409;throw Error('Your address changed or verification could not be saved. Request another email.');}
   }finally{await verifier.auth.signOut({scope:'local'});}
  }else throw Error('Invalid request.');
  res.statusCode=200;res.end(JSON.stringify({ok:true}));
 }catch(e){if(res.statusCode===200)res.statusCode=400;res.end(JSON.stringify({error:e instanceof Error?e.message:'Request failed.'}));}
};
}
export default createAccountAccessHandler();
