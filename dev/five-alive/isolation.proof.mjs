// Rollback-contained local Arcade write-isolation proof. Never use a hosted DB.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {connect} from '../async-words/local.mjs';

const template='coordinated_scores_1794288498120',database='five_alive_isolation_'+Date.now();
const admin=await connect('postgres');let db,vite,created=false;
try{
 assert.equal((await admin.query('SELECT count(*)::int n FROM pg_stat_activity WHERE datname=$1',[template])).rows[0].n,0);
 await admin.query(`CREATE DATABASE ${database} TEMPLATE ${template}`);created=true;db=await connect(database);
 vite=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,entries:[]}});
 await db.query('BEGIN');
 for(const file of ['pool','arcade'])await db.query(readFileSync(`supabase/five-alive/${file}.sql`,'utf8'));
 const words=readFileSync('server/fiveAlive/answers.reviewed.txt','utf8').split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>line.split(' '));
 await db.query("INSERT INTO private.five_alive_answers(version,word,difficulty) SELECT 'esdb-five-alive/1',word,tier::int FROM unnest($1::text[],$2::text[]) x(word,tier)",[words.map(row=>row[0]),words.map(row=>row[1])]);
 await db.query("INSERT INTO private.five_alive_pool(version) VALUES('esdb-five-alive/1')");
 await db.query("UPDATE private.arcade_rulesets SET enabled=true WHERE id='five-alive/1'");
 await db.query('UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL');
 const actor=randomUUID(),other=randomUUID();
 await db.query('INSERT INTO auth.users(id) VALUES($1),($2)',[actor,other]);
 await db.query('UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=ANY($1::uuid[])',[[actor,other]]);
 await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,'FA isolation actor',true),($2,'FA isolation other',true) ON CONFLICT(id) DO UPDATE SET is_active=true",[actor,other]);
 const targets=(await db.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('public','private') AND tablename NOT LIKE 'arcade_%' AND tablename NOT LIKE 'five_alive_%' ORDER BY 1,2")).rows;
 for(const required of ['players','games','dealer_games','game_results','player_transactions','session_player_snapshots','gameplay_transfer_batches','delayed_matches','delayed_children','delayed_settlements'])assert(targets.some(t=>t.tablename===required),required);
 await db.query("CREATE FUNCTION pg_temp.fa_no_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'five_alive:isolation_write:%:%',TG_TABLE_SCHEMA,TG_TABLE_NAME; END $$");
 const ident=value=>'"'+value.replaceAll('"','""')+'"';
 for(const t of targets)await db.query(`CREATE TRIGGER fa_isolation_no_write BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON ${ident(t.schemaname)}.${ident(t.tablename)} FOR EACH STATEMENT EXECUTE FUNCTION pg_temp.fa_no_write()`);
 async function rejected(fn,pattern){await db.query('SAVEPOINT fa_reject');let error;try{await fn();}catch(e){error=e;}await db.query('ROLLBACK TO SAVEPOINT fa_reject');assert(error);assert.match(String(error),pattern);}
 await rejected(()=>db.query('UPDATE public.players SET chips=chips WHERE false'),/five_alive:isolation_write:public:players/);
 await db.query("CREATE FUNCTION pg_temp.fa_fail_result() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('fa.isolation_fail',true)='yes' THEN RAISE EXCEPTION 'fa:isolation_injected_result'; END IF; RETURN NEW; END $$");
 await db.query('CREATE TRIGGER fa_isolation_fail BEFORE INSERT ON private.arcade_results FOR EACH ROW EXECUTE FUNCTION pg_temp.fa_fail_result()');
 const {fiveAliveArcadeOperation:operation}=await vite.ssrLoadModule('/server/fiveAlive/arcade.ts');
 const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value;
 const rpc=async(name,args)=>{await db.query('SET LOCAL ROLE service_role');const result=await value('SELECT public.'+name+'('+Object.keys(args).map((key,i)=>key+'=> $'+(i+1)).join(',')+') value',Object.values(args));await db.query('RESET ROLE');return result;};
 const startId=randomUUID(),started=await operation(rpc,actor,{op:'start',requestId:startId}),run=started.id;
 assert.equal((await operation(rpc,actor,{op:'start',requestId:startId})).id,run);
 await rejected(()=>operation(rpc,other,{op:'state',runId:run}),/not_found/);
 const secret=await value('SELECT state value FROM private.arcade_runs WHERE id=$1',[run]);
 for(const round of secret.rounds)assert.equal(JSON.stringify(started).includes(round.answer),false);
 const command=(state,word)=>({op:'action',runId:run,requestId:randomUUID(),revision:state.revision,roundId:state.view.roundId,intent:{type:'guess',word}});
 let state=started,last;
 for(let i=0;i<3;i++){
  last=command(state,secret.rounds[i].answer);
  if(i===2){
   await db.query("SELECT set_config('fa.isolation_fail','yes',true)");
   await rejected(()=>operation(rpc,actor,last),/fa:isolation_injected_result/);
   assert.equal(Number(await value('SELECT revision value FROM private.arcade_runs WHERE id=$1',[run])),state.revision);
   assert.equal(await value('SELECT count(*)::int value FROM private.arcade_results WHERE run_id=$1',[run]),0);
   await db.query("SELECT set_config('fa.isolation_fail','',true)");
  }
  state=await operation(rpc,actor,last);
 }
 assert.equal(state.status,'completed');assert.equal(state.view.revealed.length,3);
 assert.equal(await value('SELECT count(*)::int value FROM private.arcade_results WHERE run_id=$1',[run]),1);
 assert.equal((await operation(rpc,actor,last)).score,state.score);
 const board=await rpc('arcade_leaderboard',{p_actor:actor,p_game:'five-alive',p_window:'all',p_result:run});
 assert.equal(board.latestResult.score,state.score);
 const next=await operation(rpc,actor,{op:'start',requestId:randomUUID()});assert.notEqual(next.id,run);
 assert.equal((await operation(rpc,actor,last)).score,state.score);
 const abandoned=await operation(rpc,actor,{op:'action',runId:next.id,requestId:randomUUID(),revision:next.revision,roundId:next.view.roundId,intent:{type:'abandon'}});
 assert.equal(abandoned.status,'abandoned');assert.equal(await value('SELECT count(*)::int value FROM private.arcade_results WHERE run_id=$1',[next.id]),0);
 await db.query('SET LOCAL ROLE authenticated');
 await rejected(()=>db.query('SELECT public.arcade_five_alive_start($1,$2)',[actor,randomUUID()]),/permission denied/);
 await db.query('RESET ROLE');
 console.log(`PASS ${targets.length} non-Arcade public/private tables blocked against INSERT, UPDATE, DELETE and TRUNCATE`);
 console.log('PASS Arcade start, private answer, injection rollback, completion, replay, leaderboard, successor, abandonment and role denial');
 await db.query('ROLLBACK');
 assert.equal(await value("SELECT to_regclass('private.five_alive_pool') value"),null);
 assert.equal(await value("SELECT count(*)::int value FROM auth.users WHERE id=ANY($1::uuid[])",[[actor,other]]),0);
 console.log('PASS candidate DDL, guards and synthetic accounts removed by rollback');
}finally{
 if(db){await db.query('ROLLBACK').catch(()=>{});await db.end();}if(vite)await vite.close();if(created)await admin.query(`DROP DATABASE ${database}`);await admin.end();
}
