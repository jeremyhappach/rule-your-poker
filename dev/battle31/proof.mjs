import assert from 'node:assert/strict';import {readFileSync as read,writeFileSync as write} from 'node:fs';import {randomUUID as uuid} from 'node:crypto';import {connect,candidate,localContext} from './database.mjs';
const c=await connect(localContext().database),evidence=[];
const q=async(sql,args=[])=>(await c.query(sql,args)).rows;
async function rpc(user,sql,args=[]){await q("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);await q('SET LOCAL ROLE authenticated');try{return await q(sql,args);}finally{await q('RESET ROLE');}}
async function rejected(fn,label){await q('SAVEPOINT reject_case');let failed=false;try{await fn();}catch{failed=true;}await q('ROLLBACK TO SAVEPOINT reject_case');assert(failed,label);}
try{
 await q('BEGIN');if(!(await q("SELECT to_regclass('private.battle31_matches') present"))[0].present)await q(candidate());
 await q('UPDATE private.battle31_release SET enabled=false,admission_enabled=false');
 assert.equal((await q('SELECT enabled,admission_enabled FROM private.battle31_release'))[0].admission_enabled,false);
 await q('UPDATE private.battle31_release SET enabled=true,admission_enabled=true');
 await q("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 const score=(await q("SELECT private.battle31_score('[0,8,16]') triple,private.battle31_score('[7,15,23]') aces,private.battle31_score('[7,4,5]') thirtyone,private.battle31_score('[4,12,2]') mixed"))[0];assert.deepEqual(score,{triple:'30.5',aces:'32',thirtyone:'31',mixed:'19'});
 const users=[uuid(),uuid(),uuid()];for(const user of users){await q('INSERT INTO auth.users(id) VALUES($1)',[user]);await q("INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true",[user,'B31 '+user]);}
 for(const money of [false,true])for(const outcome of ['winner','tie','abort']){
  const game=uuid(),players=[uuid(),uuid()],deadline=new Date(Date.now()+600000).toISOString();
  await q("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',$2,2,$3,0,false,false)",[game,money,deadline]);
  for(let i=0;i<2;i++)await q('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[players[i],game,users[i],2-i]);
  await rejected(()=>rpc(users[1],"SELECT public.battle31_configure($1,$2,2,'battle-31','{\"ante_amount\":5}',$3)",[game,players[0],deadline]),'noncaller setup rejected');
  await rejected(()=>rpc(users[0],"SELECT public.battle31_configure($1,$2,2,'battle-31','{\"ante_amount\":0}',$3)",[game,players[0],deadline]),'invalid stake');
  const v=(await rpc(users[0],"SELECT public.battle31_configure($1,$2,2,'battle-31','{\"ante_amount\":5}',$3) v",[game,players[0],deadline]))[0].v;const dealer=v.dealer_game.id;
  assert.equal((await q('SELECT count(*)::int n FROM private.battle31_matches WHERE dealer_game_id=$1',[dealer]))[0].n,0,'no start before consent');
  await rpc(users[1],"SELECT public.submit_ante_decision($1,$2,$3,'ante_up')",[game,dealer,players[1]]);
  await rpc(users[0],'SELECT public.advance_ante_phase($1,$2)',[game,dealer]);
  const base=(await q('SELECT state FROM private.battle31_matches WHERE dealer_game_id=$1',[dealer]))[0].state;
  const player0=base.players[0],player1=base.players[1];
  const state={...base,phase:'playing',deadline:Date.now()+600000,stage:12,turn:8,turnIndex:0,closing:false,losses:outcome==='winner'?[0,3]:[2,2],hands:outcome==='winner'?[[7,4,0],[8,17,26]]:[[0,8,16],[1,9,17]],center:[5,12,21]};
  await q('UPDATE private.battle31_matches SET state=$2 WHERE dealer_game_id=$1',[dealer,state]);
  const snap=(await rpc(player0.userId,'SELECT public.battle31_snapshot($1) v',[dealer]))[0].v;
  assert.deepEqual(snap.hands[1],[null,null,null]);assert.equal(snap.values[1],null);assert(!('deck' in snap));
  await rejected(()=>rpc(users[2],'SELECT public.battle31_snapshot($1)',[dealer]),'nonmember privacy');
  await rejected(()=>rpc(player0.userId,'SELECT state FROM private.battle31_matches WHERE dealer_game_id=$1',[dealer]),'raw state revoked');
  await rejected(()=>rpc(player1.userId,"SELECT public.battle31_action($1,$2,0,'pass')",[dealer,uuid()]),'wrong actor');
  await rejected(()=>rpc(player0.userId,"SELECT public.battle31_action($1,$2,0,'swap',ARRAY[0,31])",[dealer,uuid()]),'wrong center id');
  const request=uuid(),action=outcome==='winner'?'swap':'pass',items=outcome==='winner'?[0,5]:null;
  if(outcome==='winner'){
   await q("CREATE OR REPLACE FUNCTION pg_temp.b31_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected_after_chips';END $$");
   await q('CREATE TRIGGER b31_injected AFTER INSERT ON public.gameplay_transfer_batches FOR EACH ROW EXECUTE FUNCTION pg_temp.b31_fail()');
   await rejected(async()=>{await rpc(player0.userId,'SELECT public.battle31_action($1,$2,0,$3,$4)',[dealer,request,action,items]);await q('SET CONSTRAINTS ALL IMMEDIATE');},'atomic injected failure');
   assert.equal((await q('SELECT count(*)::int n FROM public.game_results WHERE dealer_game_id=$1',[dealer]))[0].n,0);
   assert((await q('SELECT chips FROM public.players WHERE game_id=$1',[game])).every(x=>x.chips===100));
   await q('DROP TRIGGER b31_injected ON public.gameplay_transfer_batches');
  }
  if(outcome==='abort')await q('SELECT private.battle31_abort($1)',[dealer]);
  else await rpc(player0.userId,'SELECT public.battle31_action($1,$2,0,$3,$4)',[dealer,request,action,items]);
  await q('SET CONSTRAINTS ALL IMMEDIATE');
  const chips=await q('SELECT id,chips FROM public.players WHERE game_id=$1 ORDER BY id',[game]);
  for(const p of chips)assert.equal(p.chips,outcome==='winner'?(p.id===player0.id?105:95):100);
  assert.equal((await q('SELECT count(*)::int n FROM public.game_results WHERE dealer_game_id=$1',[dealer]))[0].n,1);
  assert.equal((await q('SELECT count(*)::int n FROM public.session_player_snapshots s JOIN public.players p ON p.id=s.player_id AND p.chips=s.chips WHERE s.dealer_game_id=$1',[dealer]))[0].n,2);
  const batches=await q('SELECT transfers,unmatched_deltas FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[dealer]);
  if(outcome==='winner'){assert.equal(batches.length,1);assert.deepEqual(batches[0].unmatched_deltas,{});assert.equal(batches[0].transfers[0].amount,5);}else assert.equal(batches.length,0);
  if(outcome!=='abort')await rpc(player0.userId,'SELECT public.battle31_action($1,$2,0,$3,$4)',[dealer,request,action,items]);
  await q('SET CONSTRAINTS ALL DEFERRED');
  await q("UPDATE private.battle31_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=$1",[dealer]);
  if(outcome==='tie')await q("UPDATE public.games SET status='session_ended',session_ended_at=clock_timestamp() WHERE id=$1",[game]);
  await rpc(player0.userId,'SELECT public.battle31_close($1)',[dealer]);await rpc(player0.userId,'SELECT public.battle31_close($1)',[dealer]);
  if(outcome!=='abort')await rpc(player0.userId,'SELECT public.battle31_action($1,$2,0,$3,$4)',[dealer,request,action,items]);
  assert.equal((await q('SELECT count(*)::int n FROM public.game_results WHERE dealer_game_id=$1',[dealer]))[0].n,1);
  evidence.push({money,outcome,chips,batches,passed:true});
 }
 await q('ROLLBACK');write('qualification.local/battle31/financial-proof.json',JSON.stringify({passed:true,cases:evidence},null,2));console.log('PASS: rollback-contained authenticated privacy, consent, winner/tie/abort, actual chips/ledger/snapshots, injected failure, duplicate and late replay, continuation/terminal');
}catch(e){console.error(e.message,e.where,e.position,e.internalQuery);await q('ROLLBACK');process.exitCode=1;}finally{await c.end();}
