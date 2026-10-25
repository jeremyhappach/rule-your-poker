// Loopback-only prototype. Synthetic identity tokens never enter production.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {context,connect} from './database.mjs';
const {database}=await context(),db=await connect(database),streams=new Set();
const tokenPath='qualification.local/quintzee/actors.json';
const tokens=new Map(existsSync(tokenPath)?JSON.parse(readFileSync(tokenPath,'utf8')):[]);
const defaults={durationMs:180000,clearBonus:35};
const read=async(c,sql,args=[])=>(await c.query(sql,args)).rows[0]?.v;
async function command(id,actor,cmd){const c=await connect(database);try{
 await c.query('BEGIN');const v=await read(c,'SELECT quintzee_qualification.command($1,$2,$3,$4,$5,$6,$7) v',[id,actor,cmd?.requestId??null,cmd?.revision??null,cmd?.scope??null,cmd?.intent?.type??null,cmd?.intent?.items??null]);await c.query('COMMIT');return v;
}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}}
function notify(id){for(const s of streams)if(s.id===id)s.res.write('data: '+JSON.stringify({id})+'\n\n');}
const plugin={name:'quintzee-local-authority',configureServer(server){server.middlewares.use('/__quintzee',async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(req.method==='GET'&&url.pathname==='/events'){
   const a=tokens.get(url.searchParams.get('token'));if(!a||a.id!==url.searchParams.get('id'))throw Error('Local participant token required');
   res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write(': connected\n\n');const stream={id:a.id,res};streams.add(stream);req.on('close',()=>streams.delete(stream));return;
  }
  if(req.method!=='POST')throw Error('POST required');
  if(req.headers.origin&&req.headers.origin!=='http://127.0.0.1:5197')throw Error('Local origin required');
  let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)throw Error('Request too large');}
  const q=JSON.parse(body);let result;
  if(url.pathname==='/new'){
   if(![1,2,3,4].includes(q.players)||!['classic','modern'].includes(q.theme))throw Error('Invalid local setup');
   const ids=Array.from({length:q.players},()=>randomUUID()),id=randomUUID();
   const rules=await read(db,'SELECT private.quintzee_rules($1,$2) v',[defaults.durationMs,defaults.clearBonus]);
   const state=await read(db,'SELECT private.quintzee_start($1,$2,$3) v',[ids,rules,Date.now()]);
   await db.query("INSERT INTO quintzee_qualification.runs(id,state,theme,config,dependency_hash) VALUES($1,$2,$3,$4,md5(pg_get_functiondef('private.yahtzee_category_score(jsonb,jsonb,text)'::regprocedure)))",[id,state,q.theme,rules]);
   result={id,players:ids.map((actor,i)=>{const token=randomUUID();tokens.set(token,{id,actor});return {actor,token,name:`Player ${i+1}`};})};writeFileSync(tokenPath,JSON.stringify([...tokens]));
  }else{
   const a=tokens.get(q.token);if(!a||a.id!==q.id)throw Error('Local participant token required');
   if(!['/state','/action'].includes(url.pathname))throw Error('Unknown operation');
   result=await command(a.id,a.actor,url.pathname==='/action'?q.command:undefined);
   if(result.outcome==='committed')notify(a.id);
  }
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 }catch(e){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.message,definitive:true}));}
 });}};
const server=await createServer({configFile:false,cacheDir:'qualification.local/quintzee/vite-cache',plugins:[react(),plugin],resolve:{alias:{'@':resolve('src')}},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:5197,strictPort:true,fs:{allow:[resolve('.'),resolve('node_modules')]}}});
let busy=false;
async function recover(){if(busy)return;busy=true;try{
 const rows=(await db.query("SELECT id,state->'players'->>0 actor,revision FROM quintzee_qualification.runs WHERE NOT (state->>'finished')::boolean AND paused_at IS NULL AND (state#>>'{board,deadline}')::bigint<=$1",[Date.now()])).rows;
 for(const r of rows){const v=await command(r.id,r.actor);if(v.revision!==Number(r.revision))notify(r.id);}
}catch(e){console.error('Local recovery',e.message);}finally{busy=false;}}
const worker=setInterval(()=>void recover(),1000);
await server.listen();console.log('Quintzee local prototype: http://127.0.0.1:5197/dev/quintzee/live.html');
async function shutdown(){clearInterval(worker);for(const s of streams)s.res.end();await server.close();await db.end();process.exit();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
