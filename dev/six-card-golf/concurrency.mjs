import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID as uuid} from 'node:crypto';
import assert from 'node:assert/strict';
import {candidate,connect,localContext,installLocalReference} from './database.mjs';
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
  await installLocalReference(admin);
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
 // A closed, card-conserving hole fixture isolates successor contention.
 const priorRound=(await snapshot()).identity.roundId;
 await admin.query("UPDATE private.golf_matches SET state=state||jsonb_build_object('phase','hole_complete','deadline',0,'holes',jsonb_build_array(jsonb_build_object('hole',1))),revision=revision+1 WHERE dealer_game_id=$1",[dealer]);
 for(const c of [a,b])await c.query('RESET ROLE');
 await Promise.all([a,b].map(c=>q(c,'SELECT private.golf_recover() v')));
 const successor=await snapshot();
 assert.notEqual(successor.identity.roundId,priorRound);assert.equal(successor.hole,2);
 assert.equal(await q(admin,'SELECT count(*)::int v FROM public.rounds WHERE predecessor_round_id=$1',[priorRound]),1);
 assert.deepEqual((await act(a,request,v,'draw')).receipt,draw[0].receipt);
 await assert.rejects(act(a,uuid(),v,'draw'),/stale_identity|stale_revision|round/);
 // Expired opening action competes with the actual recovery owner.
 await admin.query("UPDATE public.games SET timeout_enforcement_enabled=true,timeout_action='auto_fold' WHERE id=$1",[game]);
 await admin.query("UPDATE private.golf_matches SET state=jsonb_set(state,'{deadline}','0'),revision=revision+1 WHERE dealer_game_id=$1",[dealer]);
 const expired=await snapshot(),expiredActor=expired.players[expired.turnIndex];
 await login(a,expiredActor.userId);await a.query('SET ROLE authenticated');
 const timed=await Promise.allSettled([act(a,uuid(),expired,'open',[1,4]),q(b,'SELECT private.golf_recover() v')]);
 assert.equal(timed[0].status,'rejected');assert.match(timed[0].reason.message,/deadline|inactive|stale_revision/);assert.equal(timed[1].status,'fulfilled');
 // SKIP LOCKED may yield to the rejected action; the next worker wake must
 // recover the same unresolved turn, without counting the rejection as play.
 await q(b,'SELECT private.golf_recover() v');
 const recovered=await snapshot();
 if(real){assert.equal(recovered.paused,true);assert.deepEqual(recovered.tableaus,expired.tableaus);await login(admin,users[0]);await admin.query('UPDATE public.games SET current_host=$2 WHERE id=$1',[game,users[0]]);await q(admin,'SELECT public.set_game_paused($1,false,$2,(SELECT pause_version FROM public.games WHERE id=$1)) v',[game,dealer]);assert.equal((await snapshot()).paused,false);}
 else{assert.equal(recovered.paused,false);assert.equal(recovered.openingRemaining,expired.openingRemaining-1);}
 await admin.query('UPDATE public.players SET auto_fold=false,sit_out_next_hand=false WHERE game_id=$1',[game]);
 // Card-conserving final-turn fixture: two authenticated commands compete
 // for the final legal action; only its winner can score and settle.
 await admin.query("UPDATE private.golf_matches SET state=state||jsonb_build_object('phase','playing','hole',9,'deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+30000,'openingRemaining',0,'pending',NULL,'finalReason','six_exposed','finalQueue',jsonb_build_array(state->'players'->(state->>'turnIndex')::integer->>'id'),'scores',jsonb_build_object($2::text,-1000,$3::text,1000),'holes',(SELECT jsonb_agg(jsonb_build_object('hole',h)) FROM generate_series(1,8)h)),revision=revision+1 WHERE dealer_game_id=$1",[dealer,players[0],players[1]]);
 const final=await snapshot(),finalActor=final.players[final.turnIndex];
 for(const c of [a,b]){await login(c,finalActor.userId);await c.query('SET ROLE authenticated');}
 const finalRace=await Promise.allSettled([a,b].map(c=>act(c,uuid(),final,'discard',[0])));
 assert.equal(finalRace.filter(x=>x.status==='fulfilled').length,1,JSON.stringify(finalRace.map(x=>x.status==='rejected'?x.reason.message:'accepted')));
 assert.match(finalRace.find(x=>x.status==='rejected').reason.message,/inactive|stale_revision/);
 for(const c of [a,b])await c.query('RESET ROLE');
 await Promise.all([a,b].map(c=>q(c,'SELECT private.golf_settle($1) v',[dealer])));
 assert.equal(await q(admin,'SELECT count(*)::int v FROM public.game_results WHERE dealer_game_id=$1',[dealer]),1);
 assert.equal(await q(admin,'SELECT count(*)::int v FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[dealer]),1);
 assert.deepEqual((await admin.query('SELECT chips FROM public.players WHERE game_id=$1 ORDER BY chips',[game])).rows.map(r=>r.chips),[91,109]);
 await login(a,users[1]);assert.deepEqual((await act(a,request,v,'draw')).receipt,draw[0].receipt);
 // No browser callback is needed to finish an already-settled terminal hold.
 await new Promise(resolve=>setTimeout(resolve,3100));
 await Promise.all([a,b].map(c=>q(c,'SELECT private.golf_recover() v')));
 assert.equal(await q(admin,'SELECT finished v FROM private.golf_matches WHERE dealer_game_id=$1',[dealer]),true);
 assert.equal(await q(admin,'SELECT current_game_uuid IS NULL v FROM public.games WHERE id=$1',[game]),true);
 assert.deepEqual((await act(a,request,v,'draw')).receipt,draw[0].receipt);
 await assert.rejects(act(a,uuid(),await snapshot(),'draw'),/inactive/);
 assert.deepEqual((await admin.query('SELECT chips FROM public.players WHERE game_id=$1 ORDER BY chips',[game])).rows.map(r=>r.chips),[91,109]);
 write(`qualification.local/six-card-golf/concurrency${real?'-real':''}.json`,JSON.stringify({passed:true,at:new Date().toISOString(),database:db,game,dealer,balances:[91,109]}));
 console.log('PASS authenticated independent-connection duplicate opening/draw, lost response, competing replacements, actor rejection, successor race, timeout/action race, final-action race, concurrent settlement, zero-client terminal continuation, old receipt after continuation; money='+real);
} finally {await Promise.all([a.end(),b.end(),admin.end()]);}
