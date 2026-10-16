import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

export async function proveScoring({db,rpc,scalar,users,begin,commit,vite,database,pass}){
 const {createSoloRun,applySolo,advanceSolo,nextDue}=await vite.ssrLoadModule('/src/lib/arcade/run21.ts');
 const {arcadeOperation,synchronize}=await vite.ssrLoadModule('/server/arcade/service.ts');
 const sql=readFileSync('supabase/arcade/run21-scoring.sql','utf8').replace(/\r\n/g,'\n');
 const snapshot=()=>scalar("SELECT md5(jsonb_build_object('runs',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM private.arcade_runs r),'results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY run_id) FROM private.arcade_results r))::text) value");
 const legacy=await begin(users[0]),before=await snapshot();
 await db.query('BEGIN');await db.query(sql);await db.query('ROLLBACK');
 assert.equal(await snapshot(),before);
 assert.equal(await scalar("SELECT count(*)::int value FROM private.arcade_rulesets WHERE id='run21/arcade-2'"),0);
 await db.query(sql);await db.query(sql);
 assert.equal((await rpc('arcade_leaderboard',{p_actor:users[0],p_game:'run21',p_window:'all'})).ruleset,'run21/arcade-1');
 assert.equal(await snapshot(),before);
 assert.equal((await begin(users[0])).id,legacy.id);
 assert.equal((await begin(users[0])).ruleset,'run21/arcade-1');
 pass('scoring migration rolls back, is idempotent, and preserves every existing run/result and active legacy launch');
 if(process.argv.includes('--scoring-installed')){
  const installed=JSON.parse(readFileSync('dev/arcade/scoring.installed.json','utf8'));
  for(const f of installed.functions)assert.equal(await scalar('SELECT md5(pg_get_functiondef($1::regprocedure)) value',[f.signature]),f.hash,f.signature);
  assert.deepEqual((await db.query("SELECT indexdef FROM pg_indexes WHERE tablename LIKE 'arcade_%' ORDER BY indexname")).rows.map(r=>r.indexdef),installed.indexes);
  assert.deepEqual((await db.query('SELECT * FROM private.arcade_rulesets ORDER BY id')).rows.filter(r=>r.id!=='run21/arcade-0'),installed.rules);
  pass('installed scoring functions, indexes and both frozen rules match the complete proof authority');
 }
 await db.query(readFileSync('supabase/arcade/activate-run21-scoring.sql','utf8'));
 assert.equal((await begin(users[0])).id,legacy.id);
 assert.equal((await begin(users[0])).ruleset,'run21/arcade-1');
 const newRun=await begin(users[1]);assert.equal(newRun.ruleset,'run21/arcade-2');
 assert.equal(newRun.config.clockStart,'intro_end');assert.equal(newRun.config.firstPlacementSeconds,undefined);
 const initialized=createSoloRun(newRun,Date.now());
 assert.equal(initialized.board.startedAt,initialized.updatedAt+2500);
 assert.equal(initialized.board.deadline-initialized.board.startedAt,106800);
 let newRow=(await commit(newRun,initialized)).record;
 const loaded=await rpc('arcade_load',{p_actor:newRun.user_id,p_run:newRun.id});
 assert.deepEqual(loaded.state,initialized);
 const resumed=await synchronize(rpc,loaded,newRun.user_id);
 assert.equal(resumed.state.board.deadline,initialized.board.deadline);
 pass('new launches freeze version two; reconnect keeps the same intro origin and deadline');
 const firstComplete=advanceSolo(initialized,initialized.board.deadline);
 newRow=(await commit(newRow,firstComplete)).record;
 assert.equal(firstComplete.results[0].score,0);
 await commit(newRow,applySolo(firstComplete,{type:'abandon'},firstComplete.updatedAt+1));
 // The candidate qualifies just before expiry, but the authoritative lock is acquired after it.
 const raceRun=await begin(users[1]);
 const race=createSoloRun(raceRun,Date.now()-109400);
 race.board.columns=Array.from({length:5},()=>[{rank:'K',suit:'hearts'},{rank:'Q',suit:'spades'}]);
 const raceRow=(await commit(raceRun,race)).record;
 const candidate=applySolo(race,{type:'collect'},race.board.deadline-1);
 assert.equal(candidate.results[0].score,400);
 const request=randomUUID();
 const denied=await commit(raceRow,candidate,request,'expired-collect');
 assert.equal(denied.outcome,'deadline');
 assert.equal(await scalar('SELECT count(*)::int value FROM private.arcade_command_receipts WHERE request_id=$1',[request]),0);
 const timeout=await synchronize(rpc,denied.record,raceRun.user_id);
 assert.equal(timeout.state.results[0].reason,'timeout');assert.equal(timeout.state.results[0].score,0);
 assert.equal(timeout.state.results[0].at,race.board.deadline);
 pass('database lock rejects a precomputed qualifying action after expiry; synchronization records zero at the original deadline');
 // Exercise the actual service branch when the action crosses the deadline between load and commit.
 await commit(timeout,applySolo(timeout.state,{type:'abandon'},timeout.state.updatedAt+1));
 const serviceRun=await begin(users[1]),serviceState=createSoloRun(serviceRun,Date.now()-109400);
 serviceState.board.columns=race.board.columns;
 const serviceRow=(await commit(serviceRun,serviceState)).record;
 const wrapped=async(name,args)=>{
  const value=await rpc(name,args);
  if(name==='arcade_load')return {...value,server_at:serviceState.board.deadline-1};
  return value;
 };
 await assert.rejects(()=>arcadeOperation(wrapped,serviceRun.user_id,'Proof',{op:'action',runId:serviceRun.id,requestId:randomUUID(),revision:serviceRow.revision,roundId:serviceState.roundId,intent:{type:'collect'}}),/stale_action/);
 const serviceAfter=await rpc('arcade_load',{p_actor:serviceRun.user_id,p_run:serviceRun.id});
 assert.equal(serviceAfter.state.results[0].score,0);assert.equal(serviceAfter.state.results[0].reason,'timeout');
 pass('API deadline-race path persists the timeout before rejecting the stale action');
 await commit(serviceAfter,applySolo(serviceAfter.state,{type:'abandon'},serviceAfter.state.updatedAt+1));
 const coldRun=await begin(users[1]),cold=createSoloRun(coldRun,Date.now()-1000000);
 await commit(coldRun,cold);
 const token=randomUUID();await db.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=false,expires_at=clock_timestamp()+interval '25 seconds'",[token]);
 await promisify(execFile)(process.execPath,['dev/arcade/recovery-worker.mjs',database,token],{windowsHide:true});
 const recovered=await rpc('arcade_load',{p_actor:coldRun.user_id,p_run:coldRun.id});
 assert.equal(recovered.status,'completed');assert.equal(recovered.state.results.length,3);
 assert.deepEqual(recovered.state.results.map(r=>r.score),[0,0,0]);assert.equal(recovered.state.round,3);
 const ended=recovered.state;
 assert.equal((await commit(recovered,ended)).outcome,'conflict');
 assert.equal(await scalar('SELECT count(*)::int value FROM private.arcade_results WHERE run_id=$1',[coldRun.id]),1);
 const successor=await begin(users[1]);assert.notEqual(successor.id,coldRun.id);
 assert.equal((await commit(recovered,ended)).outcome,'conflict');
 pass('fresh recovery process completes three untouched rounds exactly once; late replay cannot alter the successor');
 const current=await rpc('arcade_leaderboard',{p_actor:users[0],p_game:'run21',p_window:'all'});
 const old=await rpc('arcade_leaderboard',{p_actor:users[0],p_game:'run21',p_window:'all',p_ruleset:'run21/arcade-1'});
 assert.equal(current.ruleset,'run21/arcade-2');assert.equal(current.personalBest,null);
 assert.equal(old.ruleset,'run21/arcade-1');assert.equal(old.personalBest,9999);
 assert.equal(current.previousBests.find(r=>r.ruleset==='run21/arcade-1').score,9999);
 assert.equal(current.currentRuleset,'run21/arcade-2');
 await assert.rejects(()=>rpc('arcade_leaderboard',{p_actor:users[0],p_game:'run21',p_window:'all',p_ruleset:'unknown'}),/unavailable/);
 for(const role of ['anon','authenticated']){
  await db.query('SET ROLE '+role);
  await assert.rejects(()=>rpc('arcade_leaderboard',{p_actor:users[0],p_game:'run21',p_window:'all',p_ruleset:'run21/arcade-1'}),/permission denied/);
  await db.query('RESET ROLE');
 }
 pass('new leaderboard is default; legacy board and bests remain separately selectable with unchanged authorization');
 const evidence={
  functions:(await db.query("SELECT p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND p.proname LIKE 'arcade_%' ORDER BY 1")).rows,
  indexes:(await db.query("SELECT indexdef FROM pg_indexes WHERE tablename LIKE 'arcade_%' ORDER BY indexname")).rows.map(r=>r.indexdef),
  rules:(await db.query("SELECT * FROM private.arcade_rulesets WHERE id IN('run21/arcade-1','run21/arcade-2') ORDER BY id")).rows
 };
 writeFileSync('dev/arcade/scoring.candidate.json',JSON.stringify(evidence,null,2));
}
