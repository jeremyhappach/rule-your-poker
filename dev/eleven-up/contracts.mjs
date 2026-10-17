import {connect,context} from './database.mjs';import {randomUUID as uuid} from 'node:crypto';import {writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {database}=await context(),c=await connect(database),passed=[];
const q=async(s,a=[])=>(await c.query(s,a)).rows[0]?.v,pass=s=>{passed.push(s);console.log('PASS',s);};
async function reject(fn,pattern){await c.query('SAVEPOINT proof');try{await assert.rejects(fn,pattern);}finally{await c.query('ROLLBACK TO proof');await c.query('RELEASE proof');}}
async function call(user,sql,args){const d=await connect(database);try{await d.query('BEGIN');if(user){await d.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);await d.query('SET LOCAL ROLE authenticated');}const v=(await d.query(sql,args)).rows[0].v;await d.query('COMMIT');return v;}finally{await d.query('ROLLBACK');await d.end();}}
const f={game:uuid(),users:[uuid(),uuid()],players:[uuid(),uuid()],deadline:new Date(Date.now()+600000).toISOString()};
try{
 await c.query('BEGIN');await c.query('UPDATE private.eleven_up_release SET enabled=true,admission_enabled=true');
 await c.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',false,2,$2,0,false,false)",[f.game,f.deadline]);
 for(let i=0;i<2;i++){await c.query('INSERT INTO auth.users(id) VALUES($1)',[f.users[i]]);await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true)',[f.users[i],'Concurrency '+f.users[i].slice(0,8)]);await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[f.players[i],f.game,f.users[i],2-i]);}
 await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[f.users[0]]);
 const setup=await q("SELECT public.eleven_up_configure($1,$2,2,'eleven-up','{\"ante_amount\":5}',$3) v",[f.game,f.players[0],f.deadline]);f.dealer=setup.dealer_game.id;
 await c.query("UPDATE private.eleven_up_matches SET state=state||jsonb_build_object('phase','ready','deadline',$2::bigint) WHERE dealer_game_id=$1",[f.dealer,Date.now()+30000]);await c.query('COMMIT');
 const id=uuid(),action=(request,revision)=>call(f.users[1],"SELECT public.eleven_up_action($1,$2,$3,'pass',NULL) v",[f.dealer,request,revision]);
 const duplicate=await Promise.all([action(id,0),action(id,0)]);assert.equal(duplicate[0].revision,duplicate[1].revision);assert.equal(duplicate[0].revision,1);
 const race=await Promise.allSettled([action(uuid(),1),action(uuid(),1)]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.match(race.find(x=>x.status==='rejected').reason.message,/stale_revision/);
 assert.equal(await q('SELECT count(*)::int v FROM private.eleven_up_requests WHERE dealer_game_id=$1',[f.dealer]),2);
 pass('Real concurrent connections: identical command commits once; competing revision has exactly one winner');
 await c.query('BEGIN');let s=await q('SELECT state v FROM private.eleven_up_matches WHERE dealer_game_id=$1',[f.dealer]);
 const deadline=s.deadline,started=s.startedAt;
 await c.query('UPDATE public.games SET is_paused=true WHERE id=$1',[f.game]);
 await c.query('UPDATE private.eleven_up_matches SET paused_at=paused_at-2000 WHERE dealer_game_id=$1',[f.dealer]);
 await c.query('UPDATE public.games SET is_paused=false WHERE id=$1',[f.game]);
 s=await q('SELECT state v FROM private.eleven_up_matches WHERE dealer_game_id=$1',[f.dealer]);assert(s.deadline-deadline>=2000);assert.equal(s.deadline-deadline,s.startedAt-started);
 assert.equal(await q('SELECT private.eleven_up_bonus_qualified(79999,private.eleven_up_rules()) v'),false);assert.equal(await q('SELECT private.eleven_up_bonus_qualified(80000,private.eleven_up_rules()) v'),true);
 const totals=Object.fromEntries(f.players.map((id,i)=>[id,i===0?80000:79999]));
 const stage={...s,phase:'stage_complete',stage:2,turnIndex:1,deadline:1000,scores:totals};
 const bonus=await q("SELECT private.eleven_up_reduce($1,'tick',NULL,1000) v",[stage]);assert.equal(bonus.stage,3);assert.equal(bonus.players[bonus.turnIndex].id,f.players[0]);assert.deepEqual(bonus.qualified,[f.players[0]]);
 const complete=await q("SELECT private.eleven_up_reduce($1,'tick',NULL,1000) v",[{...bonus,phase:'stage_complete',deadline:1000}]);assert.equal(complete.phase,'complete');
 pass('Pause shifts playing and speed clocks equally; exact 80,000 qualification and one bonus round');
 // Fail after chip movement, when final snapshots are inserted: everything must roll back.
 await c.query("UPDATE private.eleven_up_matches SET state=state||jsonb_build_object('phase','complete','scores',$2::jsonb) WHERE dealer_game_id=$1",[f.dealer,totals]);
 await c.query(`CREATE FUNCTION public.eleven_proof_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.dealer_game_id='${f.dealer}'::uuid THEN RAISE EXCEPTION 'eleven_proof_atomic';END IF;RETURN NEW;END $$;CREATE TRIGGER eleven_proof_fail BEFORE INSERT ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION public.eleven_proof_fail();`);
 await reject(()=>q('SELECT private.eleven_up_settle($1) v',[f.dealer]),/eleven_proof_atomic/);
 assert.equal(await q('SELECT sum(chips)::int v FROM public.players WHERE game_id=$1',[f.game]),200);assert.equal(await q('SELECT min(chips)::int v FROM public.players WHERE game_id=$1',[f.game]),100);
 assert.equal(await q('SELECT count(*)::int v FROM public.game_results WHERE dealer_game_id=$1',[f.dealer]),0);assert.equal(await q('SELECT count(*)::int v FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[f.dealer]),0);
 assert.equal(await q('SELECT count(*)::int v FROM public.gameplay_transfer_pending_changes WHERE game_id=$1',[f.game]),0);
 await c.query('DROP TRIGGER eleven_proof_fail ON public.session_player_snapshots;DROP FUNCTION public.eleven_proof_fail()');
 await c.query('UPDATE public.games SET pending_session_end=true WHERE id=$1',[f.game]);await c.query('SELECT private.eleven_up_settle($1)',[f.dealer]);
 await c.query('SET CONSTRAINTS ALL IMMEDIATE');assert.equal(await q('SELECT count(*)::int v FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[f.dealer]),1);await c.query('SET CONSTRAINTS ALL DEFERRED');
 assert.equal(await q('SELECT status v FROM public.games WHERE id=$1',[f.game]),'session_ended');
 await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[f.users[1]]);await q('SELECT public.eleven_up_close($1) v',[f.dealer]);await q('SELECT public.eleven_up_close($1) v',[f.dealer]);
 assert.equal(await q('SELECT status v FROM public.games WHERE id=$1',[f.game]),'session_ended');
 pass('Failure after chip movement rolls back balances, journal and results; terminal Session Ended remains replay-safe');
 // The exact same deterministic board operation is used in both orchestrators.
 const b=await q("SELECT private.eleven_up_board_deal(jsonb_build_object('rules',private.eleven_up_rules(),'score',0),0) v");
 const core=await q("SELECT private.eleven_up_board_reduce($1,'pass',NULL,2500) v",[b]);
 const mp=await q("SELECT private.eleven_up_reduce($1,'pass',NULL,2500) v",[{...s,...b,scores:Object.fromEntries(f.players.map(p=>[p,0])),stage:1,turnIndex:0,stages:[]}]);
 for(const field of ['slots','current','cursor','groups','score','phase','deadline','startedAt'])assert.deepEqual(mp[field],core[field]);
 pass('Mode-neutral rules: multiplayer delegates the identical board action and scoring');
 await c.query('ROLLBACK');
 // Arcade command concurrency uses the existing receipt and immutable result owner.
 await c.query('BEGIN');await c.query("UPDATE private.arcade_rulesets SET enabled=true WHERE id='eleven-up/1'");await c.query("UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL");
 const run=await q("SELECT public.arcade_start($1,$2,'eleven-up') v",[f.users[0],uuid()]);await q('SELECT public.arcade_eleven_step($1,$2) v',[f.users[0],run.id]);
 await c.query("UPDATE private.arcade_runs SET state=jsonb_set(jsonb_set(state,'{board,phase}','\"ready\"'),'{board,deadline}',to_jsonb($2::bigint)) WHERE id=$1",[run.id,Date.now()+30000]);await c.query('COMMIT');
 const rev=await q('SELECT revision::int v FROM private.arcade_runs WHERE id=$1',[run.id]),rid=uuid();
 const solo=(request,revision)=>call(null,"SELECT public.arcade_eleven_step($1,$2,$3,$4,$5,'pass',NULL,NULL) v",[f.users[0],run.id,revision,run.id+':1',request]);
 const retries=await Promise.all([solo(rid,rev),solo(rid,rev)]);assert.deepEqual(retries.map(x=>x.outcome).sort(),['committed','duplicate']);
 const races=await Promise.all([solo(uuid(),rev+1),solo(uuid(),rev+1)]);assert.deepEqual(races.map(x=>x.outcome).sort(),['committed','stale']);
 pass('Arcade concurrent same-request replay and competing revision use canonical receipts');
 await writeFile('qualification.local/eleven-up/contracts.json',JSON.stringify({database,passed,fixture:f,productionWrites:0},null,2));
}finally{await c.query('ROLLBACK');await c.end();}
