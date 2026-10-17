import {connect,context} from './database.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID as uuid} from 'node:crypto';
import assert from 'node:assert/strict';
const {database}=await context(),c=await connect(database),passed=[];
const sql=(await Promise.all(['rules','multiplayer','arcade','arcade-registration'].map(n=>readFile(`supabase/eleven-up/${n}.sql`,'utf8')))).join('\n');
const q=async(s,a=[])=>(await c.query(s,a)).rows[0]?.v;
const pass=s=>{passed.push(s);console.log('PASS',s);};
async function rejects(fn,pattern){await c.query('SAVEPOINT expected');try{await assert.rejects(fn,pattern);}finally{await c.query('ROLLBACK TO expected');await c.query('RELEASE expected');}}
async function actor(user,fn){await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);await c.query('SET LOCAL ROLE authenticated');try{return await fn();}finally{await c.query('RESET ROLE').catch(()=>{});}}
async function fixture(n=2){
 const f={game:uuid(),users:Array.from({length:n},()=>uuid()),players:Array.from({length:n},()=>uuid()),deadline:new Date(Date.now()+600000).toISOString()};
 await c.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',false,$2,$3,0,false,false)",[f.game,n,f.deadline]);
 for(let i=0;i<n;i++){await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true)',[f.users[i],'11 Proof '+f.users[i].slice(0,8)]);await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[f.players[i],f.game,f.users[i],n-i]);}
 const setup=()=>q("SELECT public.eleven_up_configure($1,$2,$3,'eleven-up','{\"ante_amount\":5}',$4) v",[f.game,f.players[0],n,f.deadline]);
 const r=await actor(f.users[0],setup);f.dealer=r.dealer_game.id;assert.equal((await actor(f.users[0],setup)).deduped,true);return f;
}
async function proof(){
 await c.query('UPDATE private.eleven_up_release SET enabled=true,admission_enabled=true');
 const rules=await q('SELECT private.eleven_up_rules() v');
 const fresh=await q("SELECT private.eleven_up_board_deal(jsonb_build_object('rules',private.eleven_up_rules(),'score',0),1000) v");
 assert.equal(fresh.slots.length,22);assert.equal(new Set(fresh.deck).size,52);assert.equal(fresh.current,fresh.deck[22]);assert.equal(fresh.deadline,3500);
 assert.deepEqual(await q("SELECT jsonb_object_agg(v,n) v FROM(SELECT private.eleven_up_value(i) v,count(*) n FROM generate_series(0,51) i GROUP BY 1)t"),{'1':16,'2':4,'3':4,'4':4,'5':4,'6':4,'7':4,'8':4,'9':4,'10':4});
 const reduce=(b,a,items,at)=>q('SELECT private.eleven_up_board_reduce($1,$2,$3,$4) v',[b,a,items,at]);
 const ready=await reduce(fresh,'tick',null,3500);assert.equal(ready.deadline,33500);
 await rejects(()=>reduce(ready,'group',[ready.slots[0],ready.slots[8]],4000),/covered|sum/);
 assert.equal(ready.phase,'ready');
 const board={...ready,slots:Array(22).fill(null),current:48,cursor:52,score:0};board.slots[8]=16;board.slots[17]=20;board.slots[21]=32; // 2+3+6
 let result=await reduce(board,'group',[16,20,32],4000);
 assert.equal(result.phase,'stage_complete');assert.equal(result.result.groupBonus,1000);assert.equal(result.result.clearBonus,10000);assert.equal(result.result.timeBonus,5000);assert.equal(result.result.stockBonus,1000);assert.equal(result.score,17600);assert.equal(result.deadline,12000);
 await rejects(()=>reduce(board,'group',[16,16,32],4000),/invalid_group/);
 const projection=await q('SELECT private.eleven_up_visible($1) v',[fresh]);assert(!('deck'in projection));assert(!('cursor'in projection));assert.equal(projection.slots.length,22);assert.equal(projection.stockRemaining,30);assert.deepEqual(projection.exposed,[8,17,21]);
 pass('Distribution, layout/exposure, 3-ball group, no hidden stock, all-clear bonuses and 3s + 5s hold');
 let b={...board,slots:[...board.slots],score:50,current:0};b.slots[8]=48;b.slots[17]=40;b.slots[21]=44;
 b=await reduce(b,'pass',null,4000);assert.equal(b.score,0);assert.equal(b.current,null);assert.equal(b.slots[18],0);assert.equal(b.startedAt,4000);assert.equal(b.deadline,124000);
 const fullPass=await reduce(ready,'pass',null,4000);assert.deepEqual(fullPass.slots,ready.slots);assert.equal(fullPass.current,ready.deck[23]);assert.equal(fullPass.score,0);assert.equal(fullPass.deadline,124000);
 await rejects(()=>reduce({...board,slots:ready.slots,cursor:52},'pass',null,4000),/pass_unavailable/);
 const drawGroup={...board,current:0,slots:Array(22).fill(null)};drawGroup.slots[8]=48;drawGroup.slots[17]=40;
 const dg=await reduce(drawGroup,'group',[48,0],4000);assert.equal(dg.current,null);assert.equal(dg.groups,1);assert(dg.score>=600); // draw uses prospective top side destination (500), plus row100
 const playing={...board,phase:'playing',startedAt:4000,deadline:124000,score:600,groups:1};
 assert.equal((await reduce(playing,'take_score',null,6400)).result.timeBonus,4900);
 assert.equal((await reduce(playing,'tick',null,124000)).result.timeBonus,0);
 assert.equal((await reduce(ready,'tick',null,999999)).result.completedAt,33500);
 pass('Pass order, penalty floor, last-stock placement, current participation, speed steps and deadline precedence');
 for(const [scores,expected] of [[[100,0],[105,95]],[[100,100],[100,100]],[[100,100,0],[103,102,95]]]){
  const f=await fixture(scores.length);const state=await q('SELECT state v FROM private.eleven_up_matches WHERE dealer_game_id=$1',[f.dealer]);
  const totals=Object.fromEntries(f.players.map((p,i)=>[p,scores[i]]));
  await c.query("UPDATE private.eleven_up_matches SET state=state||jsonb_build_object('phase','complete','scores',$2::jsonb,'turnIndex',jsonb_array_length(state->'players')) WHERE dealer_game_id=$1",[f.dealer,totals]);
  await c.query('SELECT private.eleven_up_settle($1)',[f.dealer]);await c.query('SELECT private.eleven_up_settle($1)',[f.dealer]);
  // Commit-time canonical journal must be exercised inside this rollback proof.
  await c.query('SET CONSTRAINTS ALL IMMEDIATE');
  const chips=(await c.query('SELECT chips FROM public.players WHERE game_id=$1 ORDER BY position DESC',[f.game])).rows.map(x=>x.chips);
  if(scores.length===3){assert.deepEqual([...chips].sort((a,b)=>a-b),[95,102,103]);}else assert.deepEqual(chips,expected);
  assert.equal(await q('SELECT count(*)::int v FROM public.game_results WHERE dealer_game_id=$1',[f.dealer]),1);
  assert.equal(await q('SELECT count(*)::int v FROM public.session_player_snapshots WHERE dealer_game_id=$1',[f.dealer]),scores.length);
  assert.equal(await q('SELECT count(*)::int v FROM public.session_player_snapshots s JOIN public.players p ON p.id=s.player_id WHERE s.dealer_game_id=$1 AND s.chips<>p.chips',[f.dealer]),0);
  const batch=await q('SELECT to_jsonb(b) v FROM public.gameplay_transfer_batches b WHERE dealer_game_id=$1',[f.dealer]);
  if(scores.every(x=>x===scores[0]))assert.equal(batch,undefined);else{assert(batch.transfers.length>0);assert(batch.transfers.every(t=>t.from.kind==='player'&&t.to.kind==='player'&&t.amount>0));}
  if(batch)assert.deepEqual(batch.unmatched_deltas,{});
  await c.query('SET CONSTRAINTS ALL DEFERRED');
  assert.equal(await q('SELECT sum(chips)::int v FROM public.players WHERE game_id=$1',[f.game]),100*scores.length);
  await actor(f.users[0],()=>q('SELECT public.eleven_up_close($1) v',[f.dealer]));await actor(f.users[0],()=>q('SELECT public.eleven_up_close($1) v',[f.dealer]));
  assert.equal(await q('SELECT finished v FROM private.eleven_up_matches WHERE dealer_game_id=$1',[f.dealer]),true);
 }
 pass('Actual canonical chip movement, winner/mixed tie/all tie, immutable single settlement and replay-safe continuation');
 const f=await fixture();let m=(await c.query('SELECT * FROM private.eleven_up_matches WHERE dealer_game_id=$1',[f.dealer])).rows[0];
 const active=m.state.players[m.state.turnIndex],user=active.userId;
 await c.query("UPDATE private.eleven_up_matches SET state=state||$2::jsonb WHERE dealer_game_id=$1",[f.dealer,{...board,phase:'ready',deadline:Date.now()+30000,players:m.state.players,identity:m.state.identity,turnIndex:0,stage:1,scores:m.state.scores,stages:[],rules}]);
 const request=uuid(),call=(items=[16,20,32],rev=0)=>actor(user,()=>q("SELECT public.eleven_up_action($1,$2,$3,'group',$4) v",[f.dealer,request,rev,items]));
 const first=await call();assert.equal(first.phase,'stage_complete');assert.equal((await call()).revision,first.revision);
 await rejects(()=>call([16,20]),/replay_conflict/);
 await rejects(()=>actor(user,()=>q("SELECT public.eleven_up_action($1,$2,0,'take_score',NULL) v",[f.dealer,uuid()])),/stale_revision/);
 await rejects(()=>actor(uuid(),()=>q('SELECT public.eleven_up_snapshot($1) v',[f.dealer])),/membership_required/);
 await c.query("UPDATE private.eleven_up_matches SET state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)) WHERE dealer_game_id=$1",[f.dealer,Date.now()-1000000]);
 await c.query('SELECT private.eleven_up_recover()');
 assert.equal(await q('SELECT state->>\'phase\' v FROM private.eleven_up_matches WHERE dealer_game_id=$1',[f.dealer]),'complete');
 assert.equal((await call()).phase,'complete');
 pass('Authenticated command receipts, conflicting/late replay, stale revision, outsider rejection, zero-client catch-up');
 // Arcade goes through its existing immutable commit/results owner, not a private imitation.
 const before=await q("SELECT jsonb_build_array((SELECT count(*) FROM public.games),(SELECT count(*) FROM public.players),(SELECT count(*) FROM public.game_results),(SELECT count(*) FROM public.gameplay_transfer_batches)) v");
 const u=uuid();await c.query("INSERT INTO auth.users(id) VALUES($1)",[u]);await c.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,'Solo Eleven',true) ON CONFLICT(id) DO UPDATE SET is_active=true",[u]);
 await c.query("UPDATE private.arcade_rulesets SET enabled=true WHERE id='eleven-up/1'");await c.query("UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL");
 const run=await q("SELECT public.arcade_start($1,$2,'eleven-up') v",[u,uuid()]);let a=await q('SELECT public.arcade_eleven_step($1,$2) v',[u,run.id]);
 assert.equal(a.projection.view.phase,'intro');assert(!JSON.stringify(a.projection).includes('"deck"'));
 // An initialized 2-round past run exercises persisted-deadline catch-up and real commit.
 await c.query("UPDATE private.arcade_runs SET state=jsonb_set(state,'{board,deadline}',to_jsonb($2::bigint)) WHERE id=$1",[run.id,Date.now()-1000000]);
 a=await q('SELECT public.arcade_eleven_step($1,$2) v',[u,run.id]);assert.equal(a.record.status,'completed');assert.equal(a.record.state.results.length,2);
 assert.equal(await q('SELECT count(*)::int v FROM private.arcade_results WHERE run_id=$1',[run.id]),1);
 assert.equal((await q('SELECT public.arcade_eleven_step($1,$2) v',[u,run.id])).record.revision,a.record.revision);
 await rejects(()=>q('SELECT public.arcade_eleven_step($1,$2) v',[uuid(),run.id]),/forbidden|not_found/);
 assert.deepEqual(await q("SELECT jsonb_build_array((SELECT count(*) FROM public.games),(SELECT count(*) FROM public.players),(SELECT count(*) FROM public.game_results),(SELECT count(*) FROM public.gameplay_transfer_batches)) v"),before);
 pass('Arcade immutable completion, replay, ownership, two-round recovery and zero multiplayer/financial writes');
}
try{
 const existing=await q("SELECT to_regclass('private.eleven_up_matches') v");
 const mp=await readFile('supabase/eleven-up/multiplayer.sql','utf8'),start=mp.indexOf('CREATE FUNCTION public.eleven_up_snapshot'),snapshot=mp.slice(start,mp.indexOf('END $$;',start)+7).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
 const candidate=existing?(await readFile('supabase/eleven-up/rules.sql','utf8')).replaceAll('CREATE FUNCTION','CREATE OR REPLACE FUNCTION')+'\n'+await readFile('supabase/eleven-up/arcade.sql','utf8')+'\n'+snapshot:sql;
 await c.query('BEGIN');await c.query(candidate);await proof();await c.query('ROLLBACK');
 if(!existing)assert.equal(await q("SELECT to_regclass('private.eleven_up_matches') v"),null);
 console.log('Candidate proof rolled back');
 if(process.argv.includes('--install-local')){await c.query('BEGIN');await c.query(candidate);await c.query('COMMIT');await c.query('BEGIN');await proof();await c.query('ROLLBACK');console.log('Installed local candidate proof rolled back');}
 await writeFile('qualification.local/eleven-up/proof.json',JSON.stringify({database,passed,productionWrites:0},null,2));
}finally{await c.query('ROLLBACK');await c.end();}
