import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {connect} from '../async-words/local.mjs';

// Disposable clone only. Rollback contains DDL, users, matches and settlement.
const db=await connect('five_alive_async_candidate');
const vite=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,entries:[]}});
const rpc=async(name,args)=>{const keys=Object.keys(args);return (await db.query('SELECT public.'+name+'('+keys.map((key,i)=>key+'=> $'+(i+1)).join(',')+') value',Object.values(args))).rows[0].value;};
try{
 await db.query('BEGIN');
 // Upgrade only this old fixture's expiry definition to the version observed in production.
 const migration=readFileSync('supabase/migrations/20261106150725_async_words_play_clock.sql','utf8');
 const begin=migration.indexOf('CREATE OR REPLACE FUNCTION private.delayed_expire'),end=migration.indexOf('$function$;',begin)+11;
 await db.query(migration.slice(begin,end));
 await db.query(readFileSync('supabase/five-alive/pool.sql','utf8'));
 await db.query(readFileSync('supabase/five-alive/arcade.sql','utf8'));
 await db.query(readFileSync('supabase/five-alive/async.sql','utf8'));
 await db.query(readFileSync('supabase/five-alive/notifications.sql','utf8'));
 // The fixture predates installed Originals admission; restore the observed
 // production constraint before applying the source-guarded candidate.
 await db.query('ALTER TABLE private.delayed_children DROP CONSTRAINT delayed_children_game_type_check');
 await db.query("ALTER TABLE private.delayed_children ADD CONSTRAINT delayed_children_game_type_check CHECK(game_type IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown'))");
 await db.query(readFileSync('supabase/five-alive/registration.sql','utf8'));
 const words=readFileSync('server/fiveAlive/answers.reviewed.txt','utf8').split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>line.split(' '));
 await db.query("INSERT INTO private.five_alive_answers(version,word,difficulty) SELECT 'esdb-five-alive/1',word,tier::int FROM unnest($1::text[],$2::text[]) x(word,tier)",[words.map(row=>row[0]),words.map(row=>row[1])]);
 await db.query("INSERT INTO private.five_alive_pool(version) VALUES('esdb-five-alive/1')");
 await db.query('UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()');
 await db.query('UPDATE private.delayed_recovery_state SET enabled=true');
 const a=randomUUID(),b=randomUUID(),outsider=randomUUID();
 await db.query('INSERT INTO auth.users(id) VALUES($1),($2),($3)',[a,b,outsider]);
 await db.query('UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=ANY($1::uuid[])',[[a,b,outsider]]);
 await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,'Five Alive A',true),($2,'Five Alive B',true),($3,'Five Alive outsider',true) ON CONFLICT(id) DO UPDATE SET is_active=true",[a,b,outsider]);
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[a]);
 await db.query('SAVEPOINT closed_admission');
 await assert.rejects(()=>db.query("SELECT public.delayed_create($1,$2,false,$3::jsonb)",[randomUUID(),b,JSON.stringify([{game:'five-alive',stake:9}])]),/admission_closed/);
 await db.query('ROLLBACK TO SAVEPOINT closed_admission');
 await db.query('UPDATE private.five_alive_release SET async_enabled=true');
 const parent=(await db.query("SELECT public.delayed_create($1,$2,false,$3::jsonb) id",[randomUUID(),b,JSON.stringify([{game:'five-alive',stake:9}])])).rows[0].id;
 const hash=(await db.query('SELECT offer_hash FROM private.delayed_matches WHERE id=$1',[parent])).rows[0].offer_hash;
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[b]);
 await db.query("SELECT public.delayed_respond($1,$2,$3,'accept')",[parent,randomUUID(),hash]);
 const child=(await db.query('SELECT id FROM private.delayed_children WHERE match_id=$1',[parent])).rows[0].id;
 const home=(await db.query('SELECT public.delayed_home($1) value',[parent])).rows[0].value;
 assert.equal(home.lineup[0].playable,true);assert.equal(home.lineup[0].opponentPlayable,true);
 assert.equal((await db.query("SELECT count(*)::int n FROM public.platform_notifications WHERE match_id=$1 AND kind='turn' AND actionable",[parent])).rows[0].n,2);
 const {fiveAliveAsyncOperation}=await vite.ssrLoadModule('/server/fiveAlive/async.ts');
 const initial=await fiveAliveAsyncOperation(rpc,a,{op:'state',childId:child});
 const secret=(await db.query('SELECT state FROM private.delayed_children WHERE id=$1',[child])).rows[0].state.fiveAlive;
 for(const answer of secret.answers)assert.equal(JSON.stringify(initial).includes(answer.word),false);
 await db.query('SAVEPOINT outsider');
 await assert.rejects(()=>fiveAliveAsyncOperation(rpc,outsider,{op:'state',childId:child}),/not_authorized/);
 await db.query('ROLLBACK TO SAVEPOINT outsider');
 let revision=initial.revision,segment=initial.segment,last;
 for(const answer of secret.answers){
  const first={op:'action',childId:child,requestId:randomUUID(),revision,segment,intent:{type:'guess',word:answer.word}};
  const firstView=await fiveAliveAsyncOperation(rpc,a,first);revision=firstView.revision;segment=firstView.segment;
  assert.deepEqual(firstView.view.current,{completed:true,waiting:true});
  assert.equal(firstView.view.ownResult.answer,answer.word);
  const waitingHome=(await db.query('SELECT public.delayed_home($1) value',[parent])).rows[0].value;
  assert.equal(waitingHome.lineup[0].scores[a],firstView.view.ownScore);
  assert.equal(waitingHome.lineup[0].scores[b],firstView.view.opponentScore);
  const notices=(await db.query("SELECT user_id,actionable FROM public.platform_notifications WHERE match_id=$1 AND kind='turn'",[parent])).rows;
  assert.equal(notices.find(row=>row.user_id===a).actionable,false);
  assert.equal(notices.find(row=>row.user_id===b).actionable,true);
  if(firstView.view.round===1){
   const saved=(await db.query('SELECT available_at::text,last_call_at::text,expires_at::text FROM private.delayed_children WHERE id=$1',[child])).rows[0];
   await db.query("UPDATE private.delayed_children SET available_at=t-interval '25 hours',last_call_at=t-interval '1 hour',expires_at=t+interval '11 hours' FROM (SELECT clock_timestamp() t) q WHERE id=$1",[child]);
   await db.query('SELECT private.delayed_notify($1)',[parent]);
   const lastCall=(await db.query("SELECT actionable,payload FROM public.platform_notifications WHERE match_id=$1 AND user_id=$2 AND kind='turn'",[parent,b])).rows[0];
   assert.equal(lastCall.actionable,true);assert.equal(lastCall.payload.lastCall,true);
   await db.query('UPDATE private.delayed_children SET available_at=$2,last_call_at=$3,expires_at=$4 WHERE id=$1',[child,saved.available_at,saved.last_call_at,saved.expires_at]);
  }
  const other=await fiveAliveAsyncOperation(rpc,b,{op:'state',childId:child});
  assert.equal(JSON.stringify(other.view.current).includes(answer.word),false);
  const second={op:'action',childId:child,requestId:randomUUID(),revision,segment,intent:{type:'guess',word:answer.word}};
  const secondView=await fiveAliveAsyncOperation(rpc,b,second);revision=secondView.revision;segment=secondView.segment;last=second;
  const revealedHome=(await db.query('SELECT public.delayed_home($1) value',[parent])).rows[0].value;
  assert.equal(revealedHome.lineup[0].scores[a],secondView.view.opponentScore);
  assert.equal(revealedHome.lineup[0].scores[b],secondView.view.ownScore);
  if(!secondView.terminal)assert.equal((await db.query("SELECT count(*)::int n FROM public.platform_notifications WHERE match_id=$1 AND kind='turn' AND actionable",[parent])).rows[0].n,2);
 }
 const result=await fiveAliveAsyncOperation(rpc,b,{op:'state',childId:child});
 assert.equal(result.terminal,true);assert.equal(result.outcome.reason,'draw');
 assert.equal((await db.query('SELECT count(*)::int n FROM private.delayed_settlements WHERE match_id=$1',[parent])).rows[0].n,1);
 const replay=await fiveAliveAsyncOperation(rpc,b,last);assert.equal(replay.terminal,true);
 assert.equal((await db.query('SELECT count(*)::int n FROM private.delayed_settlements WHERE match_id=$1',[parent])).rows[0].n,1);
 for(const kind of ['one-missed','both-missed','normal-win']){
  const match=randomUUID(),item=randomUUID();
  await db.query("INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,status,offer,offer_hash) VALUES($1,$2,$3,false,'active','[{\"game\":\"five-alive\",\"stake\":9}]'::jsonb,'five-alive-expiry-proof')",[match,a,b]);
  await db.query("INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,starter,actor,segment,revision,available_at,last_call_at,expires_at,state) SELECT $1,$2,1,'five-alive',9,'{\"version\":\"five-alive/1\"}'::jsonb,$3,$3,1,1,t,t+interval '24 hours',t+interval '36 hours',private.five_alive_async_deal($1,$3,$4,'esdb-five-alive/1') FROM (SELECT clock_timestamp() t) q",[item,match,a,b]);
  if(kind==='normal-win'){
   const game=(await db.query("SELECT state->'fiveAlive' game FROM private.delayed_children WHERE id=$1",[item])).rows[0].game;
   let r=1,s=1;
   for(const answer of game.answers){
    let v=await fiveAliveAsyncOperation(rpc,a,{op:'action',childId:item,requestId:randomUUID(),revision:r,segment:s,intent:{type:'guess',word:answer.word}});r=v.revision;s=v.segment;
    v=await fiveAliveAsyncOperation(rpc,b,{op:'action',childId:item,requestId:randomUUID(),revision:r,segment:s,intent:{type:'guess',word:answer.word==='STONE'?'BREAD':'STONE'}});r=v.revision;s=v.segment;
    v=await fiveAliveAsyncOperation(rpc,b,{op:'action',childId:item,requestId:randomUUID(),revision:r,segment:s,intent:{type:'guess',word:answer.word}});r=v.revision;s=v.segment;
   }
  }else if(kind==='one-missed'){
   const word=(await db.query('SELECT state#>>\'{fiveAlive,answers,0,word}\' word FROM private.delayed_children WHERE id=$1',[item])).rows[0].word;
   await fiveAliveAsyncOperation(rpc,a,{op:'action',childId:item,requestId:randomUUID(),revision:1,segment:1,intent:{type:'guess',word}});
  }
  let current;
  if(kind!=='normal-win'){
   await db.query("UPDATE private.delayed_children SET available_at=t-interval '36 hours',last_call_at=t-interval '12 hours',expires_at=t FROM (SELECT clock_timestamp()-interval '1 second' t) q WHERE id=$1",[item]);
   current=(await db.query('SELECT segment,expires_at::text expires_at FROM private.delayed_children WHERE id=$1',[item])).rows[0];
   assert.equal((await db.query('SELECT private.delayed_expire($1,$2,$3) value',[item,current.segment,current.expires_at])).rows[0].value,true);
  }
  const outcome=(await db.query('SELECT reason,winner FROM private.delayed_outcomes WHERE child_id=$1',[item])).rows[0];
  assert.equal(outcome.reason,kind==='one-missed'?'timeout_forfeit':kind==='normal-win'?'normal':'draw');
  assert.equal(outcome.winner,kind==='both-missed'?null:a);
  const balances=(await db.query('SELECT user_id,chips FROM public.players WHERE game_id=$1 ORDER BY user_id',[match])).rows;
  assert.equal(balances.length,2);
  assert.equal(Number(balances.find(row=>row.user_id===a).chips),kind==='both-missed'?0:9);
  assert.equal(Number(balances.find(row=>row.user_id===b).chips),kind==='both-missed'?0:-9);
  assert.equal((await db.query('SELECT count(*)::int n FROM private.delayed_settlements WHERE match_id=$1',[match])).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM public.session_player_snapshots WHERE game_id=$1',[match])).rows[0].n,2);
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');
  assert.equal((await db.query('SELECT count(*)::int n FROM public.gameplay_transfer_batches WHERE game_id=$1',[match])).rows[0].n,kind==='both-missed'?0:1);
  await db.query('SET CONSTRAINTS ALL DEFERRED');
  if(current)assert.equal((await db.query('SELECT private.delayed_expire($1,$2,$3) value',[item,current.segment,current.expires_at])).rows[0].value,false);
 }
 await db.query('SET CONSTRAINTS ALL IMMEDIATE');
 console.log('PASS local async sealed projection, unlocks, canonical draw/timeout balances and replay');
}finally{await db.query('ROLLBACK');await db.end();await vite.close();}
