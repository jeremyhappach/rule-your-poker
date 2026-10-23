import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {megaOperation} from '../../server/megaCardGolf/service';
import {recoverArcade} from '../../server/arcade/service';
import {connect,rpcFor} from './database.mjs';
const root=path.resolve(__dirname,'../..');
export default defineConfig({root,cacheDir:path.join(__dirname,'backend.local/cache'),envDir:__dirname,plugins:[react(),{name:'mega-postgres-fixture',apply:'serve',async configureServer(server){
 const context=JSON.parse(readFileSync(path.join(__dirname,'backend.local/context.json'),'utf8'));
 const db=await connect(context.database),rpc=rpcFor(db),sessions=new Map<string,string>();
 const tokens=context.users.map((id:string)=>{const token=randomBytes(32).toString('hex');sessions.set(token,id);return token;});
 writeFileSync(path.join(__dirname,'backend.local/browser-auth.json'),JSON.stringify({tokens}));
 // Qualification admission only in this exact disposable local database.
 await db.query("UPDATE private.arcade_rulesets SET enabled=true WHERE id='mega-card-golf/1'");
 let timer:ReturnType<typeof setTimeout>;let stopped=false;
 const recover=async()=>{const token=crypto.randomUUID();await db.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=false,failure=NULL,expires_at=clock_timestamp()+interval '25 seconds'",[token]);await recoverArcade(rpc,token);};
 const schedule=async()=>{clearTimeout(timer);if(stopped)return;const value=(await db.query("SELECT min(due_at) due FROM private.arcade_runs WHERE status='active' AND game='mega-card-golf'")).rows[0]?.due;timer=setTimeout(async()=>{try{await recover();}catch(e){console.error('Local recovery failure',String(e));}finally{void schedule();}},value?Math.max(10,Math.min(20000,Number(value)-Date.now())):20000);};
 await recover();void schedule();server.httpServer?.once('close',()=>{stopped=true;clearTimeout(timer);void db.end();});
 server.middlewares.use('/__mega',async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(req.headers.host!=='127.0.0.1:5188'||req.headers.origin&&req.headers.origin!=='http://127.0.0.1:5188'){res.statusCode=403;res.end('{}');return;}
  try{
   const bearer=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization??'')?.[1]??req.headers.cookie?.match(/(?:^|; )mega_backend=([a-f0-9]{64})(?:;|$)/)?.[1];
   const actor=bearer?sessions.get(bearer):null;if(!actor){res.statusCode=401;throw Error('arcade:authentication_required');}
   if(req.method!=='POST')throw Error('arcade:method');let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw Error('arcade:request_size');}
   const body=JSON.parse(raw);const result=await megaOperation(rpc,actor,body);res.end(JSON.stringify(result));void schedule();
  }catch(e){if(res.statusCode===200)res.statusCode=409;res.end(JSON.stringify({error:e instanceof Error?e.message:'arcade:request_failed'}));}
 });
}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:path.join(__dirname,'no-production-client.ts')},{find:'@',replacement:path.join(root,'src')}]},server:{host:'127.0.0.1',port:5188,strictPort:true,open:false},build:{outDir:'dist/mega-card-golf-backend',rollupOptions:{input:path.join(__dirname,'index.html')}}});
