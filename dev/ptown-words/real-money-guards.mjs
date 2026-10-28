// Disposable local database only; never connect this harness to production.
import {connect,context,path} from './real-money-local.mjs';
import {writeFileSync} from 'node:fs';
import {randomUUID as uuid} from 'node:crypto';
import assert from 'node:assert/strict';
const {database}=context();assert.match(database,/^ptown_words_real_\d+$/);
const db=await connect(database),a=await connect(database),b=await connect(database),checks=[];
async function rpc(c,user,name,args){
 await c.query('SAVEPOINT actor_call');
 try{await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[user,JSON.stringify({sub:user,role:'authenticated'})]);await c.query('SET LOCAL ROLE authenticated');
  const v=(await c.query(`SELECT public.${name}(${Object.keys(args).map((k,i)=>k+' => $'+(i+1)).join(',')}) v`,Object.values(args).map(v=>v&&typeof v==='object'?JSON.stringify(v):v))).rows[0].v;
  await c.query('RESET ROLE');await c.query('RELEASE SAVEPOINT actor_call');return v;
 }catch(e){await c.query('ROLLBACK TO SAVEPOINT actor_call');await c.query('RELEASE SAVEPOINT actor_call');throw e;}
}
async function fresh(c,real=true,bot=false){
 const f={game:uuid(),users:[uuid(),uuid()],players:[uuid(),uuid()]};
 for(const id of f.users){await c.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[id,'Local Words '+id]);}
 await c.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,ante_decision_timer_seconds,pot,is_paused,pending_session_end,current_host) VALUES($1,'game_selection',$2,2,clock_timestamp()+interval '10 minutes',120,0,false,false,$3)",[f.game,real,f.users[0]]);
 for(let i=0;i<2;i++)await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,auto_ante,auto_ante_runback) VALUES($1,$2,$3,$4,0,$5,false,true)',[f.players[i],f.game,f.users[i],2+i*2,bot&&i===1]);
 f.deadline=(await rpc(c,f.users[0],'read_session_frame',{p_game_id:f.game})).game.config_deadline;return f;
}
const configure=(c,f,ante=5)=>rpc(c,f.users[0],'ptown_words_configure',{p_game_id:f.game,p_dealer_player_id:f.players[0],p_expected_dealer_position:2,p_game_type:'ptown-words',p_config:{ante_amount:ante},p_expected_config_deadline:f.deadline});
const cap=(c,f,who=0)=>rpc(c,f.users[who],'ptown_words_capabilities',{p_session_id:f.game});
const snapshot=(c,f,who=0)=>rpc(c,f.users[who],'ptown_words_snapshot',{p_dealer_game_id:f.dealer});
const healthy=c=>c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
async function start(c,f){f.dealer=(await configure(c,f)).dealer_game.id;await rpc(c,f.users[1],'submit_ante_decision',{p_game_id:f.game,p_expected_dealer_game_id:f.dealer,p_player_id:f.players[1],p_decision:'ante_up'});await rpc(c,f.users[0],'advance_ante_phase',{p_game_id:f.game,p_expected_dealer_game_id:f.dealer});return f;}
async function ending(c,f,expired=false){
 await c.query("UPDATE public.games SET pending_session_end=true WHERE id=$1",[f.game]);
 await c.query("UPDATE private.ptown_words_matches SET state=state||jsonb_build_object('passes',3,'scores',$2::jsonb,'racks',$3::jsonb,'deadline',$4::bigint) WHERE dealer_game_id=$1",[f.dealer,JSON.stringify({[f.players[0]]:10,[f.players[1]]:0}),JSON.stringify({[f.players[0]]:[],[f.players[1]]:[]}),Date.now()+(expired?-1000:120000)]);
 const state=(await c.query('SELECT state,revision FROM private.ptown_words_matches WHERE dealer_game_id=$1',[f.dealer])).rows[0];
 return {user:state.state.players[state.state.turnIndex].userId,args:{p_dealer_game_id:f.dealer,p_request_id:uuid(),p_revision:state.revision,p_action:'pass'}};
}
async function exact(c,f){
 await c.query('SET CONSTRAINTS ALL IMMEDIATE');
 const n=async(sql)=>(await c.query(sql,[f.dealer])).rows[0].n;
 assert.equal(await n('SELECT count(*)::int n FROM public.game_results WHERE dealer_game_id=$1'),1);
 assert.equal(await n("SELECT count(*)::int n FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1 AND unmatched_deltas='{}'"),1);
 assert.equal(await n('SELECT count(*)::int n FROM public.session_player_snapshots WHERE dealer_game_id=$1'),2);
 const chips=(await c.query('SELECT id,chips FROM public.players WHERE game_id=$1',[f.game])).rows;
 assert.equal(chips.find(p=>p.id===f.players[0]).chips,5);assert.equal(chips.find(p=>p.id===f.players[1]).chips,-5);
 const tx=(await c.query("SELECT count(*)::int n,sum(amount)::int total FROM public.player_transactions WHERE source_game_id=$1 AND transaction_type='SessionResult'",[f.game])).rows[0];assert.deepEqual(tx,{n:2,total:0});
 assert.equal((await c.query('SELECT status FROM public.games WHERE id=$1',[f.game])).rows[0].status,'session_ended');
}
try{
 await db.query('BEGIN');await healthy(db);
 const real=await fresh(db),fake=await fresh(db,false);
 assert.equal((await cap(db,real)).enabled,false);assert.equal((await cap(db,fake)).enabled,true);
 await assert.rejects(configure(db,real),/real_money_closed/);await start(db,fake);
 await db.query('UPDATE private.ptown_words_release SET real_qualified=true');
 assert.deepEqual(Object.fromEntries(Object.entries(await cap(db,real)).filter(([k])=>['enabled','version','fake_money_only'].includes(k))),{version:4,enabled:true,fake_money_only:false});
 await assert.rejects(configure(db,real,0),/ptown_words:config/);
 const bot=await fresh(db,true,true);await assert.rejects(configure(db,bot),/bot/);
 await db.query('UPDATE public.profiles SET is_active=false WHERE id=$1',[real.users[1]]);assert.equal((await cap(db,real)).enabled,false);await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[real.users[1]]);
 await assert.rejects(rpc(db,real.users[0],'delayed_create',{p_request:uuid(),p_opponent:real.users[1],p_real_money:true,p_lineup:[{game:'ptown-words',stake:5}]}),/delayed:invalid_offer/);
 real.dealer=(await configure(db,real)).dealer_game.id;
 await db.query('SAVEPOINT changed_stake');await db.query('UPDATE public.games SET ante_amount=6 WHERE id=$1',[real.game]);await assert.rejects(db.query('SELECT private.megatouch_begin($1,$2)',[real.game,real.dealer]),/stake_changed/);await db.query('ROLLBACK TO SAVEPOINT changed_stake');
 await db.query('SAVEPOINT closed_start');await db.query('UPDATE private.ptown_words_release SET real_qualified=false');await assert.rejects(db.query('SELECT private.megatouch_begin($1,$2)',[real.game,real.dealer]),/real_money_closed/);await db.query('ROLLBACK TO SAVEPOINT closed_start');
 await db.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp()-interval '1 minute'");assert.equal((await db.query('SELECT private.evaluate_real_money_liveness($1) v',[real.game])).rows[0].v.reason,'scheduler_heartbeat_stale');
 await healthy(db);await rpc(db,real.users[1],'submit_ante_decision',{p_game_id:real.game,p_expected_dealer_game_id:real.dealer,p_player_id:real.players[1],p_decision:'ante_up'});await rpc(db,real.users[0],'advance_ante_phase',{p_game_id:real.game,p_expected_dealer_game_id:real.dealer});
 await assert.rejects(rpc(db,uuid(),'ptown_words_snapshot',{p_dealer_game_id:real.dealer}),/membership_required/);
 await ending(db,real,true);await db.query("SELECT set_config('request.jwt.claim.sub','',true)");await db.query('SELECT private.ptown_words_recover($1)',[real.dealer]);await db.query('SELECT private.ptown_words_recover($1)',[real.dealer]);await exact(db,real);
 await db.query('ROLLBACK');assert.equal((await db.query('SELECT count(*)::int n FROM public.games WHERE id=$1',[real.game])).rows[0].n,0);
 checks.push('Closed real configure/start with fake admission preserved; active members only; real bots and async real offers rejected; immutable stakes; stale scheduler recognized','Real zero-client timeout completes and posts exactly once; fixture and account rows rolled back');
 // Independent connections require committed synthetic fixtures, confined to this disposable clone.
 await a.query('BEGIN');await healthy(a);await a.query('UPDATE private.ptown_words_release SET real_qualified=true');const f=await start(a,await fresh(a)),command=await ending(a,f);await a.query('COMMIT');
 await a.query('BEGIN');const first=await rpc(a,command.user,'ptown_words_action',command.args);await b.query('BEGIN');const pid=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 const duplicate=rpc(b,command.user,'ptown_words_action',command.args);let blocked=false;
 for(let i=0;i<50;i++){if((await db.query("SELECT wait_event_type='Lock' waiting FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.waiting){blocked=true;break;}await new Promise(r=>setTimeout(r,20));}
 assert.equal(blocked,true);await a.query('COMMIT');assert.deepEqual(await duplicate,first);await b.query('COMMIT');await exact(db,f);
 await db.query('BEGIN');await db.query('SELECT private.ptown_words_recover($1)',[f.dealer]);await db.query('SELECT private.ptown_words_settle($1)',[f.dealer]);await exact(db,f);await db.query('ROLLBACK');
 checks.push('Genuine independent-connection final-command lock race: identical retry receipt, one result, balanced batch, two snapshots and two net-zero account postings; late settlement/recovery no-op');
 writeFileSync(path+'/guards.json',JSON.stringify({passed:true,localOnly:true,database,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}catch(e){console.error(e.stack,e.where);process.exitCode=1;}finally{for(const c of [a,b]){await c.query('ROLLBACK');await c.end();}await db.query('ROLLBACK');await db.query('UPDATE private.ptown_words_release SET real_qualified=false');await db.end();}
