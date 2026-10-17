import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function proveAudio({db,rpc,scalar,users,begin,commit,vite,pass}){
 const candidate=readFileSync('supabase/run21/shared-audio.candidate.sql','utf8');
 const history=()=>scalar("SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY run_id),'[]')::text) value FROM private.arcade_results r");
 const before=await history();
 await db.query('BEGIN');await db.query(candidate);await db.query('ROLLBACK');assert.equal(await history(),before);
 await db.query(candidate);await db.query(candidate);
 // Reuse the currently deployed presentation/result functions, not a proof-only scoring implementation.
 await db.query(readFileSync('supabase/arcade/completion.sql','utf8'));
 await db.query("CREATE OR REPLACE FUNCTION private.arcade_tri_valid_completion(jsonb) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Unexpected TriTowers call in Run21 proof';END $$");
 const scene=readFileSync('supabase/migrations/20261017153400_tri_towers_scene_intro.sql','utf8');
 for(const name of ['arcade_commit','arcade_leaderboard']){
  const from=scene.indexOf('CREATE OR REPLACE FUNCTION '+'public.'+name+'(');
  const end=scene.indexOf('END $function$',from)+'END $function$'.length;
  assert(from>=0&&end>from);await db.query(scene.slice(from,end)+';');
 }
 await db.query(readFileSync('supabase/run21/activate-shared-audio.sql','utf8'));
 const {RUN21_RULES}=await vite.ssrLoadModule('/src/lib/run21/rulesets.ts');
 const {createSoloRun,applySolo,advanceSolo}=await vite.ssrLoadModule('/src/lib/arcade/run21.ts');
 const user=users[3];
 const seed=randomUUID();
 await db.query("INSERT INTO private.arcade_runs(id,user_id,game,ruleset,config,status,score) SELECT $1,$2,'run21',id,config,'completed',100 FROM private.arcade_rulesets WHERE id='run21/2'",[seed,user]);
 await db.query("INSERT INTO private.arcade_results(run_id,user_id,game,ruleset,score,revision,completed_at,final_state) VALUES($1,$2,'run21','run21/2',100,0,clock_timestamp(),'{}')",[seed,user]);
 const run=await begin(user);assert.equal(run.ruleset,'run21/3');
 for(const k of Object.keys(RUN21_RULES))assert.deepEqual(run.config[k],RUN21_RULES[k]);
 let state=createSoloRun(run,Date.now()-10000);
 for(let round=1;round<=3;round++){
  state.board.columns=Array.from({length:5},(_,i)=>[{rank:'K',suit:'hearts'},{rank:i===4?'10':'A',suit:'spades'}]);
  state=applySolo(state,{type:'collect'},state.board.startedAt+1);
  assert.equal(state.results.at(-1).aggregate,104);assert.equal(state.presentation.startedAt-state.results.at(-1).at,3000);
  assert.equal(state.presentation.endsAt-state.presentation.startedAt,5000);
  if(round<3)state=advanceSolo(state,state.presentation.endsAt);
 }
 const result=await commit(run,state);assert.equal(result.outcome,'committed');
 const stored=await scalar('SELECT record value FROM private.arcade_results WHERE run_id=$1',[run.id]);
 assert.equal(stored.priorBest,100);assert.equal(stored.kind,'broken');
 const board=await rpc('arcade_leaderboard',{p_actor:user,p_game:'run21',p_window:'all'});
 assert.deepEqual(board.compatibleRulesets,['run21/2','run21/3']);assert.equal(board.personalBest,state.score);
 assert(board.rows.some(r=>r.runId===seed));assert(board.rows.some(r=>r.runId===run.id));
 assert.equal(await scalar('SELECT ruleset value FROM private.arcade_results WHERE run_id=$1',[seed]),'run21/2');
 pass('Audio migration rollback/idempotency, shared v3 admission, full 3+5-second 104 timeline, mixed-version ranking and immutable personal-best comparison');
}
