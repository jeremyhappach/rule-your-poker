import {recoverChess} from '../../../server/chess/recovery.ts';
declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>):void};
Deno.serve(async request=>{
  if (request.method!=='POST') return new Response(null,{status:405});
  const token=request.headers.get('x-chess-dispatch');
  if (!token||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return new Response(null,{status:403});
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url||!key) return new Response(null,{status:503});
  try {
    const result=await recoverChess(async(name,args)=>{
      const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:key,Authorization:`Bearer ${key}`},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw Error('chess:recovery_database_rejected');
      const body=await response.text();return body?JSON.parse(body):null;
    },token);
    return Response.json(result,{status:result.failures?503:200});
  } catch {return new Response(null,{status:503});}
});
