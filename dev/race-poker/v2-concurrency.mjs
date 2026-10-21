import {connect,localContext} from './database.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID as uuid} from 'node:crypto';
import assert from 'node:assert/strict';
const source=localContext().database,database='race_poker_v2_races_'+Date.now(),root=await connect('postgres');
let a,b,admin;
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows[0]?.v;
try{
 if(!/^race_poker_[0-9]+$/.test(source))throw Error('Expected isolated Race test database');
 await root.query('CREATE DATABASE '+database+' TEMPLATE '+source);
 admin=await connect(database);for(const f of ['canonical-control-dependencies','canonical-controls'])await admin.query(readFileSync('dev/race-poker/'+f+'.fixture.sql','utf8'));
 await admin.query(readFileSync('supabase/race-poker/v2.sql','utf8'));
 process.env.RACE_POKER_TEST_DATABASE=database;
 // Reuse the established independent-connection financial suite on v2.
 await import('./concurrency.mjs');
 a=await connect(database);b=await connect(database);
 await admin.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 const u=[uuid(),uuid()],p=[uuid(),uuid()],g=uuid(),offer=new Date(Date.now()+600000).toISOString();
 for(let i=0;i<2;i++){await admin.query('INSERT INTO auth.users(id) VALUES($1)',[u[i]]);await admin.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[u[i],'Race v2 race '+u[i]]);}
 await admin.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host) VALUES($1,'game_selection',false,2,$2,0,false,false,$3)",[g,offer,u[0]]);
 for(let i=0;i<2;i++)await admin.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[p[i],g,u[i],2-i]);
 await q(admin,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[u[0]]);
 const config=await q(admin,"SELECT public.race_poker_configure($1,$2,2,'race-poker','{\"ante_amount\":5}',$3) v",[g,p[0],offer]),d=config.dealer_game.id;
 await q(admin,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[u[1]]);await q(admin,"SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v",[g,d,p[1]]);await q(admin,'SELECT public.advance_ante_phase($1,$2) v',[g,d]);
 const get=()=>q(admin,'SELECT to_jsonb(m) v FROM private.race_poker_matches m WHERE dealer_game_id=$1',[d]);
 let m=await get();const actor=m.state.players[m.state.turnIndex];
 for(const c of [a,b]){await q(c,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[actor.userId]);await c.query('SET ROLE authenticated');}
 const control=(c,id,rev,on)=>q(c,"SELECT public.race_poker_action($1,$2,$3,'autoplay',$4) v",[d,id,rev,[on?1:0]]);
 const request=uuid(),receipts=await Promise.all([a,b].map(c=>control(c,request,m.revision,true)));assert.deepEqual(receipts[0],receipts[1]);
 m=await get();assert.equal(await q(admin,'SELECT auto_fold v FROM public.players WHERE id=$1',[actor.id]),true);
 // Reclaim races a due bot choice. Either lock order must be legal and recoverable.
 await admin.query('UPDATE private.race_poker_matches SET bot_due_at=0 WHERE dealer_game_id=$1',[d]);
 await b.query('RESET ROLE');
 const race=await Promise.allSettled([control(a,uuid(),m.revision,false),q(b,'SELECT private.race_poker_recover() v')]);assert.equal(race[1].status,'fulfilled');
 if(race[0].status==='rejected'){assert.match(race[0].reason.message,/stale_revision/);m=await get();await control(a,uuid(),m.revision,false);}
 m=await get();assert.ok(m.state.hand.length<=1);assert.equal(m.bot_due_at,null);
 assert.equal(await q(admin,'SELECT auto_fold OR sit_out_next_hand v FROM public.players WHERE id=$1',[actor.id]),false);
 const hand=m.state.hand;await q(b,'SELECT private.race_poker_recover() v');assert.deepEqual((await get()).state.hand,hand);
 // Opposing control changes with one revision cannot both commit.
 await b.query('SET ROLE authenticated');m=await get();
 const opposing=await Promise.allSettled([control(a,uuid(),m.revision,true),control(b,uuid(),m.revision,true)]);
 assert.equal(opposing.filter(r=>r.status==='fulfilled').length,1);assert.match(opposing.find(r=>r.status==='rejected').reason.message,/stale_revision/);
 writeFileSync('qualification.local/race-poker/v2-concurrency.json',JSON.stringify({passed:true,at:new Date().toISOString(),database}));
 console.log('PASS v2 duplicate control, control/recovery race, reclaim after stale revision, canceled bot work, and competing controls');
}finally{
 delete process.env.RACE_POKER_TEST_DATABASE;
 await Promise.all([a,b,admin].filter(Boolean).map(c=>c.end()));
 await root.query('DROP DATABASE IF EXISTS '+database);await root.end();
}
