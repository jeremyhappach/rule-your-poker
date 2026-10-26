import {installPolish} from './install-polish.mjs';
// Local-only qualification transport. Binds loopback, uses synthetic actors and
// actual SQL authority. It is not an application API and never ships in the build.
import {createServer} from 'vite';import react from '@vitejs/plugin-react-swc';
import {connect,context} from './database.mjs';import {installCandidate} from './install-candidate.mjs';import {randomUUID as uuid} from 'node:crypto';
import {resolve} from 'node:path';import {readFile,writeFile} from 'node:fs/promises';
const ctx=await context(),database='quintzee_browser_'+Date.now(),root=await connect('postgres');
if(!/^[a-zA-Z0-9_]+$/.test(ctx.template))throw Error('Local template identity');
await root.query('CREATE DATABASE "'+database+'" TEMPLATE "'+ctx.template+'"');
await writeFile('qualification.local/quintzee/release/browser-context.json',JSON.stringify({database}));
const admin=await connect(database),streams=new Set(),actors=new Set(),token=uuid();
await admin.query('BEGIN');await installCandidate(admin);await installPolish(admin);await admin.query('COMMIT');

const query=async(c,s,a=[])=>(await c.query(s,a)).rows[0]?.v;
async function transaction(user,fn){const c=await connect(database);try{await c.query('BEGIN');if(user){if(!actors.has(user))throw Error('Unknown local actor');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);await c.query('SET LOCAL ROLE authenticated');}const v=await fn(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}}
const rpc=async(name,args)=>{if(!/^arcade_[a-z_]+$/.test(name))throw Error('Unexpected RPC');return transaction(null,c=>query(c,`SELECT public.${name}(${Object.keys(args).map((k,i)=>`${k} => $${i+1}`).join(',')}) v`,Object.values(args)));};
await admin.query('UPDATE private.quintzee_release SET enabled=true,admission_enabled=true');await admin.query("UPDATE private.arcade_rulesets SET enabled=(id='quintzee/2') WHERE game='quintzee'");
await admin.query(`CREATE OR REPLACE FUNCTION public.quintzee_local_notify() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_notify('quintzee_local',jsonb_build_object('id',CASE WHEN TG_TABLE_NAME='quintzee_revisions' THEN to_jsonb(NEW)->>'dealer_game_id' ELSE coalesce(to_jsonb(NEW)->>'run_id',to_jsonb(NEW)->>'game_id',to_jsonb(NEW)->>'id') END,'table',TG_TABLE_NAME,'new',to_jsonb(NEW))::text);RETURN NEW;END $$;
 DROP TRIGGER IF EXISTS quintzee_local_notify ON public.quintzee_revisions;CREATE TRIGGER quintzee_local_notify AFTER INSERT OR UPDATE ON public.quintzee_revisions FOR EACH ROW EXECUTE FUNCTION public.quintzee_local_notify();
 DROP TRIGGER IF EXISTS quintzee_local_notify ON public.arcade_revisions;CREATE TRIGGER quintzee_local_notify AFTER INSERT OR UPDATE ON public.arcade_revisions FOR EACH ROW EXECUTE FUNCTION public.quintzee_local_notify();`);
for(const table of ['players','games','gameplay_transfer_batches'])await admin.query(`DROP TRIGGER IF EXISTS quintzee_local_notify ON public.${table};CREATE TRIGGER quintzee_local_notify AFTER INSERT OR UPDATE ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.quintzee_local_notify()`);
await admin.query('LISTEN quintzee_local');admin.on('notification',message=>{const v=JSON.parse(message.payload);for(const stream of streams)if(stream.id===v.id)stream.res.write('data: '+JSON.stringify(v)+'\n\n');});
let service;
const plugin={name:'quintzee-local-authority',configureServer(server){
server.middlewares.use((req,res,next)=>{if(req.url.startsWith('/arcade/')&&req.headers.accept?.includes('text/html'))req.url='/dev/quintzee/production.html';next();});
server.middlewares.use('/api/arcade',async(req,res)=>{try{
 const actor=req.headers.authorization?.replace('Bearer ','');if(!actors.has(actor))throw Error('Local authentication required');
 let body='';for await(const chunk of req){body+=chunk;if(body.length>10000)throw Error('Request too large');}
 const v=await service.arcadeOperation(rpc,actor,'Qualification',JSON.parse(body));res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));
}catch(e){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.message}));}});
server.middlewares.use('/__quintzee',async(req,res)=>{
 if(req.url.startsWith('/events')){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');const stream={id:new URL(req.url,'http://localhost').searchParams.get('id'),res};streams.add(stream);req.on('close',()=>streams.delete(stream));return;}
 try{let body='';for await(const chunk of req){body+=chunk;if(body.length>10000)throw Error('Request too large');}const q=JSON.parse(body),op=req.url.slice(1);let value;
 if(op==='rpc'){
  if(!['quintzee_snapshot','quintzee_action','quintzee_close','quintzee_history','quintzee_reclaim'].includes(q.name))throw Error('Unexpected RPC');
  if(Object.keys(q.args).some(k=>!/^p_[a-z_]+$/.test(k)))throw Error('Invalid RPC parameter');
  try{value={data:await transaction(q.user,c=>query(c,`SELECT public.${q.name}(${Object.keys(q.args).map((k,i)=>`${k} => $${i+1}`).join(',')}) v`,Object.values(q.args))),error:null,status:200};}catch(e){value={data:null,error:{message:e.message,code:e.code??'P0001'},status:400};}
 }else if(op==='qualify'){
 if(!actors.has(q.user))throw Error('Unknown local actor');
 const solo=q.mode==='solo',table=solo?'private.arcade_runs':'private.quintzee_matches',key=solo?'id':'dealer_game_id';
 if(q.control==='pause')await admin.query('UPDATE public.games SET is_paused=$2 WHERE id=$1',[q.session,q.paused]);
 else if(q.control==='expire')await admin.query('UPDATE '+table+" SET state=jsonb_set(state,$2,to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-10000000)) WHERE "+key+'=$1',[q.id,solo?['board','deadline']:['core','board','deadline']]);
 else if(q.control==='no-match')await admin.query('UPDATE '+table+" SET state=jsonb_set(state,$2,(state#>$2)||jsonb_build_object('phase','playing','dice','[1,2,3,4,5]'::jsonb,'held','[]'::jsonb,'rollsRemaining',1,'scores',(SELECT jsonb_object_agg(c,1) FROM unnest(private.quintzee_v1_categories()) c WHERE c<>'yahtzee'),'potentials','{}'::jsonb)) WHERE "+key+'=$1',[q.id,solo?['board']:['core','board']]);
 else throw Error('Unexpected local control');
 if(!solo&&q.control==='expire')await admin.query("UPDATE private.quintzee_matches SET state=private.quintzee_match_projection(state,state->'core') WHERE dealer_game_id=$1",[q.id]);
 value={ok:true};
 }else if(op==='read'){
  // No fabricated chip state: financial rows, if requested, come from this clone.
  if(!['players','games','gameplay_transfer_batches','profiles'].includes(q.table))value={data:q.single?null:[],error:null};
  else{const keys=Object.keys(q.filters??{});if(!keys.length||keys.some(k=>!['id','game_id','user_id','cursor'].includes(k)))throw Error('Read filter required');const rows=(await admin.query(`SELECT * FROM public.${q.table} WHERE ${keys.map((k,i)=>`${k}=$${i+1}`).join(' AND ')}`,Object.values(q.filters))).rows;value={data:q.single?rows[0]??null:rows,error:null};}
 }else if(op==='new'){
  const users=Array.from({length:q.solo?1:3},()=>uuid());
  await transaction(null,async c=>{for(let i=0;i<users.length;i++){await c.query('INSERT INTO auth.users(id) VALUES($1)',[users[i]]);await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[users[i],(q.solo?'Solo':'Player '+(i+1))+' '+users[i].slice(0,4)]);}});
  users.forEach(u=>actors.add(u));await admin.query("UPDATE public.game_defaults SET quintzee_theme=$1 WHERE game_type='quintzee'",[q.theme==='modern'?'modern':'classic']);
  if(q.pregame){value={user:users[0],mode:'pregame'};}else if(q.solo){const v=await service.arcadeOperation(rpc,users[0],'You',{op:'start',game:'quintzee',presentationVersion:1,theme:q.theme??'modern',requestId:uuid()});value={id:v.id,user:users[0],mode:'solo'};}
  else{
   const session=uuid(),players=users.map(()=>uuid()),deadline=new Date(Date.now()+600000).toISOString();
   await transaction(null,async c=>{await c.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',false,2,$2,0,false,false)",[session,deadline]);for(let i=0;i<2;i++)await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[players[i],session,users[i],2-i]);await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,sitting_out) VALUES($1,$2,$3,NULL,0,false,true)',[players[2],session,users[2]]);});
   const v=await transaction(users[0],c=>query(c,"SELECT public.quintzee_configure($1,$2,2,'quintzee','{\"ante_amount\":5}',$3) v",[session,players[0],deadline]));
   await transaction(users[1],c=>query(c,"SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v",[session,v.dealer_game.id,players[1]]));
   await transaction(users[0],c=>query(c,'SELECT public.advance_ante_phase($1,$2) v',[session,v.dealer_game.id]));
   value={id:v.dealer_game.id,user:users[1],other:users[0],watcher:users[2],session,mode:'multi'};
  }
 }else{
  if(!actors.has(q.user))throw Error('Unknown local actor');
  if(op==='leaderboard')value=await service.arcadeOperation(rpc,q.user,'You',{op:'leaderboard',game:'quintzee',window:'all'});
  else if(q.mode==='solo')value=await service.arcadeOperation(rpc,q.user,'You',{op:op==='action'?'action':'state',game:'quintzee',presentationVersion:1,runId:q.id,...(q.command?{requestId:q.command.requestId,revision:q.command.revision,roundId:q.command.scope,intent:q.command.intent}:{})});
  else if(op==='state')value=await transaction(q.user,c=>query(c,'SELECT public.quintzee_snapshot($1) v',[q.id]));
  else if(op==='action'){const cmd=q.command;value=await transaction(q.user,c=>query(c,'SELECT public.quintzee_action($1,$2,$3,$4,$5) v',[q.id,cmd.requestId,cmd.revision,cmd.intent.type,cmd.intent.items]));}
  else if(op==='close')value=await transaction(q.user,c=>query(c,'SELECT public.quintzee_close($1) v',[q.id]));
  else throw Error('Unknown operation');
 }
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value??{}));
 }catch(e){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.message}));console.error(req.url,e.message);}
 });}};
const server=await createServer({configFile:false,plugins:[react(),plugin],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/quintzee/production-local-client.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:15298,strictPort:true}});
service=await server.ssrLoadModule('/server/arcade/service.ts');
let working=false;
async function recover(){if(working)return;working=true;try{await transaction(null,async c=>{
 await c.query('SELECT private.quintzee_recover()');
 await c.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=true,expires_at=clock_timestamp()+interval '10 seconds',last_completed_at=clock_timestamp(),failure=NULL",[token]);
 const rows=(await c.query("SELECT id FROM private.arcade_runs WHERE game='quintzee' AND status='active' AND due_at<=floor(extract(epoch FROM clock_timestamp())*1000) ORDER BY due_at LIMIT 20")).rows;
 for(const row of rows)await c.query('SELECT public.arcade_quintzee_step(NULL,$1,NULL,NULL,NULL,NULL,NULL,$2)',[row.id,token]);
 });}catch(e){console.error('Recovery',e.message);}finally{working=false;}}
await recover();const worker=setInterval(()=>void recover(),1000);await server.listen();console.log('Quintzee local preview: http://127.0.0.1:15298/dev/quintzee/production.html');
async function shutdown(){clearInterval(worker);for(const {res} of streams)res.end();await server.close();await admin.end();await root.query('DROP DATABASE "'+database+'"');await root.end();process.exit();}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
