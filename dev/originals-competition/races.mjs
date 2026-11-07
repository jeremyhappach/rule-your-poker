// Synthetic committed fixtures live only in a disposable loopback database.
import {connect} from '../quintzee/database.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
const template=JSON.parse(read('qualification.local/originals/context.json')).database;
assert.match(template,/^originals_competition_\d+$/);
const database='originals_race_'+Date.now(),admin=await connect('postgres');
await admin.query('CREATE DATABASE '+database+' TEMPLATE '+template);
const db=await connect(database),peer=await connect(database),checks=[];
const server=await createServer({configFile:false,server:{hmr:false},appType:'custom'});
const {delayedOperation}=await server.ssrLoadModule('/server/delayed/service.ts');
const q=async(sql,args=[],c=db)=>(await c.query(sql,args)).rows[0]?.v;
const call=c=>async(name,args={})=>q('SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') v',Object.values(args).map(v=>v!==null&&typeof v==='object'?JSON.stringify(v):v),c);
const user=async(who,c=db)=>{await c.query('RESET ROLE');await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[who]);await c.query('SET ROLE authenticated');};
const service=c=>{let lane=Promise.resolve();return(name,args)=>{const task=lane.then(async()=>{await c.query('RESET ROLE');await c.query('SET ROLE service_role');return call(c)(name,args);});lane=task.catch(()=>{});return task;};};
try{
 await db.query("UPDATE private.arcade_rulesets SET enabled=false WHERE game IN('crib-lab','chucky-showdown');UPDATE private.arcade_rulesets SET enabled=true WHERE id IN('crib-lab/2','chucky-showdown/3')");
 for(const file of ['gameplay','async','live-foundation','live'])await db.query(read('supabase/originals-competition/'+file+'.sql','utf8'));
 await db.query('UPDATE private.originals_release SET live_enabled=true,async_enabled=true,live_real_qualified=true,async_real_qualified=true');
 await db.query('UPDATE private.delayed_release SET admission_enabled=true,real_qualified=true');
 await db.query('UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()');
 await db.query("SELECT set_config('request.jwt.claim.role','service_role',false)");
 await db.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 const users=[randomUUID(),randomUUID()];
 for(const id of users){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES($1,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true',[id]);await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[id]);}
 for(const real of [false,true])for(const game of ['crib-lab','chucky-showdown']){
  await db.query('RESET ROLE');const session=randomUUID(),players=[randomUUID(),randomUUID()],offer=new Date(Date.now()+600000).toISOString();
  await db.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',$2,2,$3,0,false,false)",[session,real,offer]);
  for(let i=0;i<2;i++)await db.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[players[i],session,users[i],2-i]);
  await user(users[0]);const setup=await call(db)('originals_configure',{p_game_id:session,p_dealer_player_id:players[0],p_expected_dealer_position:2,p_game_type:game,p_config:{ante_amount:7},p_expected_config_deadline:offer});const id=setup.dealer_game.id;
  await user(users[1]);await q("SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v",[session,id,players[1]]);
  let view=await call(db)('originals_live_snapshot',{p_match:id});await db.query('RESET ROLE');
  for(let ticks=0;(game==='chucky-showdown'?view.board.phase!=='fold_stay':!!view.board.transition)&&ticks<20;ticks++){
   await db.query("UPDATE private.originals_live_matches SET state=private.originals_shift(state,least(0,(extract(epoch from clock_timestamp())*1000)::bigint-(state->>'deadline')::bigint-1)) WHERE dealer_game_id=$1",[id]);
   await user(users[0]);view=await call(db)('originals_live_snapshot',{p_match:id});await db.query('RESET ROLE');
  }
  const acting=view.players.find(p=>p.id===view.actor).userId;
  await user(acting);await user(acting,peer);
  const move={p_match:id,p_request:randomUUID(),p_revision:view.revision,p_intent:game==='crib-lab'?{type:'select',items:[0,0]}:{type:'fold'}};
  const moves=await Promise.all([call(db)('originals_live_action',move),call(peer)('originals_live_action',move)]);
  assert.equal(moves[0].revision,moves[1].revision);await db.query('RESET ROLE');
  assert.equal(await q('SELECT count(*)::int v FROM private.originals_live_requests WHERE dealer_game_id=$1',[id]),1);
  await db.query('UPDATE private.originals_live_matches SET state=private.originals_shift(state,-3600000) WHERE dealer_game_id=$1',[id]);
  await user(users[0]);await user(users[1],peer);
  const replies=await Promise.all([call(db)('originals_live_snapshot',{p_match:id}),call(peer)('originals_live_snapshot',{p_match:id})]);
  assert.ok(replies.every(v=>v.settled));assert.deepEqual(replies[0].settlement,replies[1].settlement);
  await db.query('RESET ROLE');assert.equal(await q('SELECT count(*)::int v FROM public.game_results WHERE dealer_game_id=$1',[id]),1);assert.equal(await q('SELECT sum(chips)::int v FROM public.players WHERE game_id=$1',[session]),200);
  checks.push({mode:'live',game,real,concurrentEarnedFinal:true,oneResult:true,balanced:true});
  await user(users[0]);const match=await call(db)('delayed_create',{p_request:randomUUID(),p_opponent:users[1],p_real_money:real,p_lineup:[{game,stake:7}]});const home=await call(db)('delayed_home',{p_match:match});
  await user(users[1]);await call(db)('delayed_respond',{p_match:match,p_request:randomUUID(),p_offer_hash:home.offerHash,p_action:'accept'});await db.query('RESET ROLE');
  const child=(await db.query('SELECT * FROM private.delayed_children WHERE match_id=$1',[match])).rows[0];
  const command={op:'action',game,childId:child.id,requestId:randomUUID(),revision:Number(child.revision),segment:Number(child.segment),intent:{type:'start'}};
  const result=await Promise.all([delayedOperation(service(db),child.actor,command),delayedOperation(service(peer),child.actor,command)]);
  assert.equal(result[0].revision,result[1].revision);await db.query('RESET ROLE');assert.equal(await q('SELECT count(*)::int v FROM private.delayed_commands WHERE child_id=$1',[child.id]),1);
  checks.push({mode:'async',game,real,concurrentStart:true,oneReceipt:true});
 }
 write('qualification.local/originals/races.json',JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await db.end();await peer.end();await server.close();await admin.query('DROP DATABASE '+database);await admin.end();}
