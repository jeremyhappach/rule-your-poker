import {createServer} from 'vite';import react from '@vitejs/plugin-react-swc';
import {readFileSync as read} from 'node:fs';import {resolve} from 'node:path';import {randomUUID as uuid} from 'node:crypto';
import {connect} from './database.mjs';
const {database}=JSON.parse(read('qualification.local/six-card-golf/ui-context.json','utf8')),streams=new Set(),actors=new Set(),admin=await connect(database);
const query=async(c,s,a=[])=>(await c.query(s,a)).rows[0]?.v;
async function transaction(user,fn){const c=await connect(database);try{await c.query('BEGIN');if(user){if(!actors.has(user))throw Error('Unknown local actor');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);await c.query('SET LOCAL ROLE authenticated');}const v=await fn(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}}
await admin.query("CREATE OR REPLACE FUNCTION public.golf_local_notify() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_notify('golf_local',jsonb_build_object('id',NEW.dealer_game_id,'table','golf_revisions','new',to_jsonb(NEW))::text);RETURN NEW;END $$;DROP TRIGGER IF EXISTS golf_local_notify ON public.golf_revisions;CREATE TRIGGER golf_local_notify AFTER INSERT OR UPDATE ON public.golf_revisions FOR EACH ROW EXECUTE FUNCTION public.golf_local_notify()");
await admin.query('LISTEN golf_local');admin.on('notification',e=>{const v=JSON.parse(e.payload);for(const s of streams)if(s.id===v.id)s.res.write('data: '+JSON.stringify(v)+'\n\n');});
const plugin={name:'golf-local-authority',configureServer(server){server.middlewares.use('/__golf',async(req,res)=>{
 if(req.url.startsWith('/events')){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': ready\n\n');const s={id:new URL(req.url,'http://localhost').searchParams.get('id'),res};streams.add(s);req.on('close',()=>streams.delete(s));return;}
 try{let body='';for await(const chunk of req){body+=chunk;if(body.length>10000)throw Error('Request too large');}const input=JSON.parse(body);let value;
 if(req.url==='/new'){console.log('Local fixture request');
  const n=[2,3,4].includes(input.players)?input.players:2,users=Array.from({length:n},()=>uuid()),ids=users.map(()=>uuid()),g=uuid(),deadline=new Date(Date.now()+600000).toISOString();
  for(const u of users)actors.add(u);
  await transaction(null,async c=>{
   for(let i=0;i<n;i++){await c.query('INSERT INTO auth.users(id) VALUES($1)',[users[i]]);await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[users[i],'Player '+(i+1)+' '+users[i].slice(0,8)]);}
   await c.query("INSERT INTO public.games(id,status,current_host,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',$3,false,4,$2,0,false,false)",[g,deadline,users[0]]);
   for(let i=0;i<n;i++)await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[ids[i],g,users[i],4-i]);
  });
  console.log('Local seats inserted');const setup=await transaction(users[0],c=>query(c,"SELECT public.golf_configure($1,$2,4,'six-card-golf','{\"ante_amount\":5}',$3) v",[g,ids[0],deadline])),d=setup.dealer_game.id;
  console.log('Local consent offer created');for(let i=1;i<n;i++)await transaction(users[i],c=>query(c,"SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v",[g,d,ids[i]]));
  await transaction(users[0],c=>query(c,'SELECT public.advance_ante_phase($1,$2) v',[g,d]));
  if(input.endSession)await transaction(null,c=>c.query('UPDATE public.games SET pending_session_end=true WHERE id=$1',[g]));
  value={id:d,session:g,users,players:ids.map((id,i)=>({id,user:users[i],seat:4-i})),user:users[0],endSession:!!input.endSession};
 }else if(req.url==='/rpc'){
  if(!['golf_snapshot','golf_action','golf_close','golf_history','set_game_paused'].includes(input.name)||Object.keys(input.args).some(k=>!/^p_[a-z_]+$/.test(k)))throw Error('Invalid RPC');
  try{value={data:await transaction(input.user,c=>query(c,'SELECT public.'+input.name+'('+Object.keys(input.args).map((k,i)=>k+' => $'+(i+1)).join(',')+') v',Object.values(input.args))),error:null,status:200};}
  catch(e){value={data:null,error:{message:e.message,code:e.code??'P0001'},status:400};}
 }else if(req.url==='/read'){
  if(!['players','games','gameplay_transfer_batches','profiles','session_player_snapshots'].includes(input.table))value={data:input.single?null:[],error:null};
  else{const keys=Object.keys(input.filters??{});if(!keys.length||keys.some(k=>!['id','game_id','user_id','cursor'].includes(k)))throw Error('Filter required');const rows=(await admin.query('SELECT * FROM public.'+input.table+' WHERE '+keys.map((k,i)=>k+'=$'+(i+1)).join(' AND '),Object.values(input.filters))).rows;value={data:input.single?rows[0]??null:rows,error:null};}
 }else throw Error('Unknown operation');
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value??{}));
 }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}
 });}};
const server=await createServer({configFile:false,cacheDir:'qualification.local/six-card-golf/vite-cache',optimizeDeps:{entries:[]},plugins:[react(),plugin],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/six-card-golf/local-client.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{watch:{ignored:['**/qualification.local/**','**/supabase/.temp/**','**/temp videos/**']},host:'127.0.0.1',port:5198,strictPort:true}});
let working=false;const worker=setInterval(async()=>{if(working)return;working=true;try{await transaction(null,c=>c.query('SELECT private.golf_recover()'));}catch(e){console.error(e.message);}finally{working=false;}},1000);
await server.listen();console.log('Golf: http://127.0.0.1:5198/dev/six-card-golf/live.html');
process.on('SIGINT',async()=>{clearInterval(worker);await server.close();await admin.end();process.exit();});
