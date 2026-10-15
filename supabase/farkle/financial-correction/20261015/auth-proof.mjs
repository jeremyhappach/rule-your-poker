import {c,result,dir,fixture,finalArgs,rpc,actionSql,state,read,seed,identity,scalar,verify,rejection,pass,caseRun} from './helpers.mjs';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
try {
 for(const real of [false,true])await caseRun('disabled boundary '+real,async()=>{
  const f=await fixture(2,real),a=await finalArgs(f),i=f.players.indexOf(a[1]),u=f.users[i];
  await c.query('update profiles set is_active=false where id=$1',[u]);const before=await state(f);
  await rejection('Inactive final bank denied '+real,()=>rpc(actionSql,a,u),/active_account_required/);
  await rejection('Inactive postgame denied '+real,()=>rpc('select public.farkle_advance_postgame($1,$2,$3,1) v',[f.game,f.round,f.dg],u),/active_account_required/);
  await rejection('Inactive automation denied '+real,()=>rpc('select public.set_automatic_play($1,$2,$3,$4,0,true) v',[f.game,f.round,f.dg,a[1]],u),/active_account_required/);
  await rejection('Inactive pause denied '+real,()=>rpc('select public.set_game_paused($1,false,$2,0) v',[f.game,f.dg],u),/active_account_required/);
  await rejection('Inactive ante advance denied '+real,()=>rpc('select public.advance_ante_phase($1,$2) v',[f.game,f.dg],u),/active_account_required/);
  await rejection('Inactive ante decision denied '+real,()=>rpc("select public.submit_ante_decision($1,$2,$3,'ante_up') v",[f.game,f.dg,a[1]],u),/active_account_required/);
  await rejection('Inactive successor intent denied '+real,()=>rpc("select public.set_session_player_intent($1,$2,0,$3,'auto_ante_runback',true) v",[f.game,a[1],f.dg],u),/active_account_required/);
  assert.deepEqual(await state(f),before);pass('All inactive commands preserve authoritative and financial state '+real);
  await identity(null,'service_role');let s=await read(f);s.turnDeadline=new Date(Date.now()-10000).toISOString();await seed(f,s);
  const tick=await scalar('select private.advance_due_canonical_game_timers(64) v');assert.equal(tick.failed,0);
  if(real){assert.equal(await scalar('select is_paused v from games where id=$1',[f.game]),true);assert.equal((await state(f)).results.length,0);pass('Inactive real-money human safely pauses; recovery makes no unauthorized bank');
   // A still-active eligible host can resume. The deactivated participant has
   // no further commands; the already-authorized score remains unchanged.
  }else{await verify(f,'Trusted clientless recovery settles with inactive participant');}
 });
 await caseRun('disabled Run Back',async()=>{
  const f=await fixture(2,true),a=await finalArgs(f);await rpc(actionSql,a,f.users[f.players.indexOf(a[1])]);await verify(f,'Active non-admin real-money final action succeeds');
  await rpc('select public.farkle_advance_postgame($1,$2,$3,1) v',[f.game,f.round,f.dg],f.users[0]);
  const g=(await c.query('select *,config_deadline::text deadline from games where id=$1',[f.game])).rows[0],i=g.dealer_position-1,u=f.users[i];
  await c.query('update profiles set is_active=false where id=$1',[u]);const before=await state(f);
  await rejection('Inactive real-money Run Back denied',()=>rpc("select public.configure_dealer_game($1,$2,$3,'farkle',$4,$5) v",[f.game,f.players[i],g.dealer_position,{ante_amount:5,runBackDealerGameId:f.dg},g.deadline],u),/active_account_required/);
  assert.deepEqual(await state(f),before);await c.query('update profiles set is_active=true where id=$1',[u]);
  const out=await rpc("select public.configure_dealer_game($1,$2,$3,'farkle',$4,$5) v",[f.game,f.players[i],g.dealer_position,{ante_amount:5,runBackDealerGameId:f.dg},g.deadline],u);assert.equal(out.outcome,'configured');pass('Reactivated eligible dealer admitted with new successor identity');
 });
 await caseRun('raw browser fields',async()=>{
  const f=await fixture(),u=f.users[0];await c.query('update profiles set is_active=false where id=$1',[u]);
  await rejection('Inactive direct ante write denied',()=>rpc("update public.players set ante_decision='ante_up' where id=$1 returning id v",[f.players[0]],u),/permission denied|authoritative|active_account/);
  await rejection('Inactive direct successor intent write denied',()=>rpc('update public.players set auto_ante_runback=true where id=$1 returning id v',[f.players[0]],u),/permission denied|authoritative|active_account/);
 });
}finally {writeFileSync(dir+'auth-corrected-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify({cases:result.cases.length,errors:result.errors}));await c.end();if(result.errors.length)process.exitCode=1;}
