// Synthetic local authority harness only. Never points at a production database.
import {createServer} from 'vite';import react from '@vitejs/plugin-react-swc';import {resolve} from 'node:path';
import {connect,localContext} from './database.mjs';import {randomUUID as uuid} from 'node:crypto';
const database=localContext().database;if(!/^race_poker_\d+$/.test(database))throw Error('Isolated Race Poker database required');
const admin=await connect(database),streams=new Set(),actors=new Set();
const query=async(c,s,a=[])=>(await c.query(s,a)).rows[0]?.v;
async function tx(user,fn){const c=await connect(database);try{await c.query('BEGIN');if(user){if(!actors.has(user))throw Error('Unknown local actor');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);await c.query('SET LOCAL ROLE authenticated');}const v=await fn(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}}
await admin.query("UPDATE private.race_poker_release SET enabled=true,admission_enabled=true,fake_qualified=true,real_qualified=true");
await admin.query(`CREATE OR REPLACE FUNCTION public.race_poker_local_notify() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_notify('race_poker_local',jsonb_build_object('id',CASE WHEN TG_TABLE_NAME='race_poker_revisions' THEN to_jsonb(NEW)->>'dealer_game_id' ELSE coalesce(to_jsonb(NEW)->>'game_id',to_jsonb(NEW)->>'id') END,'table',TG_TABLE_NAME,'new',to_jsonb(NEW))::text);RETURN NEW;END $$;`);
for(const table of ['race_poker_revisions','players','games','gameplay_transfer_batches'])await admin.query(`DROP TRIGGER IF EXISTS race_poker_local_notify ON public.${table};CREATE TRIGGER race_poker_local_notify AFTER INSERT OR UPDATE ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.race_poker_local_notify()`);
await admin.query('LISTEN race_poker_local');admin.on('notification',message=>{const v=JSON.parse(message.payload);for(const stream of streams)if(stream.id===v.id)stream.res.write('data: '+JSON.stringify(v)+'\n\n');});
const plugin={name:'race-poker-local-authority',configureServer(server){server.middlewares.use('/__race_poker',async(req,res)=>{
 if(req.url.startsWith('/events')){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');const stream={id:new URL(req.url,'http://localhost').searchParams.get('id'),res};streams.add(stream);req.on('close',()=>streams.delete(stream));return;}
 try{let body='';for await(const chunk of req){body+=chunk;if(body.length>10000)throw Error('Request too large');}const q=JSON.parse(body),op=req.url.slice(1);let value;
 if(op==='new'){
  const users=[uuid(),uuid()],players=[uuid(),uuid()],session=uuid(),offer=new Date(Date.now()+600000).toISOString();users.forEach(u=>actors.add(u));
  await tx(null,async c=>{await c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");for(let i=0;i<2;i++){await c.query('INSERT INTO auth.users(id) VALUES($1)',[users[i]]);await c.query('INSERT INTO public.profiles(id,username,is_active,play_sounds) VALUES($1,$2,true,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[users[i],(i?'Racing Opponent ':'Jeremy Qualification ')+users[i].slice(0,8)]);}await c.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',$3,2,$2,0,false,false)",[session,offer,!!q.real]);for(let i=0;i<2;i++)await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,$5)',[players[i],session,users[i],2-i,i===1&&!!q.bot]);});
  const config=await tx(users[0],c=>query(c,"SELECT public.race_poker_configure($1,$2,2,'race-poker','{\"ante_amount\":5}',$3) v",[session,players[0],offer])),id=config.dealer_game.id;
  if(!q.bot)await tx(users[1],c=>query(c,"SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v",[session,id,players[1]]));
  await tx(users[0],c=>query(c,'SELECT public.advance_ante_phase($1,$2) v',[session,id]));
  // Boundary fixtures preserve the frozen rules; ordinary browser commands determine the outcome.
  const state=await query(admin,'SELECT state v FROM private.race_poker_matches WHERE dealer_game_id=$1',[id]),index=state.players.findIndex(p=>p.userId===users[0]);
  const deck=[0,1,2,13,4,20,34,...Array.from({length:52},(_,i)=>i).filter(i=>![0,1,2,13,4,20,34].includes(i))];
  await admin.query("UPDATE private.race_poker_matches SET state=state||jsonb_build_object('turnIndex',$2::int,'starter',$2::int,'stage',$3::int,'handInRound',$4::int,'scores',$5::jsonb,'deck',$6::jsonb,'choices','[0,1,2]'::jsonb,'cursor',3,'deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+$7::int),revision=revision+1 WHERE dealer_game_id=$1",[id,index,q.draw?16:1,q.draw?1:0,JSON.stringify({[players[0]]:q.draw?0:47000,[players[1]]:0}),JSON.stringify(deck),q.draw?5000:30000]);
  value={id,session,user:users[0],other:users[1],players,bot:!!q.bot,real:!!q.real,draw:!!q.draw};
 }else if(op==='rpc'){
  if(!['race_poker_snapshot','race_poker_action','race_poker_close','race_poker_history'].includes(q.name)||Object.keys(q.args).some(k=>!/^p_[a-z_]+$/.test(k)))throw Error('Unexpected RPC');
  try{value={data:await tx(q.user,c=>query(c,`SELECT public.${q.name}(${Object.keys(q.args).map((k,i)=>`${k} => $${i+1}`).join(',')}) v`,Object.values(q.args))),error:null,status:200};}catch(e){value={data:null,error:{message:e.message,code:e.code??'P0001'},status:400};}
 }else if(op==='read'){
  if(!['players','games','gameplay_transfer_batches','profiles'].includes(q.table))value={data:q.single?null:[],error:null};
  else{const keys=Object.keys(q.filters??{});if(!keys.length||keys.some(k=>!['id','game_id','user_id','cursor'].includes(k)))throw Error('Read filter required');const rows=(await admin.query(`SELECT * FROM public.${q.table} WHERE ${keys.map((k,i)=>`${k}=$${i+1}`).join(' AND ')}`,Object.values(q.filters))).rows;value={data:q.single?rows[0]??null:rows,error:null};}
 }else throw Error('Unexpected operation');
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value??{}));
 }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));console.error(e.message);}
 });}};
const server=await createServer({configFile:false,cacheDir:resolve('qualification.local/race-poker/vite-live-cache'),plugins:[react(),plugin],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/race-poker/local-client.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:5227,strictPort:true}});
let working=false;const worker=setInterval(async()=>{if(working)return;working=true;try{await tx(null,c=>c.query('SELECT private.race_poker_recover()'));}catch(e){console.error('Recovery',e.message);}finally{working=false;}},250);
await server.listen();console.log('Race Poker SQL-backed local browser: http://127.0.0.1:5227/dev/race-poker/live.html');
async function shutdown(){clearInterval(worker);for(const {res} of streams)res.end();await server.close();await admin.end();process.exit();}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
