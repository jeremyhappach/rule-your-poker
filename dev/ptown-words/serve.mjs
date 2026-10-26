// Isolated loopback qualification only. Real SQL authority; synthetic identities.
import {createServer} from 'vite';import react from '@vitejs/plugin-react-swc';import {resolve} from 'node:path';import {readFileSync as read,writeFileSync as write} from 'node:fs';import {randomUUID as uuid} from 'node:crypto';
import {connect,context,candidate} from './database.mjs';
const database=context().database,admin=await connect(database),streams=new Set(),actors=new Set();
if(!(await admin.query("SELECT to_regclass('private.ptown_words_matches') present")).rows[0].present){
 await admin.query('BEGIN');try{for(const f of JSON.parse(read('dev/ptown-words/deployed-contract.json','utf8')).functions.filter(f=>['megatouch_begin','advance_ante_phase_exact','megatouch_frozen_stake'].includes(f.name)))await admin.query(f.definition);await admin.query(candidate());await admin.query('COMMIT');}catch(e){await admin.query('ROLLBACK');throw e;}
}
await admin.query('UPDATE private.ptown_words_release SET enabled=true,admission_enabled=true');
await admin.query(`CREATE OR REPLACE FUNCTION public.ptown_words_local_notify() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_notify('ptown_words_local',jsonb_build_object('id',CASE WHEN TG_TABLE_NAME='ptown_words_revisions' THEN to_jsonb(NEW)->>'dealer_game_id' ELSE coalesce(to_jsonb(NEW)->>'game_id',to_jsonb(NEW)->>'id') END,'table',TG_TABLE_NAME,'new',to_jsonb(NEW))::text);RETURN NEW;END $$;`);
for(const table of ['ptown_words_revisions','games','players','gameplay_transfer_batches'])await admin.query(`DROP TRIGGER IF EXISTS ptown_words_local_notify ON public.${table};CREATE TRIGGER ptown_words_local_notify AFTER INSERT OR UPDATE ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.ptown_words_local_notify()`);
await admin.query('LISTEN ptown_words_local');admin.on('notification',message=>{const v=JSON.parse(message.payload);for(const stream of streams)if(stream.id===v.id)stream.res.write('data: '+JSON.stringify(v)+'\n\n');});
async function tx(user,fn){const c=await connect(database);try{await c.query('BEGIN');if(user){if(!actors.has(user))throw Error('Unknown synthetic user');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);await c.query('SET LOCAL ROLE authenticated');}const v=await fn(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}}
const query=async(c,sql,params=[])=>(await c.query(sql,params)).rows[0]?.v;
const userIds=[uuid(),uuid()],playerIds=[uuid(),uuid()],session=uuid(),deadline=new Date(Date.now()+600000).toISOString();userIds.forEach(u=>actors.add(u));
await tx(null,async c=>{for(let i=0;i<2;i++){await c.query('INSERT INTO auth.users(id) VALUES($1)',[userIds[i]]);await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[userIds[i],['Alex','Mara'][i]+' '+userIds[i].slice(0,6)]);}await c.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',false,2,$2,0,false,false)",[session,deadline]);for(let i=0;i<2;i++)await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[playerIds[i],session,userIds[i],2-i]);});
const configured=await tx(userIds[0],c=>query(c,"SELECT public.ptown_words_configure($1,$2,2,'ptown-words','{\"ante_amount\":5}',$3) v",[session,playerIds[0],deadline])),id=configured.dealer_game.id;
await tx(userIds[1],c=>query(c,"SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v",[session,id,playerIds[1]]));
const fixture={id,session,users:userIds,players:playerIds};write('qualification.local/ptown-words/live.json',JSON.stringify(fixture));
const plugin={name:'ptown-words-local',configureServer(server){server.middlewares.use('/__words',async(req,res)=>{
 if(req.url.startsWith('/events')){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');const stream={id:new URL(req.url,'http://localhost').searchParams.get('id'),res};streams.add(stream);req.on('close',()=>streams.delete(stream));return;}
 try{let body='';for await(const chunk of req){body+=chunk;if(body.length>12000)throw Error('Request too large');}const q=JSON.parse(body);let value;
 if(req.url==='/rpc'){
  if(!['ptown_words_snapshot','ptown_words_action','ptown_words_close','ptown_words_history'].includes(q.name)||Object.keys(q.args).some(k=>!/^p_[a-z_]+$/.test(k)))throw Error('Unexpected RPC');
  try{value={data:await tx(q.user,c=>query(c,`SELECT public.${q.name}(${Object.keys(q.args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) v`,Object.entries(q.args).map(([k,v])=>k==='p_items'&&v!==null?JSON.stringify(v):v))),error:null,status:200};}catch(e){value={data:null,error:{message:e.message,code:e.code},status:400};}
 }else if(req.url==='/read'){
  if(!['players','games','profiles','gameplay_transfer_batches'].includes(q.table))value={data:q.single?null:[],error:null};
  else{const keys=Object.keys(q.filters??{});if(!keys.length||keys.some(k=>!['id','game_id','user_id','cursor'].includes(k)))throw Error('Filter required');const rows=(await admin.query(`SELECT * FROM public.${q.table} WHERE ${keys.map((k,i)=>`${k}=$${i+1}`).join(' AND ')}`,Object.values(q.filters))).rows;value={data:q.single?rows[0]??null:rows,error:null};}
 }else throw Error('Unknown local operation');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));
 }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}
 });}};
const server=await createServer({configFile:false,plugins:[react(),plugin],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/ptown-words/local-client.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:5197,strictPort:true}});
await server.listen();console.log('Ptown Words local SQL preview on http://127.0.0.1:5197/dev/ptown-words/live.html');
async function shutdown(){for(const s of streams)s.res.end();await server.close();await admin.end();process.exit();}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
