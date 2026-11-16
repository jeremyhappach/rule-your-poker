import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {connect} from '../async-words/local.mjs';

// Disposable local clone; no fixture or DDL survives the rollback.
const db=await connect('five_alive_arcade_candidate');
const vite=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,entries:[]}});
const rpc=async(name,args)=>{const keys=Object.keys(args);return (await db.query('SELECT public.'+name+'('+keys.map((key,i)=>key+'=> $'+(i+1)).join(',')+') value',Object.values(args))).rows[0].value;};
try{
 await db.query('BEGIN');
 await db.query(readFileSync('supabase/five-alive/pool.sql','utf8'));
 await db.query(readFileSync('supabase/five-alive/arcade.sql','utf8'));
 const words=readFileSync('server/fiveAlive/answers.reviewed.txt','utf8').split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>line.split(' '));
 await db.query("INSERT INTO private.five_alive_answers(version,word,difficulty) SELECT 'esdb-five-alive/1',word,tier::int FROM unnest($1::text[],$2::text[]) x(word,tier)",[words.map(row=>row[0]),words.map(row=>row[1])]);
 await db.query("INSERT INTO private.five_alive_pool(version) VALUES ('esdb-five-alive/1')");
 await db.query("UPDATE private.arcade_rulesets SET enabled=true WHERE id='five-alive/1'");
 await db.query('UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL');
 const actor=randomUUID(),other=randomUUID();
 await db.query('INSERT INTO auth.users(id) VALUES($1),($2)',[actor,other]);
 await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,'Five Alive proof A',true),($2,'Five Alive proof B',true) ON CONFLICT(id) DO UPDATE SET is_active=true",[actor,other]);
 const {fiveAliveArcadeOperation}=await vite.ssrLoadModule('/server/fiveAlive/arcade.ts');
 const request=randomUUID(),started=await fiveAliveArcadeOperation(rpc,actor,{op:'start',requestId:request});
 assert.equal(started.revision,1);assert.equal(started.score,0);assert.equal(started.view.round,1);
 const runId=started.id;
 const secret=(await db.query('SELECT state FROM private.arcade_runs WHERE id=$1',[runId])).rows[0].state;
 for(const round of secret.rounds)assert.equal(JSON.stringify(started).includes(round.answer),false);
 assert.equal((await fiveAliveArcadeOperation(rpc,actor,{op:'start',requestId:request})).id,runId);
 await db.query('SAVEPOINT foreign_actor');
 await assert.rejects(()=>fiveAliveArcadeOperation(rpc,other,{op:'state',runId}),/arcade:not_found/);
 await db.query('ROLLBACK TO SAVEPOINT foreign_actor');
 let state=started,last;
 for(const item of secret.rounds){
  const body={op:'action',runId,requestId:randomUUID(),revision:state.revision,roundId:state.view.roundId,intent:{type:'guess',word:item.answer}};
  state=await fiveAliveArcadeOperation(rpc,actor,body);last=body;
 }
 assert.equal(state.status,'completed');assert.equal(state.view.completed,true);
 assert.equal((await db.query('SELECT count(*)::int n FROM private.arcade_results WHERE run_id=$1',[runId])).rows[0].n,1);
 const replay=await fiveAliveArcadeOperation(rpc,actor,last);assert.equal(replay.score,state.score);
 assert.equal((await db.query('SELECT count(*)::int n FROM private.arcade_results WHERE run_id=$1',[runId])).rows[0].n,1);
 console.log('PASS local transactional Arcade start, private projections, three words, completion and replay');
}finally{await db.query('ROLLBACK');await db.end();await vite.close();}
