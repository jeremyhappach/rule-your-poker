import {connect,localContext} from './database.mjs';import {randomUUID as uuid} from 'node:crypto';import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
const real=process.argv.includes('--real');
const db=localContext().database,a=await connect(db),b=await connect(db),admin=await connect(db),u=[uuid(),uuid()],p=[uuid(),uuid()],g=uuid(),offer=new Date(Date.now()+600000).toISOString();
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows[0]?.v;
try{
 const expected={settle_gameplay_chip_transfers:'de14ab5df0a703cfd8c1ed43aa5a819c',submit_ante_decision:'c633a318c7f2605104c92e03d3b3b09a'};
 for(const row of (await admin.query("SELECT proname,md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname IN ('settle_gameplay_chip_transfers','submit_ante_decision')")).rows)assert.equal(row.hash,expected[row.proname],'local authority must match deployed definitions');
 await admin.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'" );
 await admin.query('UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL');
 for(let i=0;i<2;i++){await admin.query('INSERT INTO auth.users(id) VALUES($1)',[u[i]]);await admin.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[u[i],'Trip Flip concurrent '+u[i]]);}
 await admin.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',$3,2,$2,0,false,false)",[g,offer,real]);
 for(let i=0;i<2;i++)await admin.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[p[i],g,u[i],2-i]);
 await q(admin,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[u[0]]);
 const config=await q(admin,"SELECT public.trip_flip_configure($1,$2,2,'trip-flip','{\"ante_amount\":9}',$3) v",[g,p[0],offer]),d=config.dealer_game.id;
 await q(admin,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[u[1]]);await q(admin,"SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v",[g,d,p[1]]);await q(admin,'SELECT public.advance_ante_phase($1,$2) v',[g,d]);
 await admin.query("UPDATE private.trip_flip_matches SET state=state||jsonb_build_object('phase','playing','deadline',floor(extract(epoch FROM clock_timestamp())*1000)+180000,'score',1000) WHERE dealer_game_id=$1",[d]);
 for(const c of [a,b]){await q(c,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[u[1]]);await c.query('SET ROLE authenticated');}
 let snapshot=await q(a,'SELECT public.trip_flip_snapshot($1) v',[d]);const initial=snapshot.revision,req=uuid(),card=snapshot.fan[0],stock=snapshot.stockRemaining;
 const move=(c,id,revision,items)=>q(c,"SELECT public.trip_flip_action($1,$2,$3,'move',$4) v",[d,id,revision,items]);
 const dup=await Promise.all([a,b].map(c=>move(c,req,initial,[7,0,card])));
 assert.ok(dup.every(v=>v.score===1000&&v.revision===initial+1&&v.stockRemaining===stock-1));
 const race=await Promise.allSettled([a,b].map(c=>move(c,uuid(),initial+1,[7,0,dup[0].fan[0]])));assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.match(race.find(r=>r.status==='rejected').reason.message,/stale_revision/);
 await assert.rejects(q(a,"SELECT public.trip_flip_action($1,$2,$3,'take_score') v",[d,req,initial]),/replay_conflict/);
 await q(b,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[u[0]]);
 snapshot=await q(a,'SELECT public.trip_flip_snapshot($1) v',[d]);await assert.rejects(move(b,uuid(),snapshot.revision,[7,1,snapshot.fan[0]]),/spectator/);
 await q(b,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[u[1]]);
 await admin.query("UPDATE private.trip_flip_matches SET state=state||'{\"columns\":[[0,13],[],[],[]],\"cells\":[null,null,null],\"fan\":[26],\"cursor\":54}'::jsonb WHERE dealer_game_id=$1",[d]);
 snapshot=await q(a,'SELECT public.trip_flip_snapshot($1) v',[d]);const finalRequest=uuid();
 const full=await Promise.all([a,b].map(c=>move(c,finalRequest,snapshot.revision,[7,0,26])));
 assert.ok(full.every(v=>v.phase==='stage_complete'&&v.stages.length===1&&v.stages[0].reason==='full_clear'));assert.equal(full[0].score,full[1].score);
 await admin.query('BEGIN');await admin.query("UPDATE private.trip_flip_matches SET state=state||jsonb_build_object('phase','complete','scores',jsonb_build_object($2::text,100,$3::text,0),'turnIndex',2) WHERE dealer_game_id=$1",[d,p[0],p[1]]);
 await admin.query("CREATE FUNCTION pg_temp.trip_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=NEW.game_id AND chips<>100) THEN RAISE EXCEPTION 'injection_before_chip_writes';END IF;RAISE EXCEPTION 'injected_after_chips';END $$; CREATE TRIGGER trip_failure BEFORE INSERT ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION pg_temp.trip_fail(); SAVEPOINT before_failure");
 await assert.rejects(q(admin,'SELECT private.trip_flip_settle($1) v',[d]),/injected_after_chips/);await admin.query('ROLLBACK TO SAVEPOINT before_failure');
 assert.deepEqual((await admin.query('SELECT chips FROM public.players WHERE game_id=$1 ORDER BY id',[g])).rows.map(r=>r.chips),[100,100]);
 for(const table of ['game_results','gameplay_transfer_batches','session_player_snapshots'])assert.equal((await admin.query(`SELECT count(*) n FROM public.${table} WHERE dealer_game_id=$1`,[d])).rows[0].n,'0');
 assert.equal((await admin.query('SELECT settlement FROM private.trip_flip_matches WHERE dealer_game_id=$1',[d])).rows[0].settlement,null);
 await admin.query('DROP TRIGGER trip_failure ON public.session_player_snapshots');await admin.query('COMMIT');
 for(const c of [a,b])await c.query('RESET ROLE');await Promise.all([a,b].map(c=>q(c,'SELECT private.trip_flip_settle($1) v',[d])));
 assert.equal((await admin.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[d])).rows[0].n,'1');assert.equal((await admin.query('SELECT count(*) n FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[d])).rows[0].n,'1');assert.deepEqual((await admin.query('SELECT chips FROM public.players WHERE game_id=$1 ORDER BY chips',[g])).rows.map(r=>r.chips),[91,109]);
 const run=await q(admin,"SELECT public.arcade_start($1,$2,'trip-flip') v",[u[0],uuid()]);await q(admin,'SELECT public.arcade_trip_flip_step($1,$2) v',[u[0],run.id]);
 await admin.query("UPDATE private.arcade_runs SET state=jsonb_set(state,'{board}',state->'board'||jsonb_build_object('phase','playing','deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+180000)) WHERE id=$1",[run.id]);
 const current=await q(admin,'SELECT public.arcade_trip_flip_step($1,$2) v',[u[0],run.id]),request=uuid();
 const solo=await Promise.all([a,b].map(c=>q(c,"SELECT public.arcade_trip_flip_step($1,$2,$3,$4,$5,'move',$6) v",[u[0],run.id,current.projection.revision,current.projection.view.roundId,request,[7,0,current.projection.view.fan[0]]])));assert.deepEqual(solo.map(r=>r.outcome).sort(),['committed','duplicate']);
 const rev=solo[0].projection.revision,scope=solo[0].projection.view.roundId;
 await admin.query("UPDATE private.arcade_runs SET state=jsonb_set(state,'{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1000000)) WHERE id=$1",[run.id]);
 const expired=await Promise.all([a,b].map(c=>q(c,"SELECT public.arcade_trip_flip_step($1,$2,$3,$4,$5,'take_score') v",[u[0],run.id,rev,scope,uuid()])));
 assert.ok(expired.every(r=>r.record.status==='completed'&&r.record.state.results.length===2));assert.equal((await admin.query('SELECT count(*) n FROM private.arcade_results WHERE run_id=$1',[run.id])).rows[0].n,'1');
 writeFileSync('qualification.local/trip-flip/concurrency'+(real?'-real':'')+'.json',JSON.stringify({passed:true,at:new Date().toISOString(),balances:[91,109],authorityHashes:expected}));console.log('PASS concurrent move/clear/settlement, actor rejection, stale/replay, after-chip rollback, Arcade duplicate/timeout races');
}finally{await Promise.all([a.end(),b.end(),admin.end()]);}
