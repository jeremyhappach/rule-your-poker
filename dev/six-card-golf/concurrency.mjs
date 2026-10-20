import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID as uuid} from 'node:crypto';
import assert from 'node:assert/strict';
import {candidate,connect,localContext} from './database.mjs';
const real=process.argv.includes('--real'),db='golf_race_'+Date.now();
const provision=await connect('postgres');
await provision.query('CREATE DATABASE '+db+' TEMPLATE '+localContext().database);
await provision.end();
const admin=await connect(db),a=await connect(db),b=await connect(db);
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows[0]?.v;
const users=[uuid(),uuid()],players=[uuid(),uuid()],game=uuid(),offer=new Date(Date.now()+600000).toISOString();
try {
 if(!await q(admin,"SELECT to_regclass('private.golf_matches') v")) {
  await admin.query('BEGIN');
  await admin.query(read('supabase/six-card-golf/local-reference.sql','utf8'));
  await admin.query(candidate());
  await admin.query('COMMIT');
 }
 await admin.query("UPDATE private.golf_release SET enabled=true,admission_enabled=true;UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 for(let i=0;i<2;i++) {
  await admin.query('INSERT INTO auth.users(id) VALUES($1)',[users[i]]);
  await admin.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[users[i],'Golf concurrency '+users[i]]);
 }
 await admin.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',$3,2,$2,0,false,false)",[game,offer,real]);
 for(let i=0;i<2;i++)await admin.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[players[i],game,users[i],2-i]);
 await q(admin,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[users[0]]);
 const setup=await q(admin,"SELECT public.golf_configure($1,$2,2,'six-card-golf','{\"ante_amount\":9}',$3) v",[game,players[0],offer]),dealer=setup.dealer_game.id;
 await q(admin,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[users[1]]);
 await q(admin,"SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v",[game,dealer,players[1]]);
 const login=async(c,user)=>{await q(c,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[user]);await q(c,"SELECT set_config('request.jwt.claims',$1,false) v",[JSON.stringify({sub:user,role:'authenticated'})]);};
 for(const c of [a,b]){await login(c,users[1]);await c.query('SET ROLE authenticated');}
 const snapshot=()=>q(a,'SELECT public.golf_snapshot($1) v',[dealer]);
 const act=(c,id,v,action,items=null)=>q(c,'SELECT public.golf_action($1,$2,$3,$4,$5,$6) v',[dealer,v.identity.roundId,id,v.revision,action,items]);
 let v=await snapshot(),request=uuid();
 const dup=await Promise.all([a,b].map(c=>act(c,request,v,'open',[0,3])));
 assert.equal(dup[0].revision,v.revision+1);assert.deepEqual(dup[0].receipt,dup[1].receipt);
 await assert.rejects(act(a,request,v,'open',[1,4]),/replay_conflict/);
 await login(a,users[0]);v=await snapshot();await act(a,uuid(),v,'open',[0,3]);
 for(const c of [a,b])await login(c,users[1]);
 v=await snapshot();request=uuid();
 const draw=await Promise.all([a,b].map(c=>act(c,request,v,'draw')));
 assert.equal(draw[0].revision,v.revision+1);assert.deepEqual(draw[0].pending,draw[1].pending);
 // A lost draw response retries its original UUID: exactly one pending card.
 assert.deepEqual((await act(a,request,v,'draw')).pending,draw[0].pending);
 const race=await Promise.allSettled([a,b].map(c=>act(c,uuid(),draw[0],'replace',[1])));
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 assert.match(race.find(r=>r.status==='rejected').reason.message,/stale_revision/);
 await assert.rejects(act(a,uuid(),await snapshot(),'draw'),/not_actor/);
 // Closed terminal fixture isolates concurrent canonical settlement.
 await admin.query("UPDATE private.golf_matches SET state=state||jsonb_build_object('phase','complete','hole',9,'scores',jsonb_build_object($2::text,-1,$3::text,10),'holes',(SELECT jsonb_agg(jsonb_build_object('hole',h)) FROM generate_series(1,9)h)),revision=revision+1 WHERE dealer_game_id=$1",[dealer,players[0],players[1]]);
 for(const c of [a,b])await c.query('RESET ROLE');
 await Promise.all([a,b].map(c=>q(c,'SELECT private.golf_settle($1) v',[dealer])));
 assert.equal(await q(admin,'SELECT count(*)::int v FROM public.game_results WHERE dealer_game_id=$1',[dealer]),1);
 assert.equal(await q(admin,'SELECT count(*)::int v FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[dealer]),1);
 assert.deepEqual((await admin.query('SELECT chips FROM public.players WHERE game_id=$1 ORDER BY chips',[game])).rows.map(r=>r.chips),[91,109]);
 assert.deepEqual((await act(a,request,v,'draw')).receipt,draw[0].receipt);
 write(`qualification.local/six-card-golf/concurrency${real?'-real':''}.json`,JSON.stringify({passed:true,at:new Date().toISOString(),database:db,game,dealer,balances:[91,109]}));
 console.log('PASS authenticated independent-connection duplicate opening/draw, lost response, competing replacements, actor rejection, concurrent settlement, late replay; money='+real);
} finally {await Promise.all([a.end(),b.end(),admin.end()]);}
