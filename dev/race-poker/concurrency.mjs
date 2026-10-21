import {connect,localContext,candidate} from './database.mjs';
import {randomUUID as uuid} from 'node:crypto';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const db=localContext().database,a=await connect(db),b=await connect(db),admin=await connect(db);
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows[0]?.v;
try{
 if(!(await admin.query("SELECT to_regclass('private.race_poker_matches') present")).rows[0].present)await admin.query(candidate());
 await admin.query("UPDATE private.race_poker_release SET enabled=true,admission_enabled=true,fake_qualified=true,real_qualified=true");
 for(const real of [false,true]){
 const u=[uuid(),uuid()],p=[uuid(),uuid()],g=uuid(),offer=new Date(Date.now()+600000).toISOString();
 await admin.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 for(let i=0;i<2;i++){await admin.query('INSERT INTO auth.users(id) VALUES($1)',[u[i]]);await admin.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[u[i],'Race Poker proof '+u[i]]);}
 await admin.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',$3,2,$2,0,false,false)",[g,offer,real]);
 for(let i=0;i<2;i++)await admin.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[p[i],g,u[i],2-i]);
 await q(admin,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[u[0]]);
 const config=await q(admin,"SELECT public.race_poker_configure($1,$2,2,'race-poker','{\"ante_amount\":9}',$3) v",[g,p[0],offer]),d=config.dealer_game.id;
 await q(admin,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[u[1]]);await q(admin,"SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v",[g,d,p[1]]);await q(admin,'SELECT public.advance_ante_phase($1,$2) v',[g,d]);
 const state=await q(admin,'SELECT state v FROM private.race_poker_matches WHERE dealer_game_id=$1',[d]),actor=state.players[state.turnIndex];
 for(const c of [a,b]){await q(c,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[actor.userId]);await c.query('SET ROLE authenticated');}
 const initial=Number(await q(admin,'SELECT revision v FROM private.race_poker_matches WHERE dealer_game_id=$1',[d])),req=uuid();
 const move=(c,id,rev,slot=0)=>q(c,"SELECT public.race_poker_action($1,$2,$3,'choose',$4) v",[d,id,rev,[slot]]);
 const dup=await Promise.all([a,b].map(c=>move(c,req,initial)));assert.deepEqual(dup[0],dup[1]);assert.equal(dup[0].revision,initial+1);assert.equal(dup[0].frame.hand.length,1);
 const race=await Promise.allSettled([a,b].map(c=>move(c,uuid(),initial+1)));assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.match(race.find(r=>r.status==='rejected').reason.message,/stale_revision/);
 await assert.rejects(move(a,req,initial,1),/replay_conflict/);
 await q(b,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[uuid()]);await assert.rejects(move(b,uuid(),initial+2),/participant_required/);
 // At/after expiry a racing click cannot beat recovery; original receipt remains retrievable.
 await admin.query("UPDATE private.race_poker_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1)) WHERE dealer_game_id=$1",[d]);
 await b.query('RESET ROLE');
 const timeout=await Promise.allSettled([move(a,uuid(),initial+2),q(b,'SELECT private.race_poker_recover() v')]);assert.equal(timeout[0].status,'rejected');assert.match(timeout[0].reason.message,/deadline|stale_revision|inactive/);assert.equal(timeout[1].status,'fulfilled');
 assert.deepEqual(await move(a,req,initial),dup[0]);await a.query('RESET ROLE');
 // Inject failure only after canonical chip writes, then prove the entire transaction rolled back.
 await admin.query('BEGIN');await admin.query("UPDATE private.race_poker_matches SET state=state||jsonb_build_object('phase','complete','scores',jsonb_build_object($2::text,100,$3::text,0)) WHERE dealer_game_id=$1",[d,p[0],p[1]]);
 await admin.query("CREATE FUNCTION pg_temp.race_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=NEW.game_id AND chips<>100) THEN RAISE EXCEPTION 'injection_before_chip_writes';END IF;RAISE EXCEPTION 'injected_after_chips';END $$; CREATE TRIGGER race_failure BEFORE INSERT ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION pg_temp.race_fail(); SAVEPOINT before_failure");
 await assert.rejects(q(admin,'SELECT private.race_poker_settle($1) v',[d]),/injected_after_chips/);await admin.query('ROLLBACK TO SAVEPOINT before_failure');
 assert.deepEqual((await admin.query('SELECT chips FROM public.players WHERE game_id=$1 ORDER BY id',[g])).rows.map(r=>r.chips),[100,100]);
 for(const table of ['game_results','gameplay_transfer_batches','session_player_snapshots'])assert.equal((await admin.query(`SELECT count(*) n FROM public.${table} WHERE dealer_game_id=$1`,[d])).rows[0].n,'0');
 assert.equal(await q(admin,'SELECT settlement v FROM private.race_poker_matches WHERE dealer_game_id=$1',[d]),null);
 await admin.query('ROLLBACK');
 await admin.query("UPDATE private.race_poker_matches SET state=state||jsonb_build_object('phase','complete','scores',jsonb_build_object($2::text,100,$3::text,0)) WHERE dealer_game_id=$1",[d,p[0],p[1]]);
 await Promise.all([a,b].map(c=>q(c,'SELECT private.race_poker_settle($1) v',[d])));
 assert.equal((await admin.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[d])).rows[0].n,'1');assert.equal((await admin.query('SELECT count(*) n FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[d])).rows[0].n,'1');assert.deepEqual((await admin.query('SELECT chips FROM public.players WHERE game_id=$1 ORDER BY chips',[g])).rows.map(r=>r.chips),[91,109]);
 console.log('PASS '+(real?'real':'fake')+' concurrent duplicate/stale/timeout/settlement; original receipt; authenticated rejection; after-chip rollback');
 }
 writeFileSync('qualification.local/race-poker/concurrency.json',JSON.stringify({passed:true,at:new Date().toISOString(),moneyModes:['fake','real']}));
}finally{await Promise.all([a.end(),b.end(),admin.end()]);}
