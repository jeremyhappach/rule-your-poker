import {synchronize} from '../../../server/delayed/service.ts';
declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>):void};
Deno.serve(async request=>{
 if(request.method!=='POST')return new Response(null,{status:405});
 const token=request.headers.get('x-delayed-dispatch');
 if(!token||!/^[0-9a-f-]{36}$/.test(token))return new Response(null,{status:403});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return new Response(null,{status:503});
 const rpc=async(name:string,args:Record<string,unknown>)=>{
  const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:key,Authorization:`Bearer ${key}`},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
  if(!response.ok){const failure=await response.json().catch(()=>null);throw Error(typeof failure?.message==='string'&&failure.message.startsWith('delayed:')?failure.message:'delayed:recovery_database_rejected');}
  const body=await response.text();return body?JSON.parse(body):null;
 };
 try{
  const records=await rpc('delayed_recovery_claim',{p_token:token});let failures=0;
  // Independent parents may progress concurrently; SQL serializes shared ones.
  const results=await Promise.allSettled(records.map((row:any)=>synchronize(rpc,row,null)));
  for(const result of results)if(result.status==='rejected'&&!['delayed:removed_or_unavailable','delayed:not_active','delayed:held'].includes(result.reason?.message))failures++;
  await rpc('delayed_recovery_complete',{p_token:token,p_failure:failures?'delayed:recovery_failed':null});
  return Response.json({processed:records.length,failures},{status:failures?503:200});
 }catch{return new Response(null,{status:503});}
});
