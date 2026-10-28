import {createServer} from 'vite';import react from '@vitejs/plugin-react-swc';import {resolve} from 'node:path';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {pathToFileURL} from 'node:url';
const {default:pg}=await import(pathToFileURL(process.env.PTOWN_PG_MODULE||'C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js').href);
const evidence=JSON.parse(readFileSync('qualification.local/async-words/proof.json','utf8'));if(!evidence.passed)throw Error('Financial proof required');
const pool=new pg.Pool({host:'127.0.0.1',port:55439,user:'tri_test',database:evidence.database,max:12});
async function tx(actor,role,work){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)",[actor??'',role]);if(role==='authenticated')await c.query('SET LOCAL ROLE authenticated');if(role==='service_role')await c.query('SET LOCAL ROLE service_role');const result=await work(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
const rpc=async(actor,role,name,args={})=>tx(actor,role,async c=>{
 if(!/^(delayed_[a-z_]+|ptown_words_[a-z_]+|platform_notification_center)$/.test(name)||Object.keys(args).some(k=>!/^p_[a-z_]+$/.test(k)))throw Error('Unknown qualification RPC');
 return (await c.query('SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=> $'+(i+1)).join(',')+') value',Object.values(args).map(v=>v&&typeof v==='object'?JSON.stringify(v):v))).rows[0]?.value;
});
const saved=existsSync('qualification.local/async-words/browser-context.json')?JSON.parse(readFileSync('qualification.local/async-words/browser-context.json')):null;const prior=saved?.database===evidence.database?saved:null;const users=prior?.users??[randomUUID(),randomUUID()],tokens=prior?.tokens??[randomUUID(),randomUUID()],streams=new Set();
if(!prior)for(let i=0;i<2;i++)await tx(null,'owner',async c=>{await c.query('INSERT INTO auth.users(id) VALUES($1)',[users[i]]);await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true)',[users[i],'AW browser '+users[i].slice(0,8)]);});
await tx(null,'owner',async c=>{await c.query("CREATE OR REPLACE FUNCTION private.delayed_local_notify() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM pg_notify('delayed_local',jsonb_build_object('table',TG_TABLE_NAME,'eventType',TG_OP,'new',to_jsonb(NEW))::text);RETURN NEW;END $$");for(const table of ['delayed_match_updates','platform_notifications','ptown_words_revisions']){await c.query(`DROP TRIGGER IF EXISTS delayed_local_notify ON public.${table}`);await c.query(`CREATE TRIGGER delayed_local_notify AFTER INSERT OR UPDATE ON public.${table} FOR EACH ROW EXECUTE FUNCTION private.delayed_local_notify()`);}});
await tx(null,'owner',async c=>{await c.query("SELECT private.delayed_incident_close(id,'Local browser qualification reset') FROM private.delayed_incidents WHERE closed_at IS NULL");await c.query('UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()');});
const listener=await pool.connect();await listener.query('LISTEN delayed_local');listener.on('notification',e=>{const value=JSON.parse(e.payload);for(const s of streams)if(s.user===value.new.user_id||value.table==='ptown_words_revisions')s.res.write('data: '+e.payload+'\n\n');});
const plugin={name:'delayed-loopback-qualification',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/__delayed_route/')&&url.pathname!=='/api/delayed')return next();
 const token=req.headers.authorization?.replace(/^Bearer /,'')??url.searchParams.get('token'),user=users[tokens.indexOf(token)],op=url.pathname.split('/').at(-1);
 if(!user){res.writeHead(401);res.end();return;}
 if(op==='events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write(': connected\n\n');const s={user,res};streams.add(s);req.on('close',()=>streams.delete(s));return;}
 try{let raw='';for await(const part of req){raw+=part;if(raw.length>50000)throw Error('Large request');}const q=JSON.parse(raw||'{}');let result;
  if(op==='auth')result={data:{session:{user:{id:user,email:'fixture@local.test'},access_token:token,refresh_token:token,expires_at:Math.floor(Date.now()/1000)+3600}},error:null};
  else if(op==='rpc')result={data:await rpc(user,'authenticated',q.name,q.args),error:null};
  else if(op==='read'){
   const allowed=['game_defaults','profiles','system_settings','user_preferences','user_roles'];
   if(!allowed.includes(q.table))result={data:q.single?null:[],error:null};
   else{const args=[],where=[];for(const f of q.filters??[]){if(!/^[a-z_]+$/.test(f.key)||f.op!=='eq')continue;args.push(f.value);where.push(f.key+'=$'+args.length);}
    const rows=await tx(user,'authenticated',async c=>(await c.query('SELECT * FROM public.'+q.table+(where.length?' WHERE '+where.join(' AND '):'')+' LIMIT 30',args)).rows);result={data:q.single?rows[0]??null:rows,error:null};}
  }else result={data:null,error:null};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 }catch(e){res.statusCode=409;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:null,error:op==='delayed'?e.message:{message:e.message}}));console.log('Local request rejected',op,e.message);}
});server.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/delayed')||req.url?.startsWith('/local-words'))req.url='/dev/async-words/route.html';next();});}};
const server=await createServer({configFile:false,plugins:[react(),plugin],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/async-words/route-client.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:15319,strictPort:true}});
writeFileSync('qualification.local/async-words/browser-context.json',JSON.stringify({users,tokens,names:users.map(id=>'AW browser '+id.slice(0,8)),database:evidence.database}));setInterval(()=>void tx(null,'owner',c=>c.query('SELECT private.delayed_words_recover()')).catch(console.error),30000).unref();await server.listen();console.log('Delayed loopback qualification ready 15319');
process.on('SIGINT',async()=>{for(const s of streams)s.res.end();await server.close();listener.release();await pool.end();process.exit();});
