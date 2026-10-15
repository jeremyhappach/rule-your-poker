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
try {
 await c.query('BEGIN');
 const existing=await fixture(), recovery=await fixture();
 const a=await finalArgs(existing);await finalArgs(recovery);
 await c.query('update private.farkle_release set creation_enabled=false where singleton');
 await rejection('Closed gate rejects new Farkle setup',()=>fixture(),/creation_disabled/);
 await rpc(actionSql,a,existing.users[existing.players.indexOf(a[1])]);
 await verify(existing,'Closed gate permits existing canonical financial completion');
 let s=await read(recovery);s.turnDeadline=new Date(Date.now()-10000).toISOString();await seed(recovery,s);
 await identity(null,'service_role');const tick=await scalar('select private.advance_due_canonical_game_timers(64) v');assert.equal(tick.failed,0);
 await verify(recovery,'Closed gate permits trusted recovery settlement');
 await rpc('select public.farkle_advance_postgame($1,$2,$3,1) v',[existing.game,existing.round,existing.dg],existing.users[0]);
 const g=(await c.query('select *,config_deadline::text deadline from games where id=$1',[existing.game])).rows[0];const i=g.dealer_position-1;
 assert.ok(['configuring','game_selection','dealer_selection','waiting'].includes(g.status));pass('Closed gate permits postgame cleanup and continuation',{status:g.status});
 await rejection('Closed gate rejects Run Back',()=>rpc("select public.configure_dealer_game($1,$2,$3,'farkle',$4,$5) v",[existing.game,existing.players[i],g.dealer_position,{ante_amount:5,runBackDealerGameId:existing.dg},g.deadline],existing.users[i]),/creation_disabled/);
 const other=await rpc("select public.configure_dealer_game($1,$2,$3,'horses',$4,$5) v",[existing.game,existing.players[i],g.dealer_position,{ante_amount:5},g.deadline],existing.users[i]);
 assert.equal(other.dealer_game.game_type,'horses');pass('Closed Farkle gate permits continuation into Horses');
}catch(e){result.errors.push({message:e.message,where:e.where});console.error(e);}
finally {await c.query('ROLLBACK');writeFileSync(dir+'containment-result.json',JSON.stringify(result,null,2));await c.end();}
if(result.errors.length)process.exitCode=1;
