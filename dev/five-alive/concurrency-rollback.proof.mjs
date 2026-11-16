// Local-only interruption proof. Financial effects are observed inside independent
// transactions and rolled back; synthetic setup lives only in a dropped clone.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {connect} from '../async-words/local.mjs';

const template='coordinated_scores_1794288498120',database='five_alive_interruption_'+Date.now();
const admin=await connect('postgres');let db,left,right,guard,vite,created=false;
try{
 assert.equal((await admin.query('SELECT count(*)::int n FROM pg_stat_activity WHERE datname=$1',[template])).rows[0].n,0);
 await admin.query(`CREATE DATABASE ${database} TEMPLATE ${template}`);created=true;
 db=await connect(database);left=await connect(database);right=await connect(database);guard=await connect(database);
 await guard.query('BEGIN');await guard.query('SELECT id FROM private.delayed_matches FOR UPDATE');
 vite=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,entries:[]}});
 for(const file of ['pool','arcade','async','notifications','registration']){
  if(file==='registration'){
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
 const a=randomUUID(),b=randomUUID();
 await db.query('INSERT INTO auth.users(id) VALUES($1),($2)',[a,b]);
 await db.query('UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=ANY($1::uuid[])',[[a,b]]);
 await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,'FA interruption A',true),($2,'FA interruption B',true) ON CONFLICT(id) DO UPDATE SET is_active=true",[a,b]);
 const {fiveAliveAsyncOperation:operation}=await vite.ssrLoadModule('/server/fiveAlive/async.ts');
 const val=async(client,sql,args=[])=>(await client.query(sql,args)).rows[0]?.value;
 const rpc=client=>async(name,args)=>{
  await client.query('SET ROLE service_role');
  const value=await val(client,'SELECT public.'+name+'('+Object.keys(args).map((key,i)=>key+'=> $'+(i+1)).join(',')+') value',Object.values(args));
  await client.query('RESET ROLE');return value;
 };
 const adminRpc=rpc(db),rightRpc=rpc(right);
 let leftRpc=rpc(left);
 const query=async(sql,args=[])=>val(db,sql,args);
 async function fixture(real){
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[a]);
  const match=await query('SELECT public.delayed_create($1,$2,$3,$4::jsonb) value',[randomUUID(),b,real,JSON.stringify([{game:'five-alive',stake:7}])]);
  const hash=await query('SELECT offer_hash value FROM private.delayed_matches WHERE id=$1',[match]);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[b]);
  await db.query("SELECT public.delayed_respond($1,$2,$3,'accept')",[match,randomUUID(),hash]);
  await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
  const child=await query('SELECT id value FROM private.delayed_children WHERE match_id=$1',[match]);
  const game=await query("SELECT state->'fiveAlive' value FROM private.delayed_children WHERE id=$1",[child]);
  return {match,child,game};
 }
 const body=(child,revision,segment,word)=>({op:'action',childId:child,requestId:randomUUID(),revision,segment,intent:{type:'guess',word}});
 async function submit(user,child,word){const current=await operation(adminRpc,user,{op:'state',childId:child});const command=body(child,current.revision,current.segment,word);await operation(adminRpc,user,command);return command;}
 async function counts(client,f){return val(client,`SELECT jsonb_build_object('commands',(SELECT count(*) FROM private.delayed_commands WHERE child_id=$2),
  'outcomes',(SELECT count(*) FROM private.delayed_outcomes WHERE child_id=$2),'settlements',(SELECT count(*) FROM private.delayed_settlements WHERE match_id=$1),
  'games',(SELECT count(*) FROM public.games WHERE id=$1),'results',(SELECT count(*) FROM public.game_results WHERE game_id=$1),
  'snapshots',(SELECT count(*) FROM public.session_player_snapshots WHERE game_id=$1),'accounts',(SELECT count(*) FROM public.player_transactions WHERE source_game_id=$1),
  'batches',(SELECT count(*) FROM public.gameplay_transfer_batches WHERE game_id=$1)) value`,[f.match,f.child]);}
 async function settled(client,f,real){
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  const stats=await counts(client,f);assert.equal(stats.outcomes,1);assert.equal(stats.settlements,1);assert.equal(stats.games,1);assert.equal(stats.results,1);assert.equal(stats.snapshots,2);assert.equal(stats.batches,1);assert.equal(stats.accounts,real?2:0);
  const balances=(await client.query('SELECT user_id,chips FROM public.players WHERE game_id=$1',[f.match])).rows;
  assert.equal(Number(balances.find(row=>row.user_id===a).chips),7);assert.equal(Number(balances.find(row=>row.user_id===b).chips),-7);
  return stats;
 }
 let leftPid=await val(left,'SELECT pg_backend_pid() value');const rightPid=await val(right,'SELECT pg_backend_pid() value');
 async function disconnectLeft(){await left.end();left=await connect(database);leftRpc=rpc(left);leftPid=await val(left,'SELECT pg_backend_pid() value');}
 async function awaitBlocked(){
  for(let i=0;i<100;i++){
   if(await query('SELECT $1::int=ANY(pg_blocking_pids($2::int)) value',[leftPid,rightPid]))return;
   await new Promise(resolveDelay=>setTimeout(resolveDelay,20));
  }
  throw Error('independent connection never blocked behind the settlement lock');
 }
 for(const real of [false,true]){
  const f=await fixture(real);
  for(let i=0;i<3;i++){
   const word=f.game.answers[i].word,wrong=word==='STONE'?'BREAD':'STONE';
   await submit(a,f.child,word);await submit(b,f.child,wrong);
   if(i<2)await submit(b,f.child,word);
  }
  const current=await operation(adminRpc,b,{op:'state',childId:f.child}),last=body(f.child,current.revision,current.segment,f.game.answers[2].word);
  const before=await counts(db,f);
  await left.query('BEGIN');const first=await operation(leftRpc,b,last);assert.equal(first.terminal,true);const firstStats=await settled(left,f,real);
  assert.deepEqual(await counts(db,f),before);
  await right.query('BEGIN');const retry=operation(rightRpc,b,last);
  await awaitBlocked();await disconnectLeft();
  const second=await retry;assert.equal(second.terminal,true);assert.deepEqual(await settled(right,f,real),firstStats);
  const replay=await operation(rightRpc,b,last);assert.equal(replay.terminal,true);assert.deepEqual(await counts(right,f),firstStats);
  await right.query('ROLLBACK');assert.deepEqual(await counts(db,f),before);
  console.log(`PASS ${real?'real':'fake'} independent finalization: blocked rival, first transaction interruption, one replay-safe settlement and rollback`);

  const recovery=await fixture(real);await submit(a,recovery.child,recovery.game.answers[0].word);
  await db.query("UPDATE private.delayed_children SET available_at=t-interval '36 hours',last_call_at=t-interval '12 hours',expires_at=t FROM (SELECT clock_timestamp()-interval '1 second' t) q WHERE id=$1",[recovery.child]);
  const recoveryBefore=await counts(db,recovery);
  await left.query('BEGIN');await left.query('SELECT private.delayed_words_recover_local()');const interrupted=await settled(left,recovery,real);
  assert.deepEqual(await counts(db,recovery),recoveryBefore);
  await right.query('BEGIN');const skipped=right.query('SELECT private.delayed_words_recover_local()');
  await awaitBlocked();await disconnectLeft();await skipped;assert.deepEqual(await counts(right,recovery),recoveryBefore);
  await right.query('SELECT private.delayed_words_recover_local()');
  assert.deepEqual(await settled(right,recovery,real),interrupted);
  await right.query('SELECT private.delayed_words_recover_local()');assert.deepEqual(await counts(right,recovery),interrupted);
  await right.query('ROLLBACK');assert.deepEqual(await counts(db,recovery),recoveryBefore);
  await guard.query('SELECT id FROM private.delayed_matches WHERE id=$1 FOR UPDATE',[recovery.match]);
  console.log(`PASS ${real?'real':'fake'} zero-client worker interruption, locked-work skip, retry and rollback`);
 }
 console.log('LOCAL EVIDENCE ONLY: template financial triggers differ from current hosted schema; release gate remains missing.');
}finally{
 if(vite)await vite.close();
 for(const client of [left,right,guard])if(client){await client.query('ROLLBACK').catch(()=>{});await client.end();}
 if(db)await db.end();if(created)await admin.query(`DROP DATABASE ${database}`);await admin.end();
}
