import pg from '../../../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const dir='qualification.local/farkle-audit-20261015/';
const opts=JSON.parse(readFileSync(dir+'local-db.json'));
if(opts.host!=='127.0.0.1'||!/^farkle_audit_empty_\d+$/.test(opts.database))throw Error('isolated loopback only');
const c=new pg.Client(opts);await c.connect();
const result={database:opts.database,productionWrites:0,cases:[],errors:[]};
const pass=(name,data={})=>{result.cases.push({name,status:'PASS',...data});console.log('PASS '+name);};
const scalar=async(sql,args=[],db=c)=>(await db.query(sql,args)).rows[0]?.v;
const identity=async(user,role='authenticated',db=c)=>{await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true),set_config('request.jwt.claims',$3,true)",[user??'',role,JSON.stringify({sub:user,role})]);};
const rpc=async(sql,args,user,db=c)=>{await identity(user,'authenticated',db);await db.query('SET LOCAL ROLE authenticated');const r=await scalar(sql,args,db);await db.query('RESET ROLE');return r;};
const actionSql='select public.farkle_apply_action($1,$2,$3,$4,$5,$6) v';
async function fixture(n=2,real=false,endgame='immediate',config={}){
 await c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 const game=randomUUID(),users=Array.from({length:n+1},randomUUID),players=Array.from({length:n},randomUUID),deadline=new Date(Date.now()+600000).toISOString();
 for(const u of users){await c.query('insert into auth.users(id) values($1)',[u]);await c.query("insert into profiles(id,username,is_active) values($1,$2,true)",[u,'Audit '+u.slice(0,8)]);}
 await c.query("insert into games(id,name,status,current_host,dealer_position,config_deadline,real_money,pot) values($1,'Isolated Farkle audit','configuring',$2,1,$3,$4,0)",[game,users[0],deadline,real]);
 for(let i=0;i<n;i++)await c.query("insert into players(id,game_id,user_id,position,chips,status,sitting_out,waiting,is_bot) values($1,$2,$3,$4,0,'active',false,false,false)",[players[i],game,users[i],i+1]);
 const setup=await rpc("select public.configure_dealer_game($1,$2,1,'farkle',$3,$4) v",[game,players[0],{ante_amount:5,targetScore:100,endgame,...config},deadline],users[0]);
 const dg=setup.dealer_game.id;
 for(let i=1;i<n;i++)await rpc("select public.submit_ante_decision($1,$2,$3,'ante_up') v",[game,dg,players[i]],users[i]);
 const r=(await c.query('select id,farkle_state from rounds where game_id=$1 and dealer_game_id=$2',[game,dg])).rows[0];
 assert.ok(r);return {game,users,players,dg,round:r.id};
}
async function read(f){return scalar('select farkle_state v from rounds where id=$1',[f.round]);}
async function balances(f){return scalar('select jsonb_object_agg(id,chips) v from players where game_id=$1',[f.game]);}
async function state(f){return scalar(`select jsonb_build_object('balances',(select jsonb_object_agg(id,chips) from players where game_id=$1),'round',(select farkle_state from rounds where id=$2),'roundStatus',(select status from rounds where id=$2),'status',(select status from games where id=$1),'results',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from game_results x where game_id=$1),'snapshots',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from session_player_snapshots x where game_id=$1),'batches',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from gameplay_transfer_batches x where game_id=$1),'pending',(select count(*) from gameplay_transfer_pending_changes where game_id=$1),'handoffs',(select count(*) from private.farkle_terminal_transfers_v2 where game_id=$1),'receipts',(select count(*) from private.farkle_action_receipts where round_id=$2),'events',(select count(*) from private.farkle_events where round_id=$2),'transactions',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from player_transactions t where source_game_id=$1)) v`,[f.game,f.round]);}
async function rejection(label,fn,pattern){await c.query('SAVEPOINT reject');let err;try{await fn();}catch(e){err=e;}await c.query('ROLLBACK TO SAVEPOINT reject');assert.ok(err,label+' must reject');if(pattern)assert.match(err.message,pattern);pass(label,{error:err.message});}
async function act(f,action,selection=[],request=randomUUID(),db=c){const s=await read(f);const p=s.currentTurnPlayerId;const u=f.users[f.players.indexOf(p)];return rpc(actionSql,[f.round,p,action,s.actionSequence,request,JSON.stringify(selection)],u,db);}
async function seed(f,s){await scalar("select private.farkle_claim_v1($1,$2,$3,'action') v",[f.game,f.dg,f.round]);await c.query('update rounds set farkle_state=$1 where id=$2',[s,f.round]);await c.query("select set_config('app.farkle_authority','',true)");}
async function caseRun(name,fn){await c.query('BEGIN');try{await fn();}catch(e){result.errors.push({case:name,message:e.message,where:e.where});console.error('CASE ERROR',name,e.message,e.where??'');}finally{await c.query('ROLLBACK');}}
async function finalArgs(f){for(let i=0;i<300;i++){
 const s=await read(f);assert.equal(s.gamePhase,'playing');
 if(s.stage==='bank_or_roll'){
  const next=await scalar("select private.farkle_reduce_v1($1,'bank','[]',NULL) v",[s]);
  if(next.gamePhase==='complete')return [f.round,s.currentTurnPlayerId,'bank',s.actionSequence,randomUUID(),'[]'];
  await act(f,'bank');
 }else if(s.stage==='hold'){
  const choice=s.legalHolds.reduce((a,b)=>b.points>a.points?b:a);await act(f,'hold',choice.indexes);
 }else await act(f,'roll');
 }throw Error('gameplay iteration limit');}
async function verify(f,label){await c.query('SET CONSTRAINTS ALL IMMEDIATE');const x=await state(f);const winner=x.round.winnerPlayerId;
 assert.equal(x.results.length,1);assert.equal(x.batches.length,1);assert.equal(x.roundStatus,'completed');assert.equal(x.pending,0);assert.equal(x.handoffs,0);
 const expected=Object.fromEntries(f.players.map(p=>[p,p===winner?5*(f.players.length-1):-5]));assert.deepEqual(x.balances,expected);assert.deepEqual(x.results[0].player_chip_changes,expected);assert.equal(x.results[0].dealer_game_id,f.dg);
 assert.deepEqual(Object.fromEntries(x.snapshots.map(s=>[s.player_id,s.chips])),expected);const batch=x.batches[0];assert.deepEqual(batch.unmatched_deltas,{});assert.equal(batch.dealer_game_id,f.dg);assert.equal(batch.transfers.length,f.players.length-1);
 for(const t of batch.transfers){assert.equal(t.amount,5);assert.equal(t.to.playerId,winner);assert.ok(f.players.includes(t.from.playerId));}
 assert.deepEqual(batch.opening_balances,Object.fromEntries(f.players.map(p=>['player:'+p,0])));assert.deepEqual(batch.closing_balances,Object.fromEntries(Object.entries(expected).map(([p,b])=>['player:'+p,b])));
 pass(label,{game:f.game,dealerGame:f.dg,round:f.round,winner,before:Object.fromEntries(f.players.map(p=>[p,0])),after:x.balances,transferBatch:batch,resultId:x.results[0].id,snapshotCount:x.snapshots.length});await c.query('SET CONSTRAINTS ALL DEFERRED');return x;
}
try{
 await c.query('BEGIN');const f=await fixture();pass('Canonical non-admin setup and ante start',{game:f.game,round:f.round});
 const args=await finalArgs(f);const user=f.users[f.players.indexOf(args[1])];const before=await state(f);
 for(const [label,table,timing] of [['result','public.game_results','BEFORE INSERT'],['snapshot','public.session_player_snapshots','BEFORE INSERT'],['terminal','public.games',"BEFORE UPDATE OF status"],['journal','public.gameplay_transfer_batches','BEFORE INSERT']]){
  await c.query('SAVEPOINT failure');await c.query(`CREATE OR REPLACE FUNCTION pg_temp.inject_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${label==='terminal'?"IF NEW.status NOT IN ('game_over','session_ended') THEN RETURN NEW; END IF;":''} RAISE EXCEPTION 'audit_injected_${label}'; END $$; CREATE TRIGGER audit_inject ${timing} ON ${table} FOR EACH ROW EXECUTE FUNCTION pg_temp.inject_failure()`);
  let error;try{await rpc(actionSql,args,user);await c.query('SET CONSTRAINTS ALL IMMEDIATE');}catch(e){error=e;}
  await c.query('ROLLBACK TO SAVEPOINT failure');assert.ok(error);assert.match(error.message,new RegExp('audit_injected_'+label));assert.deepEqual(await state(f),before);pass(label+' failure rolls back whole final action',{error:error.message});
 }
 await rejection('Outsider final action',()=>rpc(actionSql,args,f.users.at(-1)),/not_authorized/);
 await rejection('Browser direct settlement',()=>rpc('select private.farkle_settle_v1($1) v',[f.round],user),/permission denied/);
 await rejection('Browser chip write',()=>rpc('update players set chips=chips+5 where id=$1 returning chips v',[args[1]],user),/permission denied|authoritative_command|authority_claim/);
 await rpc(actionSql,args,user);await verify(f,'Two-player 5-chip canonical settlement');
 const after=await state(f);assert.equal((await rpc(actionSql,args,user)).deduped,true);assert.deepEqual(await state(f),after);pass('Duplicate final request no financial effects');
 assert.equal((await scalar('select private.farkle_settle_v1($1) v',[f.round])).outcome,'already_settled');pass('Duplicate settlement no financial effects');
 assert.equal((await rpc(actionSql,[...args.slice(0,4),randomUUID(),'[]'],user)).outcome,'stale_identity');pass('Late new final request rejected');
 const replay=await rpc('select public.farkle_read_replay($1) v',[f.round],user);assert.equal(replay.roundId,f.round);pass('Authorized history replay identifies exact terminal round');
 const continued=await rpc('select public.farkle_advance_postgame($1,$2,$3,1) v',[f.game,f.round,f.dg],user);assert.equal(continued.outcome,'advanced');
 assert.equal((await rpc('select public.farkle_advance_postgame($1,$2,$3,1) v',[f.game,f.round,f.dg],user)).outcome,'already_advanced');
 const g=(await c.query('select *,config_deadline::text as config_deadline from games where id=$1',[f.game])).rows[0];const dealer=f.players[g.dealer_position-1];
 const runback=await rpc("select public.configure_dealer_game($1,$2,$3,'farkle',$4,$5) v",[f.game,dealer,g.dealer_position,{ante_amount:5,runBackDealerGameId:f.dg},g.config_deadline],f.users[g.dealer_position-1]);
 assert.notEqual(runback.dealer_game.id,f.dg);assert.equal((await rpc(actionSql,args,user)).deduped,true);assert.equal((await scalar('select private.farkle_settle_v1($1) v',[f.round])).outcome,'already_settled');assert.deepEqual(await balances(f),after.balances);
 assert.equal((await rpc('select public.farkle_advance_postgame($1,$2,$3,1) v',[f.game,f.round,f.dg],user)).outcome,'already_advanced');pass('Run Back fresh identity; duplicate continuation and old financial replays are inert',{successor:runback.dealer_game.id});
 await c.query('ROLLBACK');assert.equal(await scalar('select count(*)::int v from games where id=$1',[f.game]),0);pass('Rollback removes complete synthetic session');
 await caseRun('multiplayer',async()=>{const f=await fixture(4,false,'one_last_turn');const args=await finalArgs(f);await rpc(actionSql,args,f.users[f.players.indexOf(args[1])]);await verify(f,'Four-player +15/-5/-5/-5 distribution');});
 await caseRun('real money',async()=>{const f=await fixture(2,true);const args=await finalArgs(f);await scalar("select private.farkle_claim_v1($1,$2,$3,'action') v",[f.game,f.dg,f.round]);await c.query('update games set pending_session_end=true where id=$1',[f.game]);await c.query("select set_config('app.farkle_authority','',true)");await rpc(actionSql,args,f.users[f.players.indexOf(args[1])]);const x=await verify(f,'Real-money final session canonical settlement');assert.equal(x.status,'session_ended');assert.equal(x.transactions.length,2);assert.deepEqual(x.transactions.map(t=>t.amount).sort((a,b)=>a-b),[-5,5]);pass('Real-money SessionResult credits only at terminal session',{transactions:x.transactions.map(t=>({amount:t.amount,type:t.transaction_type}))});});
 for(const n of [2,3])await caseRun('ties '+n,async()=>{const f=await fixture(n,false,'equal_turns');let s=await read(f);const actor=s.turnOrder.at(-1);for(const p of s.turnOrder)s.playerStates[p].banked=p===actor?0:100;s={...s,currentTurnPlayerId:actor,stage:'bank_or_roll',thisTurn:100,finalQueue:[actor],targetReachedBy:s.turnOrder[0]};await seed(f,s);await act(f,'bank');const tied=await read(f);assert.equal(tied.gamePhase,'playing');assert.equal(tied.tiebreakTurn,1);assert.equal(tied.eligible.length,n);assert.deepEqual(Object.values(await balances(f)),Array(n).fill(0));assert.equal((await state(f)).results.length,0);pass(n+'-player all-tie continues without financial writes');const args=await finalArgs(f);await rpc(actionSql,args,f.users[f.players.indexOf(args[1])]);await verify(f,n+'-player tiebreak eventual fixed-stake winner');});
 await caseRun('stale and tamper',async()=>{const f=await fixture();const args=await finalArgs(f);const user=f.users[f.players.indexOf(args[1])];const before=await state(f);assert.equal((await rpc(actionSql,[args[0],args[1],args[2],args[3]-1,args[4],args[5]],user)).outcome,'stale_action');assert.deepEqual(await state(f),before);pass('Stale sequence cannot change finances');await rejection('Client payout helper inaccessible',()=>rpc('select public.settle_gameplay_chip_transfers($1,$2) v',[f.game,[]],user),/permission denied/);await rejection('Client cannot replace frozen scores',()=>rpc("update rounds set farkle_state=jsonb_set(farkle_state,'{winnerPlayerId}',to_jsonb($2::text)) where id=$1 returning id v",[f.round,args[1]],user),/permission denied|authority/);await rejection('Bank cannot accept forged dice or score payload',()=>rpc(actionSql,[...args.slice(0,5),'[6,6,6]'],user),/unexpected_selection/);});
 for(const ante of [0,-5,1000001])await caseRun('invalid stake '+ante,async()=>{await rejection('Invalid stake '+ante,()=>fixture(2,false,'immediate',{ante_amount:ante}),/invalid_ante|invalid_frozen_config/);});
 await caseRun('recovery real pause',async()=>{const f=await fixture(2,true);const s=await read(f);const before=await balances(f);const out=await scalar("select private.farkle_advance_due_v1($1,clock_timestamp()+interval '2 minutes') v",[f.round]);assert.equal(await scalar('select is_paused v from games where id=$1',[f.game]),true);assert.deepEqual(await balances(f),before);assert.deepEqual((await read(f)).playerStates,s.playerStates);pass('Real-money human expiry pauses without scoring or financial movement',{outcome:out});const g=(await c.query('select * from games where id=$1',[f.game])).rows[0];await rpc('select public.set_game_paused($1,false,$2,$3) v',[f.game,f.dg,g.pause_version],f.users[0]);assert.equal(await scalar('select is_paused v from games where id=$1',[f.game]),false);pass('Canonical resume preserves the same competition');});
 await caseRun('zero client final recovery',async()=>{const f=await fixture();await finalArgs(f);let s=await read(f);s.turnDeadline=new Date(Date.now()-10000).toISOString();await seed(f,s);await identity(null,'service_role');const tick=await scalar('select private.advance_due_canonical_game_timers(64) v');assert.equal(tick.failed,0);await verify(f,'Zero-browser canonical timer settles final scoring boundary');const before=await balances(f);await scalar('select private.advance_due_canonical_game_timers(64) v');assert.deepEqual(await balances(f),before);pass('Recovery retry does not settle twice');});
 for(const mode of ['same_request','different_requests','recovery_action','two_recovery_workers']){
  await c.query('BEGIN');const f=await fixture();const args=await finalArgs(f);const user=f.users[f.players.indexOf(args[1])];
  if(mode.includes('recovery')){let s=await read(f);s.turnDeadline=new Date(Date.now()-10000).toISOString();await seed(f,s);}
  await c.query('COMMIT');const peers=[new pg.Client(opts),new pg.Client(opts)];for(const p of peers)await p.connect();
  try{
   await c.query('BEGIN');await c.query('select id from rounds where id=$1 for update',[f.round]);
   const jobs=peers.map((db,i)=>(async()=>{await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='10s'");let out;
    if(mode==='two_recovery_workers'||(mode==='recovery_action'&&i===0)){await identity(null,'service_role',db);out=await scalar('select private.advance_due_canonical_game_timers(64) v',[],db);}else{const a=[...args];if(mode==='different_requests'&&i===1)a[4]=randomUUID();out=await rpc(actionSql,a,user,db);}
    await db.query('COMMIT');return {outcome:out.outcome,deduped:out.deduped,processed:out.processed,failed:out.failed};})().catch(async e=>{await db.query('ROLLBACK');return {error:e.message,code:e.code,detail:e.detail,where:e.where};}));
   await new Promise(resolve=>setTimeout(resolve,100));await c.query('COMMIT');const outcomes=await Promise.all(jobs);result.cases.push({name:'Raw race '+mode,status:'OBSERVED',outcomes});
   if((await state(f)).results.length===0){
    await new Promise(resolve=>setTimeout(resolve,5500));await c.query('BEGIN');await identity(null,'service_role');
    const retry=await scalar('select private.advance_due_canonical_game_timers(64) v');await c.query('COMMIT');
    result.cases.push({name:'Durable retry after '+mode,status:'OBSERVED',retry});
   }
   await c.query('BEGIN');await verify(f,'Committed independent-connection '+mode);pass('Race outcomes '+mode,{outcomes});await c.query('COMMIT');
   // Reconnect reads the committed result, and concurrent postgame events reuse one receipt.
   const closes=await Promise.all(peers.map(async(db,i)=>{await db.query('BEGIN');const x=await rpc('select public.farkle_advance_postgame($1,$2,$3,1) v',[f.game,f.round,f.dg],f.users[i],db);await db.query('COMMIT');return x.outcome;}));
   assert.deepEqual(closes.sort(),['advanced','already_advanced']);pass('Concurrent postgame '+mode,{outcomes:closes});
  }finally{for(const p of peers)await p.end();}
 }
 await c.query('BEGIN');const restart=await fixture();await finalArgs(restart);let rs=await read(restart);rs.turnDeadline=new Date(Date.now()-10000).toISOString();await seed(restart,rs);await c.query('COMMIT');
 const worker=new pg.Client(opts);await worker.connect();const pid=await scalar('select pg_backend_pid() v',[],worker);await worker.query('BEGIN');await identity(null,'service_role',worker);await scalar('select private.advance_due_canonical_game_timers(64) v',[],worker);worker.on('error',()=>{});await c.query('select pg_terminate_backend($1)',[pid]);await worker.end().catch(()=>{});
 assert.deepEqual(Object.values(await balances(restart)),[0,0]);assert.equal((await state(restart)).results.length,0);pass('Worker termination before commit rolls back settlement');
 const fresh=new pg.Client(opts);await fresh.connect();await fresh.query('BEGIN');await identity(null,'service_role',fresh);await scalar('select private.advance_due_canonical_game_timers(64) v',[],fresh);await fresh.query('COMMIT');await fresh.end();await c.query('BEGIN');await verify(restart,'Fresh worker completes interrupted settlement exactly once');await c.query('COMMIT');
 await c.query('BEGIN');const commitFault=await fixture();const fa=await finalArgs(commitFault);await c.query('COMMIT');const clean=await state(commitFault);
 await c.query("CREATE FUNCTION public.audit_fail_batch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit_commit_journal_failure'; END $$; CREATE TRIGGER audit_commit_fault BEFORE INSERT ON public.gameplay_transfer_batches FOR EACH ROW EXECUTE FUNCTION public.audit_fail_batch()");
 const peer=new pg.Client(opts);await peer.connect();await peer.query('BEGIN');await rpc(actionSql,fa,commitFault.users[commitFault.players.indexOf(fa[1])],peer);await assert.rejects(()=>peer.query('COMMIT'),/audit_commit_journal_failure/);await peer.end();assert.deepEqual(await state(commitFault),clean);await c.query('DROP TRIGGER audit_commit_fault ON public.gameplay_transfer_batches; DROP FUNCTION public.audit_fail_batch()');pass('Actual COMMIT-time journal rejection rolls back complete final action');
 await caseRun('frozen identity',async()=>{const f=await fixture();const user=f.users[0];await rejection('Frozen dealer configuration rejects owner mutation',()=>c.query("update dealer_games set config=jsonb_set(config,'{ante_amount}','9') where id=$1",[f.dg]),/frozen_config_immutable/);await rejection('Postgame rejects mismatched dealer identity',()=>rpc('select public.farkle_advance_postgame($1,$2,$3,1) v',[f.game,f.round,randomUUID()],user),/round_identity_mismatch/);await rejection('Client cannot toggle accounting mode',()=>rpc('update games set real_money=true where id=$1 returning id v',[f.game],user),/permission denied|authority|authoritative/);});
 await caseRun('rule units',async()=>{const f=await fixture();let s=await read(f);const original=structuredClone(s);s=await scalar("select private.farkle_reduce_v1($1,'roll','[]',ARRAY[1,1,1,1,1,1]) v",[s]);s=await scalar("select private.farkle_reduce_v1($1,'hold','[0,1,2,3,4,5]',NULL) v",[s]);assert.equal(s.scoringCycle,2);assert.equal(s.available.length,6);const gained=s.thisTurn;assert.ok(gained>0);s=await scalar("select private.farkle_reduce_v1($1,'roll','[]',ARRAY[2,3,4,6,2,3]) v",[s]);assert.equal(s.thisTurn,0);assert.equal(s.playerStates[original.currentTurnPlayerId].banked,0);assert.equal(s.playerStates[original.currentTurnPlayerId].completedTurns,1);pass('Server hot dice and Farkle lose unbanked points only',{hotDicePoints:gained});});
 await caseRun('subset tie',async()=>{const f=await fixture(3,false,'equal_turns');let s=await read(f);const [a,b,loser]=s.turnOrder;s.playerStates[a].banked=100;s.playerStates[loser].banked=50;s={...s,currentTurnPlayerId:b,stage:'bank_or_roll',thisTurn:100,finalQueue:[b],targetReachedBy:a};await seed(f,s);await act(f,'bank');s=await read(f);assert.deepEqual(s.eligible,[a,b]);assert.equal((await state(f)).results.length,0);pass('Only tied leaders enter sudden death; original losers remain liable');const args=await finalArgs(f);await rpc(actionSql,args,f.users[f.players.indexOf(args[1])]);await verify(f,'Subset tie still collects all original stakes');});
 await caseRun('deactivated account',async()=>{const f=await fixture(2,true);const a=await finalArgs(f);const user=f.users[f.players.indexOf(a[1])];await c.query('update profiles set is_active=false where id=$1',[user]);const out=await rpc(actionSql,a,user);await c.query('SET CONSTRAINTS ALL IMMEDIATE');result.cases.push({name:'Deactivated participant retains final-action access',status:out.outcome==='applied'?'OBSERVED':'REJECTED',outcome:out.outcome,balances:await balances(f)});console.log('OBSERVED deactivated participant',out.outcome);});
}catch(e){result.errors.push({message:e.message,stack:e.stack,where:e.where});console.error(e);await c.query('ROLLBACK');}
finally{writeFileSync(dir+'proof-result.json',JSON.stringify(result,null,2));await c.end();}
