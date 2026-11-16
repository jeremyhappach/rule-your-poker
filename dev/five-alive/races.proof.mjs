// Independent connections against a disposable local clone; never a deployed database.
import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {connect} from '../async-words/local.mjs';

const template='coordinated_scores_1794288498120';
const database='five_alive_race_'+Date.now();
const admin=await connect('postgres');
let db,peer,guard,vite,created=false;
try{
 const active=await admin.query('SELECT count(*)::int n FROM pg_stat_activity WHERE datname=$1',[template]);
 assert.equal(active.rows[0].n,0,'local template must be idle');
 await admin.query(`CREATE DATABASE ${database} TEMPLATE ${template}`);created=true;
 db=await connect(database);peer=await connect(database);guard=await connect(database);
 // Keep the clone's unrelated fixture matches out of the SKIP LOCKED worker.
 await guard.query('BEGIN');await guard.query('SELECT id FROM private.delayed_matches FOR UPDATE');
 vite=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,entries:[]}});
 for(const file of ['pool','arcade','async','notifications','registration']){
  if(file==='registration'){
   // This local template predates the deployed nine-game admission constraint.
   await db.query('ALTER TABLE private.delayed_children DROP CONSTRAINT delayed_children_game_type_check');
   await db.query("ALTER TABLE private.delayed_children ADD CONSTRAINT delayed_children_game_type_check CHECK(game_type IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown'))");
  }
  await db.query(readFileSync(`supabase/five-alive/${file}.sql`,'utf8'));
 }
 const words=readFileSync('server/fiveAlive/answers.reviewed.txt','utf8').split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>line.split(' '));
 await db.query("INSERT INTO private.five_alive_answers(version,word,difficulty) SELECT 'esdb-five-alive/1',word,tier::int FROM unnest($1::text[],$2::text[]) x(word,tier)",[words.map(row=>row[0]),words.map(row=>row[1])]);
 await db.query("INSERT INTO private.five_alive_pool(version) VALUES('esdb-five-alive/1')");
 await db.query('UPDATE private.five_alive_release SET async_enabled=true,async_real_qualified=true');
 await db.query('UPDATE private.delayed_release SET admission_enabled=true,real_qualified=true');
 await db.query('UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()');
 await db.query('UPDATE private.delayed_recovery_state SET enabled=true');
 await db.query("UPDATE private.arcade_rulesets SET enabled=true WHERE id='five-alive/1'");
 await db.query('UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL');
 const a=randomUUID(),b=randomUUID(),outsider=randomUUID();
 await db.query('INSERT INTO auth.users(id) VALUES($1),($2),($3)',[a,b,outsider]);
 await db.query('UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=ANY($1::uuid[])',[[a,b,outsider]]);
 await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,'Five Alive race A',true),($2,'Five Alive race B',true),($3,'Five Alive outsider',true) ON CONFLICT(id) DO UPDATE SET is_active=true",[a,b,outsider]);
 const {fiveAliveAsyncOperation:operation}=await vite.ssrLoadModule('/server/fiveAlive/async.ts');
 const {fiveAliveArcadeOperation:arcade}=await vite.ssrLoadModule('/server/fiveAlive/arcade.ts');
 const query=async(c,sql,args=[])=>(await c.query(sql,args)).rows[0]?.value;
 const rpc=c=>async(name,args)=>{
  const keys=Object.keys(args);
  await c.query('SET ROLE service_role');
  try{return await query(c,'SELECT public.'+name+'('+keys.map((key,i)=>key+'=> $'+(i+1)).join(',')+') value',Object.values(args));}
  finally{await c.query('RESET ROLE');}
 };
 const left=rpc(db),right=rpc(peer);
 async function fixture(real){
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[a]);
  const match=await query(db,'SELECT public.delayed_create($1,$2,$3,$4::jsonb) value',[randomUUID(),b,real,JSON.stringify([{game:'five-alive',stake:9}])]);
  const hash=await query(db,'SELECT offer_hash value FROM private.delayed_matches WHERE id=$1',[match]);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[b]);
  await db.query("SELECT public.delayed_respond($1,$2,$3,'accept')",[match,randomUUID(),hash]);
  const child=await query(db,'SELECT id value FROM private.delayed_children WHERE match_id=$1',[match]);
  const game=await query(db,"SELECT state->'fiveAlive' value FROM private.delayed_children WHERE id=$1",[child]);
  return {match,child,game};
 }
 const body=(child,revision,segment,word)=>({op:'action',childId:child,requestId:randomUUID(),revision,segment,intent:{type:'guess',word}});
 function barrierPair(){
  let count=0,release;
  const gate=new Promise(resolveGate=>{release=resolveGate;});
  return [left,right].map(r=>async(name,args)=>{
   const result=await r(name,args);
   if(name==='delayed_five_alive_load'&&++count<=2){if(count===2)release();await gate;}
   return result;
  });
 }
 async function stats(match,child){
  return query(db,`SELECT jsonb_build_object('receipts',(SELECT count(*) FROM private.delayed_commands WHERE child_id=$2),
   'outcomes',(SELECT count(*) FROM private.delayed_outcomes WHERE child_id=$2),
   'settlements',(SELECT count(*) FROM private.delayed_settlements WHERE match_id=$1),
   'batches',(SELECT count(*) FROM public.gameplay_transfer_batches WHERE game_id=$1),
   'transactions',(SELECT count(*) FROM public.player_transactions WHERE source_game_id=$1)) value`,[match,child]);
 }
 for(const real of [false,true]){
  const duplicate=await fixture(real),duplicateBody=body(duplicate.child,1,1,duplicate.game.answers[0].word);
  const [duplicateA,duplicateB]=barrierPair();
  const duplicateResults=await Promise.all([operation(duplicateA,a,duplicateBody),operation(duplicateB,a,duplicateBody)]);
  assert(duplicateResults.every(result=>result.view.current?.waiting));
  assert.equal((await stats(duplicate.match,duplicate.child)).receipts,1);
  const duplicateState=await operation(left,a,{op:'state',childId:duplicate.child});
  assert.equal(duplicateState.revision,2);assert.equal(duplicateState.segment,1);
  const sealed=await operation(right,b,{op:'state',childId:duplicate.child});
  assert.equal(JSON.stringify(sealed).includes(duplicate.game.answers[0].word),false);
  assert.equal('ownResult' in sealed.view,false);
  const distinct=await fixture(real),[distinctA,distinctB]=barrierPair();
  const duplicates=await Promise.allSettled([operation(distinctA,a,body(distinct.child,1,1,distinct.game.answers[0].word)),operation(distinctB,a,body(distinct.child,1,1,distinct.game.answers[0].word))]);
  assert.equal(duplicates.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(duplicates.filter(result=>result.status==='rejected').length,1);
  assert.equal((await stats(distinct.match,distinct.child)).receipts,1);

  const resume=await fixture(real),wrong=resume.game.answers[0].word==='STONE'?'BREAD':'STONE';
  const partial=await operation(left,a,body(resume.child,1,1,wrong));
  const restored=await operation(right,a,{op:'state',childId:resume.child});
  assert.deepEqual(restored.view.current,partial.view.current);
  const otherView=await operation(left,b,{op:'state',childId:resume.child});
  assert.equal(JSON.stringify(otherView).includes(wrong),false);
  assert.equal(JSON.stringify(otherView).includes(resume.game.answers[0].word),false);

  const f=await fixture(real),word=f.game.answers[0].word;
  await assert.rejects(()=>operation(right,outsider,{op:'state',childId:f.child}),/not_authorized/);
  const before=await operation(left,a,{op:'state',childId:f.child});
  assert.equal(JSON.stringify(before).includes(word),false);
  const first=body(f.child,before.revision,before.segment,word),second=body(f.child,before.revision,before.segment,word);
  const [raceA,raceB]=barrierPair();
  const results=await Promise.all([operation(raceA,a,first),operation(raceB,b,second)]);
  const waiting=results.find(result=>result.view.current?.waiting),revealed=results.find(result=>result.view.round===2);
  assert(waiting&&revealed);assert.equal(waiting.view.ownResult.answer,word);
  assert.equal(revealed.view.revealed[0].own.answer,word);
  const expectedAward=Math.round(1000*[80,100,120,140,160][f.game.answers[0].difficulty-1]/100);
  assert.equal(revealed.view.ownScore,expectedAward);assert.equal(revealed.view.opponentScore,expectedAward);
  let state=await operation(left,a,{op:'state',childId:f.child});
  assert.equal(state.segment,before.segment+1);assert.equal(state.revision,before.revision+2);
  assert.equal((await stats(f.match,f.child)).receipts,2);
  await Promise.all([operation(left,a,first),operation(right,b,second)]);
  assert.equal((await stats(f.match,f.child)).receipts,2);
  const after=await operation(left,a,{op:'state',childId:f.child});
  assert.equal(after.revision,state.revision);assert.equal(after.segment,state.segment);
  for(let i=1;i<3;i++){
   state=await operation(left,a,{op:'state',childId:f.child});
   await operation(left,a,body(f.child,state.revision,state.segment,f.game.answers[i].word));
   state=await operation(right,b,{op:'state',childId:f.child});
   await operation(right,b,body(f.child,state.revision,state.segment,f.game.answers[i].word));
  }
  state=await operation(left,a,{op:'state',childId:f.child});assert.equal(state.terminal,true);
  const final=await stats(f.match,f.child);assert.equal(final.receipts,6);assert.equal(final.outcomes,1);assert.equal(final.settlements,1);
  await operation(left,a,first);
  await assert.rejects(()=>operation(left,a,{...first,intent:{type:'guess',word:word==='STONE'?'BREAD':'STONE'}}),/request_conflict/);
  assert.deepEqual(await stats(f.match,f.child),final);
  assert.equal(await query(db,'SELECT count(*)::int value FROM public.session_player_snapshots WHERE game_id=$1',[f.match]),2);
  console.log(`PASS ${real?'real':'fake'} concurrent submissions, sealing, one unlock, replay and tie settlement`,final);

  const deadline=await fixture(real);
  let revision=1,segment=1,lastAccepted;
  for(let i=0;i<3;i++){
   lastAccepted=body(deadline.child,revision,segment,deadline.game.answers[i].word);
   const v=await operation(left,a,lastAccepted);revision=v.revision;segment=v.segment;
   if(i<2){const w=await operation(right,b,body(deadline.child,revision,segment,deadline.game.answers[i].word));revision=w.revision;segment=w.segment;}
  }
  const finalCommand=body(deadline.child,revision,segment,deadline.game.answers[2].word);
  let loaded,proceed;
  const loadedGate=new Promise(resolveLoaded=>{loaded=resolveLoaded;});
  const proceedGate=new Promise(resolveProceed=>{proceed=resolveProceed;});
  const delayedRpc=async(name,args)=>{
   const result=await left(name,args);
   if(name==='delayed_five_alive_load'){loaded();await proceedGate;}
   return result;
  };
  const submission=operation(delayedRpc,b,finalCommand);
  await loadedGate;
  await peer.query("UPDATE private.delayed_children SET available_at=t-interval '36 hours',last_call_at=t-interval '12 hours',expires_at=t FROM (SELECT clock_timestamp()-interval '1 second' t) q WHERE id=$1",[deadline.child]);
  const expiry=await query(peer,'SELECT expires_at::text value FROM private.delayed_children WHERE id=$1',[deadline.child]);
  const expiryAttempt=query(peer,'SELECT private.delayed_expire($1,$2,$3) value',[deadline.child,segment,expiry]);
  proceed();
  const [submissionResult]=await Promise.allSettled([submission,expiryAttempt]);
  assert.equal(submissionResult.status,'rejected');assert.match(String(submissionResult.reason),/delayed:(deadline|stale_action)/);
  const expired=await query(db,'SELECT row_to_json(o) value FROM private.delayed_outcomes o WHERE child_id=$1',[deadline.child]);
  assert.equal(expired.reason,'timeout_forfeit');assert.equal(expired.winner,a);
  const settled=await stats(deadline.match,deadline.child);assert.equal(settled.receipts,5);assert.equal(settled.outcomes,1);assert.equal(settled.settlements,1);
  assert.equal(await query(peer,'SELECT private.delayed_expire($1,$2,$3) value',[deadline.child,segment,expiry]),false);
  await operation(left,a,lastAccepted);
  assert.deepEqual(await stats(deadline.match,deadline.child),settled);
  const balances=(await db.query('SELECT user_id,chips FROM public.players WHERE game_id=$1',[deadline.match])).rows;
  assert.equal(Number(balances.find(row=>row.user_id===a).chips),9);assert.equal(Number(balances.find(row=>row.user_id===b).chips),-9);
  assert.equal(settled.batches,1);assert.equal(settled.transactions,real?2:0);
  console.log(`PASS ${real?'real':'fake'} final submission versus expired deadline, forfeit and replay`,settled);

  const completes=await fixture(real);
  revision=1;segment=1;
  for(let i=0;i<3;i++){
   const v=await operation(left,a,body(completes.child,revision,segment,completes.game.answers[i].word));revision=v.revision;segment=v.segment;
   if(i<2){const w=await operation(right,b,body(completes.child,revision,segment,completes.game.answers[i].word));revision=w.revision;segment=w.segment;}
  }
  const validExpiry=await query(peer,'SELECT expires_at::text value FROM private.delayed_children WHERE id=$1',[completes.child]);
  const finish=body(completes.child,revision,segment,completes.game.answers[2].word);
  const [finished,earlyExpiry]=await Promise.all([operation(left,b,finish),query(peer,'SELECT private.delayed_expire($1,$2,$3) value',[completes.child,segment,validExpiry])]);
  assert.equal(finished.terminal,true);assert.equal(earlyExpiry,false);
  const finishStats=await stats(completes.match,completes.child);assert.equal(finishStats.receipts,6);assert.equal(finishStats.outcomes,1);assert.equal(finishStats.settlements,1);
  await operation(right,b,finish);assert.deepEqual(await stats(completes.match,completes.child),finishStats);
  console.log(`PASS ${real?'real':'fake'} final submission before expiry and expiry/replay`,finishStats);

  const draw=await fixture(real);
  await db.query("UPDATE private.delayed_children SET available_at=t-interval '36 hours',last_call_at=t-interval '12 hours',expires_at=t FROM (SELECT clock_timestamp()-interval '1 second' t) q WHERE id=$1",[draw.child]);
  const drawExpiry=await query(db,'SELECT expires_at::text value FROM private.delayed_children WHERE id=$1',[draw.child]);
  const expiration=await Promise.all([query(db,'SELECT private.delayed_expire($1,1,$2) value',[draw.child,drawExpiry]),query(peer,'SELECT private.delayed_expire($1,1,$2) value',[draw.child,drawExpiry])]);
  assert.deepEqual(expiration.sort(),[false,true]);
  const drawn=await query(db,'SELECT row_to_json(o) value FROM private.delayed_outcomes o WHERE child_id=$1',[draw.child]);
  assert.equal(drawn.reason,'draw');assert.equal(drawn.winner,null);
  const drawStats=await stats(draw.match,draw.child);assert.equal(drawStats.outcomes,1);assert.equal(drawStats.settlements,1);assert.equal(drawStats.receipts,0);
  console.log(`PASS ${real?'real':'fake'} simultaneous double-timeout draw and replay`,drawStats);

  const recovery=await fixture(real);
  await operation(left,a,body(recovery.child,1,1,recovery.game.answers[0].word));
  await db.query("UPDATE private.delayed_children SET available_at=t-interval '36 hours',last_call_at=t-interval '12 hours',expires_at=t FROM (SELECT clock_timestamp()-interval '1 second' t) q WHERE id=$1",[recovery.child]);
  await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
  await db.query('SELECT private.delayed_words_recover_local()');
  const recovered=await query(db,'SELECT row_to_json(o) value FROM private.delayed_outcomes o WHERE child_id=$1',[recovery.child]);
  assert.equal(recovered.reason,'timeout_forfeit');assert.equal(recovered.winner,a);
  const recoveredStats=await stats(recovery.match,recovery.child);assert.equal(recoveredStats.outcomes,1);assert.equal(recoveredStats.settlements,1);
  assert.equal(recoveredStats.batches,1);assert.equal(recoveredStats.transactions,real?2:0);
  await db.query('SELECT private.delayed_words_recover_local()');assert.deepEqual(await stats(recovery.match,recovery.child),recoveredStats);
  console.log(`PASS ${real?'real':'fake'} zero-client expiry recovery and replay`);
 }
 const start=await arcade(left,a,{op:'start',requestId:randomUUID()});
 const privateRun=await query(db,'SELECT state value FROM private.arcade_runs WHERE id=$1',[start.id]);
 const bad=privateRun.rounds[0].answer==='STONE'?'BREAD':'STONE';
 const action=(snapshot,word)=>({op:'action',runId:start.id,requestId:randomUUID(),revision:snapshot.revision,roundId:snapshot.view.roundId,intent:{type:'guess',word}});
 let run=await arcade(left,a,action(start,bad));
 const resumed=await arcade(right,a,{op:'state',runId:start.id});
 assert.deepEqual(resumed.view.current,run.view.current);
 assert.equal(JSON.stringify(resumed).includes(privateRun.rounds[0].answer),false);
 for(const round of privateRun.rounds)run=await arcade(left,a,action(run,round.answer));
 assert.equal(run.status,'completed');assert.equal(run.view.revealed.length,3);
 assert.equal(await query(db,'SELECT count(*)::int value FROM private.arcade_results WHERE run_id=$1',[start.id]),1);
 const board=await left('arcade_leaderboard',{p_actor:a,p_game:'five-alive',p_window:'all',p_result:start.id});
 assert.equal(board.latestResult.score,run.score);assert(board.rows.some(row=>row.runId===start.id));
 console.log('PASS Arcade private unfinished word, reconnect and three-word result');
}finally{
 if(vite)await vite.close();
 if(guard){await guard.query('ROLLBACK');await guard.end();}
 if(peer)await peer.end();
 if(db)await db.end();
 if(created)await admin.query(`DROP DATABASE ${database}`);
 await admin.end();
}
