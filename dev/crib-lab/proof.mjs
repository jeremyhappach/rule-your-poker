// Disposable loopback PostgreSQL only. The candidate, fixtures and test clocks roll back together.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {connect} from '../quintzee/database.mjs';

const db=process.argv[2];
if(!/^crib_lab_v1_\d+$/.test(db??''))throw Error('Pass a disposable Crib Lab database name');
const c=await connect(db);
const one=async(sql,args=[])=>Object.values((await c.query(sql,args)).rows[0])[0];
const rejected=async(fn,pattern)=>{
  await c.query('savepoint rejection');
  await assert.rejects(fn,pattern);
  await c.query('rollback to rejection');
};
const scale=async(left)=>one('select private.crib_lab_multiplier_v1($1,240000)',[left]);
const suits=['clubs','diamonds','hearts','spades'];
const cards=spec=>spec.split(' ').map(s=>({rank:s.slice(0,-1),suit:suits[Number(s.at(-1))],value:Math.min(10,'A23456789TJQK'.indexOf(s.slice(0,-1))+1)}));
try{
  await c.query('begin');
  if(!process.argv.includes('--installed'))await c.query(readFileSync('supabase/migrations/20261106180931_crib_lab_arcade_v1.sql','utf8'));
  assert.equal(await one("select enabled from private.arcade_rulesets where id='crib-lab/1'"),false);
  for(const [spec,category,points] of [
    ['50 51 52 J3 53','total',29],['30 31 42 53 K0','runs',6],['30 31 32 43 50','runs',9],
    ['30 31 40 41 52','runs',12],['20 40 60 80 Q1','flush',4],['20 40 60 80 Q0','flush',5],
    ['20 40 60 81 Q0','flush',0],['J1 20 43 62 K1','nobs',1],['J1 20 43 62 K0','nobs',0],
    ['A0 21 32 43 50','runs',5],
  ]){
    const hand=cards(spec),cut=hand.pop();const result=await one('select private.cribbage_hand_score($1,$2,false)',[JSON.stringify(hand),cut]);
    assert.equal(result[category],points,spec);
  }
  for(const [left,expected] of [[250000,300],[240000,300],[120000,200],[1,100],[0,100],[-1,100]])assert.equal(await scale(left),expected);
  const users=[randomUUID(),randomUUID()];
  for(const id of users){
    await c.query('insert into auth.users(id) values($1)',[id]);
    await c.query("insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true",[id]);
    await c.query("insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true",[id,'Crib Lab '+id.slice(0,8)]);
  }
  const start=(actor,request=randomUUID())=>one("select public.arcade_start($1,$2,'crib-lab')",[actor,request]);
  const step=(actor,id,rev=null,round=null,req=null,action=null,items=[],token=null)=>one('select public.arcade_crib_lab_step($1,$2,$3,$4,$5,$6,$7,$8)',[actor,id,rev,round,req,action,items,token]);
  await rejected(()=>start(users[0]),/unavailable/);
  const activation=readFileSync('supabase/crib-lab/activate.sql','utf8');
  await rejected(()=>c.query(activation),/publication_mismatch/);
  const sha='a'.repeat(40);
  await c.query("insert into public.system_settings(key,value) values('release_publication',jsonb_build_object('buildSha',$1::text)) on conflict(key) do update set value=excluded.value",[sha]);
  await c.query("select set_config('app.crib_lab_release_sha',$1,true)",[sha]);
  await rejected(()=>c.query(activation),/authority_changed/);
  const digest=await one(`select md5(string_agg(pg_get_functiondef(p.oid),chr(10) order by p.oid::regprocedure::text))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
      (n.nspname='private' and (left(p.proname,9)='crib_lab_' or p.proname in ('cribbage_new_deck','cribbage_hand_score','cribbage_rank_value','cribbage_card_value','secure_shuffle_key')))
      or (n.nspname='public' and p.proname in ('arcade_crib_lab_step','arcade_start','arcade_commit','arcade_leaderboard'))`);
  await c.query("select set_config('app.crib_lab_authority_hash',$1,true)",[digest]);
  await c.query("update private.arcade_recovery_state set last_completed_at=clock_timestamp(),failure=null");
  await c.query(activation);
  assert.equal(await one("select enabled from private.arcade_rulesets where id='crib-lab/1'"),true);
  const request=randomUUID(),run=await start(users[0],request);
  assert.equal((await start(users[0],request)).id,run.id);
  for(const invalid of [59,601])await rejected(()=>c.query("update public.game_defaults set crib_lab_round_seconds=$1 where game_type='crib-lab'",[invalid]),/check constraint/);
  await c.query("update public.game_defaults set crib_lab_round_seconds=300 where game_type='crib-lab'");
  assert.equal((await start(users[0])).config.durationMs,240000);
  const other=await start(users[1]);assert.equal(other.config.durationMs,300000);
  await rejected(()=>step(users[1],run.id),/not_found/);
  await rejected(()=>step(null,run.id),/recovery_denied/);
  assert.equal(await one("select has_function_privilege('authenticated','public.arcade_crib_lab_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)','execute')"),false);
  // Reject writes to every non-Arcade application table during all gameplay below.
  await c.query(`create function pg_temp.reject_write() returns trigger language plpgsql as $$ begin raise exception 'outside Arcade: %',tg_table_name;end $$;
    do $$ declare t record;begin for t in select schemaname,tablename from pg_tables where schemaname in ('public','private') and tablename not like 'arcade_%'
      loop execute format('create trigger crib_lab_write_guard before insert or update or delete or truncate on %I.%I for each statement execute function pg_temp.reject_write()',t.schemaname,t.tablename);end loop;end $$`);
  await c.query(`create function pg_temp.guard_game() returns trigger language plpgsql as $$begin
    if tg_op<>'INSERT' and old.game<>'crib-lab' then raise exception 'other game changed';end if;
    if tg_op<>'DELETE' and new.game<>'crib-lab' then raise exception 'other game changed';end if;
    if tg_op='DELETE' then return old;end if;return new;end$$;
    create trigger crib_lab_other_run before insert or update or delete on private.arcade_runs for each row execute function pg_temp.guard_game();
    create trigger crib_lab_other_record before insert or update or delete on private.arcade_results for each row execute function pg_temp.guard_game();`);
  let v=(await step(users[0],run.id)).projection;
  assert.equal(v.phase,'discard');assert.equal(v.cut,null);assert.equal(v.offer,null);assert.ok(!('stock' in v));
  const raw=()=>one('select state from private.arcade_runs where id=$1',[run.id]);
  const setState=async(s)=>c.query('update private.arcade_runs set state=$2 where id=$1',[run.id,s]);
  const opening=await raw();
  assert.equal(new Set([...opening.hands.flat(),...opening.stock,opening.cut].map(x=>x.rank+x.suit)).size,36);
  assert.equal(await one("select count(distinct card)::int from jsonb_array_elements(private.cribbage_new_deck()) card"),52);
  const send=async(action,items=[])=>{const res=await step(users[0],run.id,v.revision,v.roundId,randomUUID(),action,items);assert.equal(res.outcome,'committed');v=res.projection;};
  const expire=async(s,at)=>one('select private.crib_lab_advance_v1($1,$2)',[s,at]);
  const fresh=await expire(opening,opening.deadline);
  assert.deepEqual(fresh.hands,opening.hands.map(row=>row.slice(0,4)));assert.equal(fresh.results[0].multiplier,100);
  const request2=randomUUID(),initial=v;
  v=(await step(users[0],run.id,v.revision,v.roundId,request2,'select',[0,0])).projection;
  assert.equal((await step(users[0],run.id,initial.revision,initial.roundId,request2,'select',[0,0])).outcome,'duplicate');
  await rejected(()=>step(users[0],run.id,initial.revision,initial.roundId,request2,'select',[0,1]),/request_conflict/);
  const partial=await expire(await raw(),opening.deadline);
  assert.deepEqual(partial.hands[0],opening.hands[0].slice(1,5));
  await rejected(()=>send('lock'),/incomplete_discards/);
  await send('select',[0,0]); // editable
  for(let h=0;h<5;h++){await send('select',[h,4]);await send('select',[h,5]);}
  await send('lock');
  for(let i=0;i<5;i++){
    assert.equal(v.stockLeft,5-i);assert.deepEqual(v.offer,opening.stock[i]);assert.equal(v.cut,null);
    if(i===2){const timeout=await expire(await raw(),opening.deadline);assert.equal(timeout.stockIndex,5);assert.deepEqual(timeout.hands,v.hands);}
    if(i<2){const card=v.offer;await send('replace',[0,0]);assert.deepEqual(v.hands[0][0],card);}else await send('pass');
  }
  assert.equal(v.phase,'cut');assert.deepEqual(v.cut,opening.cut);assert.equal(v.offer,null);
  assert.equal((await expire(await raw(),opening.deadline)).results[0].multiplier,100);
  await setState({...await raw(),phaseUntil:0});v=(await step(users[0],run.id)).projection;
  await rejected(()=>send('swap',[0,0,0,1]),/illegal_action/);
  for(let left=3;left>0;left--){
    assert.equal(v.swapsLeft,left);const before=v.hands;await send('swap',[0,0,1,0]);
    assert.deepEqual(v.hands[0][0],before[1][0]);assert.deepEqual(v.hands[1][0],before[0][0]);
  }
  assert.equal(v.phase,'scoring');assert.equal(v.swapsLeft,0);
  await rejected(()=>send('swap',[0,0,1,0]),/illegal_action/);
  const r1=v.result;assert.equal(r1.award,r1.base*r1.multiplier);
  await setState({...await raw(),phaseUntil:Date.now()-10});v=(await step(users[0],run.id)).projection;
  assert.equal(v.round,2);assert.equal(v.phase,'discard');
  for(let h=0;h<5;h++){await send('select',[h,0]);await send('select',[h,1]);}
  await send('lock');for(let i=0;i<5;i++)await send('pass');
  await setState({...await raw(),phaseUntil:0});v=(await step(users[0],run.id)).projection;const kept=v.hands;
  const swapTimeout=await expire(await raw(),v.deadline);assert.deepEqual(swapTimeout.hands,kept);
  await send('stand');assert.deepEqual(v.hands,kept);assert.equal(v.result.before,r1.award);
  await setState({...await raw(),phaseUntil:Date.now()-10});v=(await step(users[0],run.id)).projection;
  assert.equal(v.round,3);
  await setState({...await raw(),deadline:Date.now()-1});
  const terminal=await step(users[0],run.id,v.revision,v.roundId,randomUUID(),'select',[0,1]);
  assert.equal(terminal.outcome,'stale');assert.equal(terminal.projection.status,'completed');assert.equal(terminal.projection.result.multiplier,100);
  assert.equal((await step(users[0],run.id,initial.revision,initial.roundId,request2,'select',[0,0])).outcome,'duplicate');
  assert.equal((await step(users[0],run.id)).projection.score,terminal.projection.score);
  assert.equal(await one('select count(*)::int from private.arcade_results where run_id=$1',[run.id]),1);
  assert.equal((await raw()).results.length,3);
  for(const period of ['30','all']){
    const board=await one("select public.arcade_leaderboard($1,'crib-lab',$2,$3,$4)",[users[0],period,run.id,run.ruleset]);
    assert.equal(board.rows[0].score,terminal.projection.score);assert.ok(Date.parse(board.rows[0].completedAt));
  }
  // A cold worker catches up multiple missed rounds, without a player action.
  const token=randomUUID();await c.query("update private.arcade_recovery_state set token=$1,claimed=true,expires_at=clock_timestamp()+interval '1 minute'",[token]);
  await step(users[1],other.id);
  await c.query("update private.arcade_runs set state=jsonb_set(state,'{deadline}',to_jsonb(0)) where id=$1",[other.id]);
  const cold=await step(null,other.id,null,null,null,null,[],token);assert.equal(cold.projection.status,'completed');
  assert.equal(cold.projection.result.multiplier,100);
  assert.equal((await step(null,other.id,null,null,null,null,[],token)).projection.revision,cold.projection.revision);
  const tied=[await start(users[0]),await start(users[1])];
  const scores=[];
  for(const t of tied){
    let view=(await step(t.user_id,t.id)).projection;
    for(let round=1;round<=3;round++){
      const state=await one('select state from private.arcade_runs where id=$1',[t.id]);
      Object.assign(state,{hands:opening.hands,cut:opening.cut,deadline:Date.now()-1});
      await c.query('update private.arcade_runs set state=$2 where id=$1',[t.id,state]);
      view=(await step(t.user_id,t.id)).projection;
      if(round<3){
        // Keep successor start in the present instead of catching up the rest of the game.
        await c.query("update private.arcade_runs set state=jsonb_set(state,'{phaseUntil}',to_jsonb(floor(extract(epoch from clock_timestamp())*1000)::bigint)) where id=$1",[t.id]);
        view=(await step(t.user_id,t.id)).projection;
      }
    }
    assert.equal(view.status,'completed');scores.push(view.score);
  }
  assert.equal(scores[0],scores[1]);
  const ranks=(await one("select public.arcade_leaderboard($1,'crib-lab','all',null,$2)",[users[0],other.ruleset])).rows;
  assert.equal(ranks.find(r=>r.runId===tied[0].id).rank,ranks.find(r=>r.runId===tied[1].id).rank);
  await rejected(()=>c.query('update private.arcade_results set score=0 where run_id=$1',[run.id]),/immutable/);
  console.log('PASS — score fixtures, secure deal, editable/partial/untouched discards, stock, swaps, stand, every timeout, three-round results, frozen defaults, both boards, ownership, receipts, late replay, cold worker and non-Arcade write guards.');
}finally{await c.query('rollback');await c.end();}
