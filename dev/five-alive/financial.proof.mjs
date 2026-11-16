// Run only in a disposable local clone. All candidate DDL and synthetic rows roll back.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {connect} from '../async-words/local.mjs';

const template='coordinated_scores_1794288498120',database='five_alive_financial_'+Date.now();
const admin=await connect('postgres');
let db,vite,created=false;
try{
 assert.equal((await admin.query('SELECT count(*)::int n FROM pg_stat_activity WHERE datname=$1',[template])).rows[0].n,0);
 await admin.query(`CREATE DATABASE ${database} TEMPLATE ${template}`);created=true;
 db=await connect(database);
 vite=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,entries:[]}});
 const baseline=(await db.query("SELECT (SELECT count(*) FROM public.players) players,(SELECT count(*) FROM public.player_transactions) tx,(SELECT count(*) FROM public.gameplay_transfer_batches) batches,(SELECT count(*) FROM public.session_player_snapshots) snapshots,(SELECT count(*) FROM auth.users) users")).rows[0];
 await db.query('BEGIN');
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
 const a=randomUUID(),b=randomUUID(),outsider=randomUUID();
 await db.query('INSERT INTO auth.users(id) VALUES($1),($2),($3)',[a,b,outsider]);
 await db.query('UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=ANY($1::uuid[])',[[a,b,outsider]]);
 await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,'FA rollback A',true),($2,'FA rollback B',true),($3,'FA rollback outsider',true) ON CONFLICT(id) DO UPDATE SET is_active=true",[a,b,outsider]);
 await db.query("CREATE FUNCTION pg_temp.fa_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.match_id::text=current_setting('fa.fail',true) THEN RAISE EXCEPTION 'fa:injected_after_finance'; END IF; RETURN NEW; END $$");
 await db.query('CREATE TRIGGER fa_failure BEFORE INSERT ON private.delayed_settlements FOR EACH ROW EXECUTE FUNCTION pg_temp.fa_fail()');
 const {fiveAliveAsyncOperation:operation}=await vite.ssrLoadModule('/server/fiveAlive/async.ts');
 const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value;
 const rpc=async(name,args)=>{
  await db.query('SET LOCAL ROLE service_role');
  const result=await value('SELECT public.'+name+'('+Object.keys(args).map((key,i)=>key+'=> $'+(i+1)).join(',')+') value',Object.values(args));
  await db.query('RESET ROLE');return result;
 };
 const login=async user=>db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user??'']);
 async function rejected(fn,pattern){
  await db.query('SAVEPOINT fa_reject');
  let error;try{await fn();}catch(e){error=e;}
  await db.query('ROLLBACK TO SAVEPOINT fa_reject');
  assert(error,`expected rejection ${pattern}`);assert.match(String(error),pattern);
 }
 async function fixture(real,count=1){
  await login(a);await db.query('SET LOCAL ROLE authenticated');
  const match=await value('SELECT public.delayed_create($1,$2,$3,$4::jsonb) value',[randomUUID(),b,real,JSON.stringify(Array.from({length:count},()=>({game:'five-alive',stake:7})))]);
  await db.query('RESET ROLE');
  const hash=await value('SELECT offer_hash value FROM private.delayed_matches WHERE id=$1',[match]);
  await login(b);await db.query('SET LOCAL ROLE authenticated');
  await db.query("SELECT public.delayed_respond($1,$2,$3,'accept')",[match,randomUUID(),hash]);
  await db.query('RESET ROLE');await login(null);
  const children=(await db.query('SELECT id FROM private.delayed_children WHERE match_id=$1 ORDER BY ordinal',[match])).rows.map(row=>row.id),child=children[0];
  const game=await value("SELECT state->'fiveAlive' value FROM private.delayed_children WHERE id=$1",[child]);
  return {match,child,children,game};
 }
 const body=(child,revision,segment,word)=>({op:'action',childId:child,requestId:randomUUID(),revision,segment,intent:{type:'guess',word}});
 async function state(user,child){return operation(rpc,user,{op:'state',childId:child});}
 async function submit(user,child,word){const current=await state(user,child),command=body(child,current.revision,current.segment,word);return {view:await operation(rpc,user,command),command};}
 async function verify(f,real,expected){
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');
  const opposite=expected===0?0:-expected;
  const receipt=await value('SELECT row_to_json(s) value FROM private.delayed_settlements s WHERE match_id=$1',[f.match]);
  assert(receipt);assert.equal(Number(receipt.organizer_delta),expected);assert.equal(Number(receipt.opponent_delta),opposite);
  const chips=(await db.query('SELECT id,user_id,chips FROM public.players WHERE game_id=$1',[f.match])).rows;
  assert.equal(chips.length,2);assert.equal(Number(chips.find(row=>row.user_id===a).chips),expected);assert.equal(Number(chips.find(row=>row.user_id===b).chips),opposite);
  const snapshots=(await db.query('SELECT user_id,chips FROM public.session_player_snapshots WHERE game_id=$1',[f.match])).rows;
  assert.equal(snapshots.length,2);assert.equal(Number(snapshots.find(row=>row.user_id===a).chips),expected);assert.equal(Number(snapshots.find(row=>row.user_id===b).chips),opposite);
  const tx=(await db.query("SELECT profile_id,amount FROM public.player_transactions WHERE source_game_id=$1 AND transaction_type='SessionResult'",[f.match])).rows;
  assert.equal(tx.length,real?2:0);
  if(real){assert.equal(Number(tx.find(row=>row.profile_id===a).amount),expected);assert.equal(Number(tx.find(row=>row.profile_id===b).amount),opposite);}
  const batches=(await db.query('SELECT unmatched_deltas,opening_balances,closing_balances,transfers FROM public.gameplay_transfer_batches WHERE game_id=$1',[f.match])).rows;
  assert.equal(batches.length,expected===0?0:1);
  if(batches.length){
   const batch=batches[0],winner=chips.find(row=>Number(row.chips)>0),loser=chips.find(row=>Number(row.chips)<0);
   assert.deepEqual(batch.unmatched_deltas,{});assert.equal(batch.transfers.length,1);
   assert.equal(batch.transfers[0].amount,7);assert.equal(batch.transfers[0].from.playerId,loser.id);assert.equal(batch.transfers[0].to.playerId,winner.id);
   for(const player of chips){assert.equal(Number(batch.opening_balances['player:'+player.id]),0);assert.equal(Number(batch.closing_balances['player:'+player.id]),Number(player.chips));}
  }
  assert.equal(await value('SELECT count(*)::int value FROM private.delayed_outcomes WHERE match_id=$1',[f.match]),f.children.length);
  assert.equal(await value('SELECT count(*)::int value FROM private.delayed_settlements WHERE match_id=$1',[f.match]),1);
  assert.equal(await value('SELECT count(*)::int value FROM public.game_results WHERE game_id=$1 AND id=$2',[f.match,receipt.result_id]),1);
  assert.equal(await value("SELECT status value FROM public.games WHERE id=$1",[f.match]),'session_ended');
  assert.equal(await value("SELECT status value FROM private.delayed_matches WHERE id=$1",[f.match]),'settled');
  assert.deepEqual(await value('SELECT private.delayed_finalize($1) value',[f.match]),receipt);
  await db.query('SET CONSTRAINTS ALL DEFERRED');
  return receipt;
 }
 for(const real of [false,true]){
  for(const kind of ['organizer-win','opponent-win','draw','injected-rollback']){
   const f=await fixture(real);let last;
   await rejected(()=>operation(rpc,outsider,{op:'state',childId:f.child}),/not_authorized/);
   if(kind==='organizer-win'){
    await rejected(()=>db.query('UPDATE private.delayed_children SET stake=8 WHERE id=$1',[f.child]),/frozen_child/);
    await rejected(()=>db.query('UPDATE private.delayed_matches SET real_money=NOT real_money WHERE id=$1',[f.match]),/frozen_offer/);
    await login(a);await db.query('SET LOCAL ROLE authenticated');
    await rejected(()=>db.query('SELECT private.delayed_finalize($1)',[f.match]),/permission denied/);
    await rejected(()=>db.query('SELECT public.delayed_five_alive_commit($1,$2,$3,1,1,$4,$5,NULL)',[f.child,a,randomUUID(),{},{}]),/permission denied/);
    await db.query('RESET ROLE');await login(null);
   }
   for(let i=0;i<3;i++){
    const word=f.game.answers[i].word,wrong=word==='STONE'?'BREAD':'STONE';
    if(kind==='opponent-win')await submit(a,f.child,wrong);
    await submit(a,f.child,word);
    if(kind==='organizer-win'||kind==='injected-rollback')await submit(b,f.child,wrong);
    if(kind==='injected-rollback'&&i===2){
     const current=await state(b,f.child);last=body(f.child,current.revision,current.segment,word);
     await db.query("SELECT set_config('fa.fail',$1,true)",[f.match]);
     await rejected(()=>operation(rpc,b,last),/fa:injected_after_finance/);
     for(const [table,column] of [['private.delayed_outcomes','match_id'],['private.delayed_settlements','match_id'],['public.games','id'],['public.player_transactions','source_game_id'],['public.session_player_snapshots','game_id'],['public.gameplay_transfer_batches','game_id']])assert.equal(await value(`SELECT count(*)::int value FROM ${table} WHERE ${column}=$1`,[f.match]),0,table);
     await db.query("SELECT set_config('fa.fail','',true)");
     await operation(rpc,b,last);
    }else last=(await submit(b,f.child,word)).command;
   }
   const expected=kind==='draw'?0:kind==='opponent-win'?-7:7;
   const receipt=await verify(f,real,expected);
   await operation(rpc,b,last);assert.deepEqual(await value('SELECT private.delayed_finalize($1) value',[f.match]),receipt);
   const next=await fixture(real);assert.notEqual(next.match,f.match);
   await operation(rpc,b,last);assert.equal(await value('SELECT count(*)::int value FROM public.games WHERE id=$1',[next.match]),0);
   console.log(`PASS ${real?'real':'fake'} ${kind}: exact balances, ledger, snapshots, replay and successor isolation`);
  }
  for(const kind of ['forfeit','both-timeout']){
   const f=await fixture(real);
   if(kind==='forfeit')await submit(a,f.child,f.game.answers[0].word);
   await db.query("UPDATE private.delayed_children SET available_at=t-interval '36 hours',last_call_at=t-interval '12 hours',expires_at=t FROM (SELECT clock_timestamp()-interval '1 second' t) q WHERE id=$1",[f.child]);
   const c=(await db.query('SELECT segment,expires_at::text expires FROM private.delayed_children WHERE id=$1',[f.child])).rows[0];
   assert.equal(await value('SELECT private.delayed_expire($1,$2,$3) value',[f.child,c.segment,c.expires]),true);
   assert.equal(await value('SELECT private.delayed_expire($1,$2,$3) value',[f.child,c.segment,c.expires]),false);
   const outcome=await value('SELECT row_to_json(o) value FROM private.delayed_outcomes o WHERE child_id=$1',[f.child]);
   assert.equal(outcome.reason,kind==='forfeit'?'timeout_forfeit':'draw');
   await verify(f,real,kind==='forfeit'?7:0);
   console.log(`PASS ${real?'real':'fake'} ${kind}: expiry, settlement and replay`);
  }
  const continuation=await fixture(real,2);
  let prior;
  for(let index=0;index<2;index++){
   const child=continuation.children[index],game=await value("SELECT state->'fiveAlive' value FROM private.delayed_children WHERE id=$1",[child]);
   for(const answer of game.answers){
    if(index===1)await submit(a,child,answer.word==='STONE'?'BREAD':'STONE');
    await submit(a,child,answer.word);
    if(index===0)await submit(b,child,answer.word==='STONE'?'BREAD':'STONE');
    prior=(await submit(b,child,answer.word)).command;
   }
   if(index===0){
    assert.equal(await value('SELECT count(*)::int value FROM private.delayed_settlements WHERE match_id=$1',[continuation.match]),0);
    const successorBefore=await state(a,continuation.children[1]);await operation(rpc,b,prior);
    assert.deepEqual(await state(a,continuation.children[1]),successorBefore);
   }
  }
  await verify(continuation,real,0);await operation(rpc,b,prior);
  console.log(`PASS ${real?'real':'fake'} two-game continuation, late replay and net settlement`);
  await login(a);await db.query('SET LOCAL ROLE authenticated');
  for(const stake of [0,10000,1.5])await rejected(()=>db.query('SELECT public.delayed_create($1,$2,$3,$4::jsonb)',[randomUUID(),b,real,JSON.stringify([{game:'five-alive',stake}])]),/invalid_child/);
  await rejected(()=>db.query('SELECT public.delayed_five_alive_load($1,$2,$3)',[randomUUID(),a,null]),/permission denied/);
  await db.query('RESET ROLE');await login(null);
 }
 await db.query('ROLLBACK');
 const after=(await db.query("SELECT (SELECT count(*) FROM public.players) players,(SELECT count(*) FROM public.player_transactions) tx,(SELECT count(*) FROM public.gameplay_transfer_batches) batches,(SELECT count(*) FROM public.session_player_snapshots) snapshots,(SELECT count(*) FROM auth.users) users")).rows[0];
 assert.deepEqual(after,baseline);
 console.log('PASS rollback left all canonical fixture counts unchanged');
}finally{
 if(db){await db.query('ROLLBACK').catch(()=>{});await db.end();}
 if(vite)await vite.close();
 if(created)await admin.query(`DROP DATABASE ${database}`);
 await admin.end();
}
