// Disposable local qualification only. All setup, consent and gameplay use real SQL RPCs.
import {createServer} from 'vite';import react from '@vitejs/plugin-react-swc';
import {connect} from '../royal-flash/database.mjs';import {readFileSync} from 'node:fs';import {randomUUID as uuid} from 'node:crypto';import {resolve} from 'node:path';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
// PostgREST preserves microseconds; the local transport must preserve that exact setup identity too.
pg.types.setTypeParser(1184,value=>value);
const {database}=JSON.parse(readFileSync('.codex/evidence/multiplayer-money/context.json'));
const admin=await connect(database),streams=new Set(),fixtures=new Set(),actors=new Set();
const one=async(c,s,a=[])=>(await c.query(s,a)).rows[0]?.v;
async function tx(user,fn){const c=await connect(database);try{await c.query('BEGIN');if(user){if(!actors.has(user))throw Error('Unknown qualification actor');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[user,JSON.stringify({sub:user,role:'authenticated'})]);await c.query('SET LOCAL ROLE authenticated');}const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}}
await admin.query(`CREATE OR REPLACE FUNCTION public.money_local_notify() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_notify('money_local',jsonb_build_object('table',TG_TABLE_NAME,'new',to_jsonb(NEW))::text);RETURN NEW;END $$;`);
for(const table of ['games','players','gameplay_transfer_batches','tri_towers_revisions','eleven_up_revisions','royal_flash_revisions'])await admin.query(`DROP TRIGGER IF EXISTS money_local_notify ON public.${table};CREATE TRIGGER money_local_notify AFTER INSERT OR UPDATE ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.money_local_notify()`);
await admin.query('LISTEN money_local');admin.on('notification',m=>{for(const res of streams)res.write('data: '+m.payload+'\n\n');});
const reads=new Set(['games','players','profiles','dealer_games','game_defaults','system_settings','gameplay_transfer_batches','user_preferences','game_type_catalog']);
const plugin={name:'money-qualification',configureServer(server){server.middlewares.use('/__money',async(req,res)=>{
 if(req.url.startsWith('/events')){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write(': connected\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
 try{let body='';for await(const s of req)body+=s;const q=JSON.parse(body||'{}'),op=req.url.slice(1);let value;
 if(op==='new'){
  const users=[uuid(),uuid()],players=[uuid(),uuid()],session=uuid();users.forEach(u=>actors.add(u));fixtures.add(session);
  await tx(null,async c=>{for(let i=0;i<2;i++){await c.query('INSERT INTO auth.users(id) VALUES($1)',[users[i]]);await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[users[i],'Qualifier '+users[i].slice(0,8)]);}await c.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,ante_decision_timer_seconds,pot,is_paused,pending_session_end) VALUES($1,'game_selection',true,2,clock_timestamp()+interval '10 minutes',120,0,false,false)",[session]);for(let i=0;i<2;i++)await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,auto_ante) VALUES($1,$2,$3,$4,100,false,true)',[players[i],session,users[i],2-i]);});value={session,users,players};
 }else if(op==='state'){
  if(!fixtures.has(q.session))throw Error('Unknown qualification session');value={game:(await admin.query('SELECT * FROM public.games WHERE id=$1',[q.session])).rows[0],players:(await admin.query('SELECT p.*,pr.username FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=$1',[q.session])).rows};
 }else if(op==='rpc'){
  if(!/^(tri_towers|eleven_up|royal_flash)_(capabilities|configure|action|snapshot|close|history|present_celebration|present_scene|present)$/.test(q.name)&&!['submit_ante_decision','advance_ante_phase'].includes(q.name))value={data:null,error:{message:'Unsupported optional qualification RPC '+q.name}};
  else {if(Object.keys(q.args).some(k=>!/^p_[a-z_]+$/.test(k)))throw Error('Invalid argument');try{value={data:await tx(q.user,c=>one(c,`SELECT public.${q.name}(${Object.keys(q.args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) v`,Object.values(q.args))),error:null};}catch(e){value={data:null,error:{message:e.message,code:e.code}};}}
 }else if(op==='read'){
  if(!reads.has(q.table))value={data:q.single?null:[],error:null};
  else{const clauses=[],params=[];for(const f of q.filters??[]){if(!/^[a-z_]+$/.test(f.key))throw Error('Invalid filter');params.push(f.value);clauses.push(f.op==='in'?`${f.key}=ANY($${params.length})`:`${f.key}${f.op==='neq'?'<>':'='}$${params.length}`);}const rows=(await admin.query(`SELECT * FROM public.${q.table}${clauses.length?' WHERE '+clauses.join(' AND '):''} LIMIT 200`,params)).rows;value={data:q.single?rows[0]??null:rows,error:null};}
 }else throw Error('Unknown operation');
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));
 }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}
 });}};
const server=await createServer({configFile:false,plugins:[react(),plugin],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/multiplayer-money/local-client.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:5192,strictPort:true}});
let working=false;const worker=setInterval(async()=>{if(working)return;working=true;try{await tx(null,async c=>{await c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");for(const family of ['tri_towers','eleven_up','royal_flash'])await c.query(`SELECT private.${family}_recover()`);});}catch(e){console.error(e.message);}finally{working=false;}},1000);
await server.listen();console.log('Qualification UI http://127.0.0.1:5192/dev/multiplayer-money/live.html');
async function stop(){clearInterval(worker);for(const res of streams)res.end();await server.close();await admin.end();process.exit();}process.on('SIGINT',stop);process.on('SIGTERM',stop);
