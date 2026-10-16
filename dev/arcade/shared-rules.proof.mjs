import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function proveSharedArcade({db,rpc,scalar,users,begin,commit,vite,pass}){
 const sql=readFileSync('supabase/run21/shared-rules.candidate.sql','utf8').replace(/\r\n/g,'\n');
 await db.query(readFileSync('supabase/run21/shared-rules-base.sql','utf8').replace(/\r\n/g,'\n'));
 await db.query(sql);await db.query(readFileSync('supabase/run21/activate-shared-rules.sql','utf8'));
 const {RUN21_RULES,assertSharedRules}=await vite.ssrLoadModule('/src/lib/run21/rulesets.ts');
 const {createSoloRun}=await vite.ssrLoadModule('/src/lib/arcade/run21.ts');
 const {recoverArcade}=await vite.ssrLoadModule('/server/arcade/service.ts');
 const run=await begin(users[2]);assert.equal(run.ruleset,'run21/2');assertSharedRules(run.config);
 for(const key of Object.keys(RUN21_RULES))assert.deepEqual(run.config[key],RUN21_RULES[key]);
 await commit(run,createSoloRun(run,Date.now()-1000000));
 const token=randomUUID();await db.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=false,expires_at=clock_timestamp()+interval '25 seconds'",[token]);
 await recoverArcade(rpc,token);
 const final=await rpc('arcade_load',{p_actor:users[2],p_run:run.id});assert.equal(final.status,'completed');
 assert.deepEqual(final.state.results.map(r=>r.score),[0,0,0]);assert.equal(final.state.round,3);
 assert.equal(await scalar('SELECT count(*)::int value FROM private.arcade_results WHERE run_id=$1',[run.id]),1);
 for(const ruleset of ['run21/2','run21/arcade-2','run21/arcade-1']){
  const board=await rpc('arcade_leaderboard',{p_actor:users[2],p_game:'run21',p_window:'all',p_ruleset:ruleset});assert.equal(board.ruleset,ruleset);
 }
 assert.equal((await rpc('arcade_leaderboard',{p_actor:users[2],p_game:'run21',p_window:'all'})).ruleset,'run21/2');
 pass('Shared version is Arcade default; frozen legacy boards stay separate and zero-client recovery completes exactly three rounds');
}
