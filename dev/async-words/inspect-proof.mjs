// Local PostgreSQL only; candidate, synthetic fixtures and commands all roll back.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'file:///C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
const database=process.env.WORDS_INSPECT_TEST_DB??'async_real_1793571492049';
assert(/^async_[a-z_]+\d+$/.test(database));
const db=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database}),checks=[];
await db.connect();
const val=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.v;
const writes=async()=>JSON.stringify((await db.query("SELECT schemaname,relname,n_tup_ins,n_tup_upd,n_tup_del FROM pg_stat_xact_user_tables WHERE schemaname IN('public','private','auth') ORDER BY schemaname,relname")).rows);
const rpc=async(who,name,args)=>{
 await db.query('SAVEPOINT rpc');
 try{await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[who??'']);await db.query('SET LOCAL ROLE authenticated');
  const result=await val('SELECT public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') v',args);
  await db.query('RESET ROLE');await db.query('RELEASE SAVEPOINT rpc');return result;
 }catch(e){await db.query('ROLLBACK TO SAVEPOINT rpc');await db.query('RELEASE SAVEPOINT rpc');throw e;}
};
const pass=s=>{checks.push(s);console.log('PASS',s);};
try{
 await db.query('BEGIN');
 await db.query(readFileSync('supabase/delayed/words-inspect.sql','utf8'));
 await db.query(readFileSync('supabase/delayed/words-inspect.sql','utf8'));
 const users=Array.from({length:3},()=>randomUUID());
 for(const id of users){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true)',[id,'Inspect '+id.slice(0,10)]);}
 await db.query('UPDATE private.delayed_release SET admission_enabled=true');
 await db.query('UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()');
 await db.query('UPDATE private.delayed_recovery_state SET enabled=true');
 const match=await rpc(users[0],'delayed_create',[randomUUID(),users[1],false,JSON.stringify([{game:'ptown-words',stake:5}])]);
 const hash=await val('SELECT offer_hash v FROM private.delayed_matches WHERE id=$1',[match]);
 await rpc(users[1],'delayed_respond',[match,randomUUID(),hash,'accept']);
 const child=async()=>(await db.query('SELECT * FROM private.delayed_children WHERE match_id=$1',[match])).rows[0];
 let c=await child(),actor=c.actor,viewer=users.find(u=>u!==actor&&u!==users[2]);
 let before=await writes();
 await rpc(viewer,'delayed_home',[match]);
 const view=await rpc(viewer,'delayed_words_inspect',[c.id]);
 assert.equal(view.canAct,false);assert.equal(view.viewerId,viewer);assert.equal(view.activePlayerId,actor);assert.deepEqual(view.rack,c.state.racks[viewer]);assert.deepEqual(view.board,c.state.board);assert.deepEqual(view.scores,c.state.scores);
 assert(!('racks' in view)&&!('bag' in view));assert.equal(await writes(),before);
 pass('opponent inspection returns committed board, own rack and scores with zero table writes');
 assert.equal((await rpc(actor,'delayed_words_inspect',[c.id])).canAct,true);assert.equal(await writes(),before);pass('active-player inspection preserves authoritative ownership without admission writes');
 await assert.rejects(()=>rpc(users[2],'delayed_words_inspect',[c.id]));await assert.rejects(()=>rpc(null,'delayed_words_inspect',[c.id]));
 assert.equal(await val("SELECT has_function_privilege('anon','public.delayed_words_inspect(uuid)','EXECUTE') v"),false);
 assert.equal(await val("SELECT has_function_privilege('service_role','public.delayed_words_inspect(uuid)','EXECUTE') v"),false);
 assert.equal(await writes(),before);pass('outsider, anonymous identity and role ACLs fail closed');
 for(const action of ['place','exchange','pass'])await assert.rejects(()=>rpc(viewer,'delayed_words_action',[c.id,randomUUID(),c.revision,action,null]),/not_your_turn/);
 assert.equal(await writes(),before);pass('existing server action authority rejects every opponent mutation without writes');
 await db.query('SAVEPOINT overdue');
 await db.query("WITH t AS(SELECT clock_timestamp()-interval '1 minute' deadline) UPDATE private.delayed_children SET available_at=t.deadline-interval '36 hours',last_call_at=t.deadline-interval '12 hours',expires_at=t.deadline FROM t WHERE id=$1",[c.id]);
 before=await writes();const overdue=await rpc(viewer,'delayed_words_inspect',[c.id]);assert.equal(overdue.finished,false);assert.equal(await writes(),before);assert.equal((await child()).terminal,false);
 pass('overdue passive inspection cannot expire, settle, notify or alter deadlines');
 await db.query('ROLLBACK TO SAVEPOINT overdue');await db.query('RELEASE SAVEPOINT overdue');
 const request=randomUUID();await rpc(actor,'delayed_words_action',[c.id,request,c.revision,'pass',null]);
 c=await child();before=await writes();const next=await rpc(viewer,'delayed_words_inspect',[c.id]);assert.equal(next.canAct,true);assert.equal(next.activePlayerId,viewer);assert.equal(next.revision,Number(c.revision));assert.equal(await writes(),before);
 assert.equal(view.canAct,false);pass('next entry sees committed handoff; prior inspected snapshot stays unchanged');
 await rpc(actor,'delayed_words_action',[c.id,request,Number(c.revision)-1,'pass',null]);assert.equal((await child()).revision,c.revision);pass('existing command UUID replay deduplication remains intact');
 for(let i=0;i<3;i++){c=await child();await rpc(c.actor,'delayed_words_action',[c.id,randomUUID(),c.revision,'pass',null]);}
 c=await child();assert(c.terminal);before=await writes();assert.equal((await rpc(viewer,'delayed_words_inspect',[c.id])).finished,true);assert.equal(await writes(),before);pass('terminal projection remains available without duplicate settlement or writes');
 await db.query('ROLLBACK');
 assert.equal(await val("SELECT to_regprocedure('public.delayed_words_inspect(uuid)')::text v"),null);
 assert.equal(await val('SELECT count(*)::int v FROM auth.users WHERE id=ANY($1::uuid[])',[users]),0);
 mkdirSync('qualification.local/words-inspection',{recursive:true});writeFileSync('qualification.local/words-inspection/database.json',JSON.stringify({database,checks,rollbackVerified:true},null,2));
 console.log('PASS rollback removed candidate and all synthetic fixtures');
}catch(e){await db.query('ROLLBACK');console.error(e);process.exitCode=1;}finally{await db.end();}
