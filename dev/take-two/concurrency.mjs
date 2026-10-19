import {connect,localContext} from './database.mjs';import {randomUUID as uuid} from 'node:crypto';import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
const db=localContext().database,a=await connect(db),b=await connect(db),admin=await connect(db),u=[uuid(),uuid()],p=[uuid(),uuid()],g=uuid(),offer=new Date(Date.now()+600000).toISOString();
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows[0]?.v;
try{
 await admin.query('UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL');
 for(let i=0;i<2;i++){await admin.query('INSERT INTO auth.users(id) VALUES($1)',[u[i]]);await admin.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[u[i],'Take 2 concurrent '+u[i]]);}
 await admin.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',false,2,$2,0,false,false)",[g,offer]);
 for(let i=0;i<2;i++)await admin.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[p[i],g,u[i],2-i]);
 await q(admin,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[u[0]]);
 const config=await q(admin,"SELECT public.take_two_configure($1,$2,2,'take-two','{\"ante_amount\":9}',$3) v",[g,p[0],offer]),d=config.dealer_game.id;
 await q(admin,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[u[1]]);await q(admin,"SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v",[g,d,p[1]]);await q(admin,'SELECT public.advance_ante_phase($1,$2) v',[g,d]);
 await admin.query("UPDATE private.take_two_matches SET state=state||jsonb_build_object('phase','playing','deadline',floor(extract(epoch FROM clock_timestamp())*1000)+100000,'score',1000) WHERE dealer_game_id=$1",[d]);
 for(const c of [a,b]){await q(c,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[u[1]]);await c.query('SET ROLE authenticated');}
 let snapshot=await q(a,'SELECT public.take_two_snapshot($1) v',[d]);const initial=snapshot.revision,req=uuid();
 const dup=await Promise.all([a,b].map(c=>q(c,"SELECT public.take_two_action($1,$2,$3,'draw') v",[d,req,initial])));
 assert.ok(dup.every(v=>v.score===900&&v.revision===initial+1));
 const race=await Promise.allSettled([a,b].map(c=>q(c,"SELECT public.take_two_action($1,$2,$3,'draw') v",[d,uuid(),initial+1])));assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.match(race.find(r=>r.status==='rejected').reason.message,/stale_revision/);
 await assert.rejects(q(a,"SELECT public.take_two_action($1,$2,$3,'take_score') v",[d,req,initial]),/replay_conflict/);
 await admin.query("UPDATE private.take_two_matches SET state=state||jsonb_build_object('slots',(SELECT jsonb_agg(CASE WHEN i=26 THEN 0 WHEN i=27 THEN 13 ELSE NULL END ORDER BY i) FROM generate_series(0,27)i)) WHERE dealer_game_id=$1",[d]);
 snapshot=await q(a,'SELECT public.take_two_snapshot($1) v',[d]);const finalRequest=uuid();
 const full=await Promise.all([a,b].map(c=>q(c,"SELECT public.take_two_action($1,$2,$3,'pair',ARRAY[26,27]) v",[d,finalRequest,snapshot.revision])));
 assert.ok(full.every(v=>v.phase==='stage_complete'&&v.stages.length===1&&v.stages[0].reason==='full_clear'));assert.equal(full[0].score,full[1].score);
 await admin.query('BEGIN');await admin.query("UPDATE private.take_two_matches SET state=state||jsonb_build_object('phase','complete','scores',jsonb_build_object($2::text,100,$3::text,0),'turnIndex',2) WHERE dealer_game_id=$1",[d,p[0],p[1]]);
 await admin.query("CREATE FUNCTION pg_temp.take_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=NEW.game_id AND chips<>100) THEN RAISE EXCEPTION 'injection_before_chip_writes';END IF;RAISE EXCEPTION 'injected_after_chips';END $$; CREATE TRIGGER take_failure BEFORE INSERT ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION pg_temp.take_fail(); SAVEPOINT before_failure");
 await assert.rejects(q(admin,'SELECT private.take_two_settle($1) v',[d]),/injected_after_chips/);await admin.query('ROLLBACK TO SAVEPOINT before_failure');
 assert.deepEqual((await admin.query('SELECT chips FROM public.players WHERE game_id=$1 ORDER BY id',[g])).rows.map(r=>r.chips),[100,100]);assert.equal((await admin.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[d])).rows[0].n,'0');
 await admin.query('DROP TRIGGER take_failure ON public.session_player_snapshots');await admin.query('COMMIT');
 for(const c of [a,b])await c.query('RESET ROLE');await Promise.all([a,b].map(c=>q(c,'SELECT private.take_two_settle($1) v',[d])));
 assert.equal((await admin.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[d])).rows[0].n,'1');assert.equal((await admin.query('SELECT count(*) n FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[d])).rows[0].n,'1');assert.deepEqual((await admin.query('SELECT chips FROM public.players WHERE game_id=$1 ORDER BY chips',[g])).rows.map(r=>r.chips),[91,109]);
 const run=await q(admin,"SELECT public.arcade_start($1,$2,'take-two') v",[u[0],uuid()]);await q(admin,'SELECT public.arcade_take_two_step($1,$2) v',[u[0],run.id]);
 await admin.query("UPDATE private.arcade_runs SET state=jsonb_set(state,'{board}',state->'board'||jsonb_build_object('phase','playing','deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+100000)) WHERE id=$1",[run.id]);
 const current=await q(admin,'SELECT public.arcade_take_two_step($1,$2) v',[u[0],run.id]),request=uuid();
 const solo=await Promise.all([a,b].map(c=>q(c,"SELECT public.arcade_take_two_step($1,$2,$3,$4,$5,'draw') v",[u[0],run.id,current.projection.revision,current.projection.view.roundId,request])));assert.deepEqual(solo.map(r=>r.outcome).sort(),['committed','duplicate']);
 const rev=solo[0].projection.revision,scope=solo[0].projection.view.roundId;
 await admin.query("UPDATE private.arcade_runs SET state=jsonb_set(state,'{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1000000)) WHERE id=$1",[run.id]);
 const expired=await Promise.all([a,b].map(c=>q(c,"SELECT public.arcade_take_two_step($1,$2,$3,$4,$5,'draw') v",[u[0],run.id,rev,scope,uuid()])));
 assert.ok(expired.every(r=>r.record.status==='completed'&&r.record.state.results.length===3));assert.equal((await admin.query('SELECT count(*) n FROM private.arcade_results WHERE run_id=$1',[run.id])).rows[0].n,'1');
 writeFileSync('qualification.local/take-two/concurrency.json',JSON.stringify({passed:true,at:new Date().toISOString()}));console.log('Concurrent draws, final pairs, stale revisions, atomic after-chip failure, settlement and Arcade timeout passed');
}finally{await Promise.all([a.end(),b.end(),admin.end()]);}
