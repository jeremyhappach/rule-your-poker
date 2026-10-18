import {connect,localContext} from './database.mjs';import {randomUUID as uuid} from 'node:crypto';import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
const db=localContext().database,a=await connect(db),b=await connect(db),admin=await connect(db),u=[uuid(),uuid()],p=[uuid(),uuid()],g=uuid(),offer=new Date(Date.now()+600000).toISOString();
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows[0]?.v;
try{
 for(let i=0;i<2;i++){await admin.query('INSERT INTO auth.users(id) VALUES($1)',[u[i]]);await admin.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[u[i],'Royal concurrent '+u[i]]);}
 await admin.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',false,2,$2,0,false,false)",[g,offer]);
 for(let i=0;i<2;i++)await admin.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[p[i],g,u[i],2-i]);
 await q(admin,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[u[0]]);
 const config=await q(admin,"SELECT public.royal_flash_configure($1,$2,2,'royal-flash','{\"ante_amount\":9}',$3) v",[g,p[0],offer]),d=config.dealer_game.id;
 await q(admin,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[u[1]]);await q(admin,"SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v",[g,d,p[1]]);await q(admin,'SELECT public.advance_ante_phase($1,$2) v',[g,d]);
 await admin.query("UPDATE private.royal_flash_matches SET state=state||jsonb_build_object('phase','ready','deadline',floor(extract(epoch FROM clock_timestamp())*1000)+20000) WHERE dealer_game_id=$1",[d]);
 for(const c of [a,b]){await q(c,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[u[1]]);await c.query('SET ROLE authenticated');}
 const req=uuid();const results=await Promise.all([a,b].map(c=>q(c,"SELECT public.royal_flash_action($1,$2,0,'place',ARRAY[0]) v",[d,req])));assert.equal(results[0].revision,1);assert.equal(results[1].revision,1);
 const race=await Promise.allSettled([a,b].map((c,i)=>q(c,"SELECT public.royal_flash_action($1,$2,1,'place',$3) v",[d,uuid(),[i+1]])));assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.match(race.find(r=>r.status==='rejected').reason.message,/stale_revision/);
 await assert.rejects(q(a,"SELECT public.royal_flash_action($1,$2,0,'place',ARRAY[2]) v",[d,req]),/replay_conflict/);
 let board=await q(a,'SELECT public.royal_flash_snapshot($1) v',[d]);
 for(let i=0;i<24;i++)if(board.slots[i]===null)board=await q(a,"SELECT public.royal_flash_action($1,$2,$3,'place',$4) v",[d,uuid(),board.revision,[i]]);
 const finalRequest=uuid(),finalRevision=board.revision;
 const full=await Promise.all([a,b].map(c=>q(c,"SELECT public.royal_flash_action($1,$2,$3,'place',ARRAY[24]) v",[d,finalRequest,finalRevision])));
 assert.ok(full.every(v=>v.phase==='stage_complete'&&v.placements===25&&v.stages.length===1&&v.stages[0].reason==='full_grid'));
 assert.equal(full[0].score,full[1].score);await assert.rejects(q(a,"SELECT public.royal_flash_action($1,$2,$3,'place',ARRAY[0]) v",[d,uuid(),finalRevision]),/stale_revision/);
 await admin.query('BEGIN');await admin.query("UPDATE private.royal_flash_matches SET state=state||jsonb_build_object('phase','complete','scores',jsonb_build_object($2::text,100,$3::text,0),'turnIndex',2) WHERE dealer_game_id=$1",[d,p[0],p[1]]);
 await admin.query("CREATE FUNCTION pg_temp.royal_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER royal_failure BEFORE INSERT ON public.game_results FOR EACH ROW EXECUTE FUNCTION pg_temp.royal_fail(); SAVEPOINT before_failure");
 await assert.rejects(q(admin,'SELECT private.royal_flash_settle($1) v',[d]),/injected/);await admin.query('ROLLBACK TO SAVEPOINT before_failure');
 assert.deepEqual((await admin.query('SELECT chips FROM public.players WHERE game_id=$1 ORDER BY id',[g])).rows.map(r=>r.chips),[100,100]);assert.equal((await admin.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[d])).rows[0].n,'0');
 await admin.query('DROP TRIGGER royal_failure ON public.game_results');await admin.query('COMMIT');
 for(const c of [a,b])await c.query('RESET ROLE');await Promise.all([a,b].map(c=>q(c,'SELECT private.royal_flash_settle($1) v',[d])));
 assert.equal((await admin.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[d])).rows[0].n,'1');assert.equal((await admin.query('SELECT count(*) n FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[d])).rows[0].n,'1');
 assert.deepEqual((await admin.query('SELECT chips FROM public.players WHERE game_id=$1 ORDER BY chips',[g])).rows.map(r=>r.chips),[91,109]);
 const run=await q(admin,"SELECT public.arcade_start($1,$2,'royal-flash') v",[u[0],uuid()]);await q(admin,'SELECT public.arcade_royal_step($1,$2) v',[u[0],run.id]);
 await admin.query("UPDATE private.arcade_runs SET state=jsonb_set(jsonb_set(state,'{board,phase}','\"ready\"'),'{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint+20000)) WHERE id=$1",[run.id]);
 const current=await q(admin,'SELECT public.arcade_royal_step($1,$2) v',[u[0],run.id]),request=uuid();
 const solo=await Promise.all([a,b].map(c=>q(c,"SELECT public.arcade_royal_step($1,$2,$3,$4,$5,'place',ARRAY[0]) v",[u[0],run.id,current.projection.revision,current.projection.view.roundId,request])));
 assert.deepEqual(solo.map(r=>r.outcome).sort(),['committed','duplicate']);
 let single=solo[0];for(let i=1;i<24;i++)single=await q(admin,"SELECT public.arcade_royal_step($1,$2,$3,$4,$5,'place',$6) v",[u[0],run.id,single.projection.revision,single.projection.view.roundId,uuid(),[i]]);
 const finish=uuid();const completed=await Promise.all([a,b].map(c=>q(c,"SELECT public.arcade_royal_step($1,$2,$3,$4,$5,'place',ARRAY[24]) v",[u[0],run.id,single.projection.revision,single.projection.view.roundId,finish])));
 assert.deepEqual(completed.map(r=>r.outcome).sort(),['committed','duplicate']);assert.ok(completed.every(r=>r.projection.view.result.reason==='full_grid'&&r.record.state.results.length===1));
 await admin.query("UPDATE private.arcade_runs SET state=jsonb_set(state,'{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-2500)) WHERE id=$1",[run.id]);
 single=await q(admin,'SELECT public.arcade_royal_step($1,$2) v',[u[0],run.id]);
 for(let i=0;i<24;i++)single=await q(admin,"SELECT public.arcade_royal_step($1,$2,$3,$4,$5,'place',$6) v",[u[0],run.id,single.projection.revision,single.projection.view.roundId,uuid(),[i]]);
 await admin.query("UPDATE private.arcade_runs SET state=jsonb_set(state,'{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1)) WHERE id=$1",[run.id]);
 const expired=await Promise.all([a,b].map(c=>q(c,"SELECT public.arcade_royal_step($1,$2,$3,$4,$5,'place',ARRAY[24]) v",[u[0],run.id,single.projection.revision,single.projection.view.roundId,uuid()])));
 assert.ok(expired.every(r=>r.projection.view.result.reason==='timeout'&&r.projection.view.placements===24&&r.record.state.results.length===2));
 assert.equal(expired[0].record.status,'completed');assert.equal(expired[0].record.score,expired[0].record.state.results.reduce((sum,r)=>sum+r.stageScore,0));
 assert.equal((await admin.query('SELECT count(*) n FROM private.arcade_results WHERE run_id=$1',[run.id])).rows[0].n,'1');
 writeFileSync('qualification.local/royal-flash/concurrency.json',JSON.stringify({passed:true,multiplayer:'final-placement duplicate, competing revisions, replay conflict, rollback injection, concurrent settlement',arcade:'final-placement duplicate and competing timeout exactly once'}));console.log('Concurrency and atomic failure proofs passed');
}finally{await Promise.all([a.end(),b.end(),admin.end()]);}
