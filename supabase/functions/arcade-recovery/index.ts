import {recoverArcade} from '../../../server/arcade/service.js';
declare const Deno:{env:{get:(name:string)=>string|undefined};serve:(handler:(req:Request)=>Promise<Response>)=>void};
Deno.serve(async req=>{
 const token=req.headers.get('x-arcade-dispatch');
 if(!token||!/^[0-9a-f-]{36}$/.test(token))return new Response('Unauthorized',{status:401});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return new Response('Unavailable',{status:503});
 const rpc=async(name:string,args:Record<string,unknown>)=>{
  const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(args)});
  if(!response.ok)throw Error('arcade:recovery_rpc');
  const text=await response.text();return text?JSON.parse(text):null;
 };
 try{return Response.json({processed:await recoverArcade(rpc,token)});}
 catch{return new Response('Recovery rejected or failed',{status:403});}
});

