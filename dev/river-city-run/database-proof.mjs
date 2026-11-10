import pg from 'file:///C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRun,applyIntent,recoverRun} from '../../src/lib/riverCityRun/authority.mjs';
const connect=async database=>{const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await c.connect();return c;};
const dbName='river_city_run_'+Date.now(),admin=await connect('template1');
await admin.query('CREATE DATABASE '+dbName+' TEMPLATE ptown_polish_1794161835570');await admin.end();
const db=await connect(dbName),sql=fs.readFileSync(new URL('../../supabase/river-city-run/candidate.sql',import.meta.url),'utf8');
const rpc=async(name,args)=>(await db.query('SELECT public.'+name+'('+Object.keys(args).map((key,i)=>key+'=>$'+(i+1)).join(',')+') value',Object.values(args))).rows[0].value;
const passed=[];const pass=s=>{passed.push(s);console.log('PASS '+s);};
const reject=async fn=>{await db.query('SAVEPOINT rejected');try{await assert.rejects(fn);}finally{await db.query('ROLLBACK TO SAVEPOINT rejected');}};
const paths=JSON.parse(fs.readFileSync(new URL('./approved-paths.json',import.meta.url),'utf8'));
function arrival(row){const start=Date.parse(row.created_at);let r=createRun(row.id,row.user_id,start);for(const input of paths.elevated)r=applyIntent(r,{type:'input',...input},start+input.at*1000+100);return applyIntent(recoverRun(r,start+188000),{type:'bank'},start+188100);}
async function proof(){
 const users=[randomUUID(),randomUUID(),randomUUID()];
 for(const [i,id]of users.entries()){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES($1,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true',[id]);await db.query('INSERT INTO public.profiles(id,username,is_active,is_superuser) VALUES($1,$2,true,false) ON CONFLICT(id) DO UPDATE SET username=excluded.username,is_active=true',[id,'River proof '+i]);}
 await db.query("UPDATE private.arcade_recovery_state SET failure=NULL,last_completed_at=clock_timestamp()");
 const guardTargets=(await db.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('public','private') AND tablename NOT LIKE 'arcade_%'")).rows;
 await db.query("CREATE FUNCTION private.river_proof_guard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Non Arcade write: %',TG_TABLE_NAME;END$$");
 for(const t of guardTargets)await db.query('CREATE TRIGGER river_proof_guard BEFORE INSERT OR UPDATE OR DELETE ON "'+t.schemaname+'"."'+t.tablename+'" FOR EACH STATEMENT EXECUTE FUNCTION private.river_proof_guard()');
 const start=(actor=users[0],request=randomUUID(),course='the-boat')=>rpc('arcade_river_start',{p_actor:actor,p_request:request,p_course:course});
 const commit=(row,state,request=null,fingerprint='proof')=>rpc('arcade_river_commit',{p_actor:row.user_id,p_run:row.id,p_revision:row.revision,p_state:state,p_request:request,p_fingerprint:request?fingerprint:null});
 await reject(()=>start());
 await db.query("UPDATE private.arcade_rulesets SET enabled=true WHERE id='river-city-run/1'");
 for(const role of ['anon','authenticated']){await db.query('SET ROLE '+role);await reject(()=>start());await reject(()=>db.query('SELECT * FROM private.arcade_runs'));await db.query('RESET ROLE');}
 pass('closed admission; browser roles denied private state and service RPCs');
 const id=randomUUID(),first=await start(users[0],id);assert.equal((await start(users[0],id)).id,first.id);
 await reject(()=>start(users[0],randomUUID(),'future-course'));
 await reject(()=>rpc('arcade_load',{p_actor:users[1],p_run:first.id}));
 const state=arrival(first),bad={...state,score:state.score+1};await reject(()=>commit(first,bad));
 await db.query("CREATE FUNCTION private.river_fail_result() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Injected result failure';END$$; CREATE TRIGGER river_fail_result BEFORE INSERT ON private.arcade_results FOR EACH ROW WHEN(NEW.game='river-city-run') EXECUTE FUNCTION private.river_fail_result()");
 await reject(()=>commit(first,state));assert.equal((await rpc('arcade_load',{p_actor:users[0],p_run:first.id})).revision,0);
 await db.query('DROP TRIGGER river_fail_result ON private.arcade_results;DROP FUNCTION private.river_fail_result()');
 const command=randomUUID(),result=await commit(first,state,command);assert.equal(result.outcome,'committed');assert.equal(result.record.score,1667200);
 assert.equal((await commit(first,state,command)).outcome,'duplicate');await reject(()=>commit(first,state,command,'changed'));
 assert.equal((await commit(first,state,randomUUID())).outcome,'conflict');assert.equal((await start(users[0],id)).id,first.id);
 assert.notEqual((await start()).id,first.id);
 await reject(()=>db.query('UPDATE private.arcade_results SET score=0 WHERE run_id=$1',[first.id]));
 pass('actual road score; atomic rollback; duplicate, replay, late replay, terminal and successor isolation');
 for(const actor of users.slice(1)){const row=await start(actor);await commit(row,arrival(row));}
 for(const window of ['30','all']){const board=await rpc('arcade_river_board',{p_actor:users[0],p_course:'the-boat',p_window:window});assert.equal(board.rows.length,3);assert.deepEqual(board.rows.map(r=>r.rank),[1,1,1]);assert.ok(board.rows.every(r=>r.score===16672&&r.completedAt));}
 await reject(()=>rpc('arcade_river_board',{p_actor:users[0],p_course:'future-course',p_window:'all'}));
 const active=await start(),abandoned=applyIntent(createRun(active.id,active.user_id,Date.parse(active.created_at)),{type:'abandon'},Date.parse(active.created_at)+1);await commit(active,abandoned);
 assert.equal(Number((await db.query("SELECT count(*) n FROM private.arcade_results WHERE game='river-city-run'")).rows[0].n),3);
 pass('both course-scoped date views, ties, achieved timestamps, invalid course rejection, abandon exclusion');
 pass('zero writes across '+guardTargets.length+' guarded non-Arcade tables');
}
try{
 await db.query('BEGIN');await db.query(sql);await proof();await db.query('ROLLBACK');
 assert.equal((await db.query("SELECT to_regprocedure('public.arcade_river_start(uuid,uuid,text)') value")).rows[0].value,null);
 pass('complete candidate rolled back; no installed River functions');
 // Install only in this disposable loopback clone, then repeat with fixtures rolled back.
 await db.query(sql);await db.query('BEGIN');await proof();await db.query('ROLLBACK');
 fs.writeFileSync(new URL('./database.local.json',import.meta.url),JSON.stringify({database:dbName,passed,source:'local clone; production unchanged'},null,2));
 console.log('LOCAL_DATABASE '+dbName);
}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{await db.end();}
