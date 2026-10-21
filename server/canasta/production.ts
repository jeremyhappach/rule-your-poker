import type {IncomingMessage,ServerResponse} from 'node:http';
import {createCanastaHandler} from './handler';
/** Missing credentials fail closed; database release and admission gates remain independent. */
export function createProductionAdapter(env:NodeJS.ProcessEnv){
 let runtime:ReturnType<typeof createCanastaHandler>|undefined;
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const url=env.CANASTA_SUPABASE_URL,key=env.CANASTA_SUPABASE_SERVICE_ROLE_KEY;
  const local=!env.VERCEL&&env.NODE_ENV==='test'&&url==='http://127.0.0.1:65321';
  if(!key||(!local&&url!=='https://xvhmbuppghwmwpwrkzao.supabase.co')){
   res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"canasta:release_unavailable"}');return;
  }
  runtime??=createCanastaHandler(url!,key);await runtime.handler(req,res);
 };
}
