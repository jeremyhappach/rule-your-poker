// Local-only qualification transport. Binds loopback, uses synthetic actors and
// actual SQL authority. It is not an application API and never ships in the build.
import {createServer} from 'vite';import react from '@vitejs/plugin-react-swc';
import {connect,localContext} from './database.mjs';import {randomUUID as uuid} from 'node:crypto';
import {resolve} from 'node:path';import {readFile,writeFile} from 'node:fs/promises';
const {database}=localContext(),admin=await connect(database),streams=new Set(),actors=new Set(),token=uuid();
try{for(const u of JSON.parse(await readFile('qualification.local/royal-flash/actors.json','utf8')))actors.add(u);}catch{}
const query=async(c,s,a=[])=>(await c.query(s,a)).rows[0]?.v;
async function transaction(user,fn){const c=await connect(database);try{await c.query('BEGIN');if(user){if(!actors.has(user))throw Error('Unknown local actor');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);await c.query('SET LOCAL ROLE authenticated');}const v=await fn(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}}
const rpc=async(name,args)=>{if(!/^arcade_[a-z_]+$/.test(name))throw Error('Unexpected RPC');return transaction(null,c=>query(c,`SELECT public.${name}(${Object.keys(args).map((k,i)=>`${k} => $${i+1}`).join(',')}) v`,Object.values(args)));};
await admin.query('UPDATE private.royal_flash_release SET enabled=true,admission_enabled=true');await admin.query("UPDATE private.arcade_rulesets SET enabled=true WHERE id='royal-flash/1'");
await admin.query(`CREATE OR REPLACE FUNCTION public.royal_local_notify() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_notify('royal_local',jsonb_build_object('id',coalesce(to_jsonb(NEW)->>'dealer_game_id',to_jsonb(NEW)->>'run_id'))::text);RETURN NEW;END $$;
 DROP TRIGGER IF EXISTS royal_local_notify ON public.royal_flash_revisions;CREATE TRIGGER royal_local_notify AFTER INSERT OR UPDATE ON public.royal_flash_revisions FOR EACH ROW EXECUTE FUNCTION public.royal_local_notify();
 DROP TRIGGER IF EXISTS royal_local_notify ON public.arcade_revisions;CREATE TRIGGER royal_local_notify AFTER INSERT OR UPDATE ON public.arcade_revisions FOR EACH ROW EXECUTE FUNCTION public.royal_local_notify();`);
await admin.query('LISTEN royal_local');admin.on('notification',message=>{const v=JSON.parse(message.payload);for(const stream of streams)if(stream.id===v.id)stream.res.write('data: {}\n\n');});
let service;
const plugin={name:'royal-local-authority',configureServer(server){server.middlewares.use('/__royal',async(req,res)=>{
 if(req.url.startsWith('/events')){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');const stream={id:new URL(req.url,'http://localhost').searchParams.get('id'),res};streams.add(stream);req.on('close',()=>streams.delete(stream));return;}
 try{let body='';for await(const chunk of req){body+=chunk;if(body.length>10000)throw Error('Request too large');}const q=JSON.parse(body),op=req.url.slice(1);let value;
 if(op==='read'){
  // No fabricated chip state: financial rows, if requested, come from this clone.
  if(!['players','games','gameplay_transfer_batches','profiles'].includes(q.table))value={data:q.single?null:[],error:null};
  else{const keys=Object.keys(q.filters??{});if(!keys.length||keys.some(k=>!['id','game_id','user_id'].includes(k)))throw Error('Read filter required');const rows=(await admin.query(`SELECT * FROM public.${q.table} WHERE ${keys.map((k,i)=>`${k}=$${i+1}`).join(' AND ')}`,Object.values(q.filters))).rows;value={data:q.single?rows[0]??null:rows,error:null};}
 }else if(op==='new'){
  const users=Array.from({length:q.solo?1:2},()=>uuid());
  await transaction(null,async c=>{for(let i=0;i<users.length;i++){await c.query('INSERT INTO auth.users(id) VALUES($1)',[users[i]]);await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[users[i],(q.solo?'Solo':'Player '+(i+1))+' '+users[i].slice(0,4)]);}});
  users.forEach(u=>actors.add(u));await writeFile('qualification.local/royal-flash/actors.json',JSON.stringify([...actors]));
  if(q.solo){const v=await service.arcadeOperation(rpc,users[0],'You',{op:'start',game:'royal-flash',presentationVersion:1,requestId:uuid()});value={id:v.id,user:users[0],mode:'solo'};}
  else{
   const session=uuid(),players=users.map(()=>uuid()),deadline=new Date(Date.now()+600000).toISOString();
   await transaction(null,async c=>{await c.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',false,2,$2,0,false,false)",[session,deadline]);for(let i=0;i<2;i++)await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[players[i],session,users[i],2-i]);});
   const v=await transaction(users[0],c=>query(c,"SELECT public.royal_flash_configure($1,$2,2,'royal-flash','{\"ante_amount\":5}',$3) v",[session,players[0],deadline]));
   await transaction(users[1],c=>query(c,"SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v",[session,v.dealer_game.id,players[1]]));
   await transaction(users[0],c=>query(c,'SELECT public.advance_ante_phase($1,$2) v',[session,v.dealer_game.id]));
   value={id:v.dealer_game.id,user:users[1],other:users[0],session,mode:'multi'};
  }
 }else{
  if(!actors.has(q.user))throw Error('Unknown local actor');
  if(op==='leaderboard')value=await service.arcadeOperation(rpc,q.user,'You',{op:'leaderboard',game:'royal-flash',window:'all'});
  else if(q.mode==='solo')value=await service.arcadeOperation(rpc,q.user,'You',{op:op==='action'?'action':'state',game:'royal-flash',presentationVersion:1,runId:q.id,...(q.command?{requestId:q.command.requestId,revision:q.command.revision,roundId:q.command.scope,intent:q.command.intent}:{})});
  else if(op==='state')value=await transaction(q.user,c=>query(c,'SELECT public.royal_flash_snapshot($1) v',[q.id]));
  else if(op==='action'){const cmd=q.command;value=await transaction(q.user,c=>query(c,'SELECT public.royal_flash_action($1,$2,$3,$4,$5) v',[q.id,cmd.requestId,cmd.revision,cmd.intent.type,cmd.intent.type==='place'?[cmd.intent.index]:null]));}
  else if(op==='close')value=await transaction(q.user,c=>query(c,'SELECT public.royal_flash_close($1) v',[q.id]));
  else throw Error('Unknown operation');
 }
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value??{}));
 }catch(e){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.message}));console.error(req.url,e.message);}
 });}};
const server=await createServer({configFile:false,plugins:[react(),plugin],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/royal-flash/local-client.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:5186,strictPort:true}});
service=await server.ssrLoadModule('/server/arcade/service.ts');
let working=false;
async function recover(){if(working)return;working=true;try{await transaction(null,async c=>{
 await c.query('SELECT private.royal_flash_recover()');
 await c.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=true,expires_at=clock_timestamp()+interval '10 seconds',last_completed_at=clock_timestamp(),failure=NULL",[token]);
 const rows=(await c.query("SELECT id FROM private.arcade_runs WHERE game='royal-flash' AND status='active' AND due_at<=floor(extract(epoch FROM clock_timestamp())*1000) ORDER BY due_at LIMIT 20")).rows;
 for(const row of rows)await c.query('SELECT public.arcade_royal_step(NULL,$1,NULL,NULL,NULL,NULL,NULL,$2)',[row.id,token]);
 });}catch(e){console.error('Recovery',e.message);}finally{working=false;}}
await recover();const worker=setInterval(()=>void recover(),1000);await server.listen();console.log('Royal Flash local preview: http://127.0.0.1:5186/dev/royal-flash/live.html');
async function shutdown(){clearInterval(worker);for(const {res} of streams)res.end();await server.close();await admin.end();process.exit();}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
