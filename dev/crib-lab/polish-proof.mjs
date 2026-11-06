// Only a disposable loopback database is accepted. The candidate and all fixture rows roll back.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {connect} from '../quintzee/database.mjs';

const db=process.argv[2];
if(!/^crib_lab_v1_\d+$/.test(db??''))throw Error('Expected disposable Crib Lab database');
const c=await connect(db),actor=randomUUID();
const one=async(sql,params=[])=>(await c.query(sql,params)).rows[0].v;
const start=()=>one("select public.arcade_start($1,$2,'crib-lab') v",[actor,randomUUID()]);
const step=(id,who=actor)=>one('select public.arcade_crib_lab_step($1,$2) v',[who,id]);
const rejected=async(fn,error)=>{
  await c.query('savepoint rejected');
  await assert.rejects(fn,error);
  await c.query('rollback to rejected');
};
const advance=(s,at)=>one('select private.crib_lab_advance($1,$2) v',[s,at]);
const act=(s,type,items,at)=>one('select private.crib_lab_action($1,$2,$3,$4) v',[s,type,items,at]);
const rankOrder='A23456789TJQK',suits=['hearts','clubs','spades','diamonds'];
const cards=spec=>spec.split(' ').map(c=>({rank:c[0]==='T'?'10':c[0],suit:suits[+c[1]],value:Math.min(10,rankOrder.indexOf(c[0])+1)}));
try{
  await c.query('begin');
  await c.query('insert into auth.users(id) values($1)',[actor]);
  await c.query('insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true',[actor]);
  await c.query('insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true',[actor,'Lab '+actor.slice(0,8)]);
  await c.query("update private.arcade_recovery_state set failure=null,last_completed_at=clock_timestamp()");
  await c.query("update private.arcade_rulesets set enabled=(id='crib-lab/1') where game='crib-lab'");
  const old=await start();await step(old.id);
  await c.query("update private.arcade_runs set state=jsonb_set(state,'{deadline}','0') where id=$1",[old.id]);
  const history=(await step(old.id)).projection;
  assert.equal(history.status,'completed');assert.equal(history.result.presentation,undefined);
  const prior=await start();const oldView=(await step(prior.id)).projection;
  if(!process.argv.includes('--installed'))await c.query(readFileSync('supabase/migrations/20261106232247_crib_lab_polish_v2.sql','utf8'));
  assert.equal(await one("select enabled v from private.arcade_rulesets where id='crib-lab/2'"),false);
  const shape=v=>({...v,serverAt:0});
  assert.deepEqual(shape((await step(old.id)).projection),shape(history));
  assert.deepEqual(shape((await step(prior.id)).projection),shape(oldView));
  await c.query("update public.game_defaults set crib_lab_round_seconds=241 where game_type='crib-lab'");
  assert.equal(await one("select id v from private.arcade_rulesets where game='crib-lab' and enabled"),'crib-lab/1-duration-241');
  assert.equal(await one("select enabled v from private.arcade_rulesets where id='crib-lab/2-duration-241'"),false);
  await c.query("update public.game_defaults set crib_lab_round_seconds=240 where game_type='crib-lab'");
  await c.query("update private.arcade_rulesets set enabled=false where game='crib-lab' and enabled");
  await c.query("update private.arcade_rulesets set enabled=true where id='crib-lab/2'");
  assert.equal((await start()).id,prior.id);
  await one("select public.arcade_crib_lab_step($1,$2,$3,$4,$5,'abandon','{}') v",[actor,prior.id,oldView.revision,oldView.roundId,randomUUID()]);
  const run=await start();assert.equal(run.ruleset,'crib-lab/2');
  const view=(await step(run.id)).projection, req=randomUUID();
  assert.equal(view.transition.phase,'discard');assert.equal(view.cut,null);assert.equal(view.offer,null);
  await rejected(()=>one("select public.arcade_crib_lab_step($1,$2,$3,$4,$5,'select','{0,0}') v",[actor,run.id,view.revision,view.roundId,req]),/phase_transition/);
  await rejected(()=>step(run.id,randomUUID()),/not_found|forbidden|account/);
  await new Promise(resolve=>setTimeout(resolve,1150));
  const open=(await step(run.id)).projection;
  assert.equal(open.transition,null);assert.equal(open.deadline,view.deadline);
  const submit=()=>one("select public.arcade_crib_lab_step($1,$2,$3,$4,$5,'select','{0,0}') v",[actor,run.id,open.revision,open.roundId,req]);
  assert.equal((await submit()).outcome,'committed');assert.equal((await submit()).outcome,'duplicate');
  await c.query("update public.game_defaults set crib_lab_round_seconds=300 where game_type='crib-lab'");
  assert.equal(await one("select id v from private.arcade_rulesets where enabled and game='crib-lab'"),'crib-lab/2-duration-300');
  assert.equal((await start()).config.durationMs,240000);
  const writesOutsideArcade=()=>one(`select coalesce(sum(n_tup_ins+n_tup_upd+n_tup_del),0)::text v
    from pg_stat_xact_user_tables where schemaname in ('public','private') and relname not in ('arcade_runs','arcade_results','arcade_revisions','arcade_command_receipts')`);
  const beforeWrites=await writesOutsideArcade();
  const seed={runId:run.id,userId:actor,status:'active',config:run.config,score:0,results:[]};
  let s=await one('select private.crib_lab_deal($1,1,1000) v',[seed]);
  const paused=async(s,phase,at,remaining)=>{
    assert.equal(s.phase,phase);assert.equal(s.transition.startsAt,at);assert.equal(s.transition.endsAt,s.phaseUntil);
    assert.equal(s.deadline-s.phaseUntil,remaining);
    const last=await advance(s,s.phaseUntil-1);assert.deepEqual(last,s);
    const resumed=await advance(last,s.phaseUntil);assert.equal(resumed.deadline-(phase==='cut'?1100:0),s.deadline);
    if(phase!=='cut')assert.equal(resumed.transition,undefined);
    return resumed;
  };
  s=await paused(s,'discard',1000,240000);
  const activeFrom=2100;
  for(let h=0;h<5;h++)for(const index of [4,5])s=await act(s,'select',[h,index],activeFrom+200);
  s=await act(s,'lock',[],activeFrom+10000);
  await rejected(()=>act(s,'pass',[],s.phaseUntil-1),/phase_transition/);
  s=await paused(s,'stock',12100,230000);
  for(let i=0;i<5;i++){const stock=s.stock[i];s=await act(s,i<2?'replace':'pass',i<2?[0,0]:[],14000+i*100);assert.equal(s.stockIndex,i+1);if(i<2)assert.deepEqual(s.hands[0][0],stock);}
  s=await paused(s,'cut',14400,228800);
  await rejected(()=>act(s,'swap',[0,0,1,0],s.phaseUntil-1),/phase_transition/);
  s=await paused(s,'swap',15400,228800);
  const durable=s;
  // A last-millisecond stock decision still earns the complete cut and swap holds.
  const near={...s,phase:'stock',stockIndex:4,deadline:20001};
  const cutHold=await act(near,'pass',[],20000),swapHold=await advance(cutHold,21000);
  assert.equal(cutHold.deadline,21001);assert.equal(swapHold.deadline,22101);
  const oneLeft=await advance(swapHold,22100);assert.equal(oneLeft.phase,'swap');
  assert.deepEqual(await advance(oneLeft,22100),oneLeft);
  assert.equal((await advance(oneLeft,22101)).results[0].multiplier,100);
  for(let i=0;i<2;i++)s=await act(s,'swap',[0,0,1,0],17000);
  const v1=await one("select private.crib_lab_action_v1($1,'swap','{0,0,1,0}',18000) v",[s]);
  s=await act(s,'swap',[0,0,1,0],18000);assert.equal(s.swapsLeft,0);
  const r=s.results[0],{presentation,...award}=r;assert.deepEqual(award,v1.results[0]);
  assert.equal(r.multiplier,100+Math.floor(200*(s.deadline-18000)/240000));
  assert.equal(s.phaseUntil,r.scoredAt+presentation.endAt);
  assert.deepEqual(await advance(s,s.phaseUntil-1),s);
  assert.equal((await advance(s,s.phaseUntil)).transition.startsAt,s.phaseUntil);
  const cold=await advance(durable,durable.deadline+2000000);
  assert.equal(cold.status,'completed');assert.deepEqual(cold.results.map(r=>r.multiplier),[100,100,100]);
  assert.deepEqual(await advance(cold,999999999),cold);
  // Exact positional masks: three fives create 3 pairs, four fives create 6.
  for(const [spec,kind,masks] of [
    ['50 51 52 J3 53','pair',[3,5,6,17,18,20]],['50 51 52 J3 53','nobs',[24]],
    ['50 51 52 J3 53','fifteen',[7,9,10,12,19,21,22,24]],
    ['30 31 32 43 50','pair',[3,5,6]],['30 31 32 43 50','run',[25,26,28]],
    ['30 31 40 41 52','run',[21,22,25,26]],['20 40 60 80 Q0','flush',[31]],['20 40 60 80 Q1','flush',[15]]
  ]){
    const hand=cards(spec),cut=hand.pop();
    const got=(await c.query('select mask from private.crib_lab_combinations($1,$2) where kind=$3 order by mask',[JSON.stringify(hand),cut,kind])).rows.map(x=>x.mask);
    assert.deepEqual(got,masks,spec+' '+kind);
  }
  // Stress the timeline independently of shuffle luck, including a very high combo count.
  const stress={...durable,hands:['50 51 52 J3','70 71 80 81','60 61 40 41','30 31 20 21','T0 T1 K0 K1'].map(cards),cut:cards('53')[0]};
  assert.equal(new Set([...stress.hands.flat(),stress.cut].map(c=>c.rank+c.suit)).size,21);
  const long=await act(stress,'stand',[],18000);const lr=long.results[0];
  assert.ok(lr.presentation.beats.filter(b=>b.kind!=='subtotal').every(b=>b.ms===450),'450 ms per combination');
  assert.ok(lr.base>=70);assert.ok(lr.presentation.endAt>16000);
  assert.equal(lr.presentation.beats.filter(b=>b.kind!=='subtotal').reduce((n,b)=>n+b.points,0),lr.base);
  assert.equal((await advance(long,long.phaseUntil-1)).round,1);
  // The same authenticated step also owns terminal replay and ranking.
  await c.query("update private.arcade_runs set state=jsonb_set(state,'{deadline}','0') where id=$1",[run.id]);
  const ended=(await step(run.id)).projection;
  assert.equal(ended.status,'completed');assert.equal((await submit()).outcome,'duplicate');
  assert.equal((await step(run.id)).projection.revision,ended.revision);
  assert.equal(await one('select count(*)::int v from private.arcade_results where run_id=$1',[run.id]),1);
  const tied=[];
  for(let repeat=0;repeat<2;repeat++){
    const t=await start();tied.push(t.id);
    await step(t.id);
    for(let round=1;round<=3;round++){
      await c.query("update private.arcade_runs set state=(state-'transition')||jsonb_build_object('hands',$2::jsonb,'cut',$3::jsonb,'phase','swap','phaseUntil',null,'deadline',floor(extract(epoch from clock_timestamp())*1000)::bigint-1) where id=$1",
        [t.id,JSON.stringify(durable.hands),durable.cut]);
      const counted=(await step(t.id)).projection;
      assert.equal(counted.round,round);assert.equal(counted.result.multiplier,100);assert.ok(counted.result.presentation);
      if(round<3){
        await c.query("update private.arcade_runs set state=jsonb_set(state,'{phaseUntil}',to_jsonb(floor(extract(epoch from clock_timestamp())*1000)::bigint)) where id=$1",[t.id]);
        assert.equal((await step(t.id)).projection.transition.phase,'discard');
      }
    }
  }
  for(const period of ['30','all']){
    const board=await one("select public.arcade_leaderboard($1,'crib-lab',$2,null,'crib-lab/2-duration-300') v",[actor,period]);
    const rows=board.rows.filter(row=>tied.includes(row.runId));assert.equal(rows.length,2);
    assert.equal(rows[0].rank,rows[1].rank);assert.equal(rows[0].score,rows[1].score);assert.ok(rows[0].completedAt);
  }
  assert.equal(await writesOutsideArcade(),beforeWrites,'no writes to non-Arcade game or financial tables');
  await c.query("create or replace function private.crib_lab_count_policy() returns text language sql immutable set search_path='' as $$select 'hands'::text$$");
  const short=await act(stress,'stand',[],18000);
  assert.equal(short.results[0].presentation,undefined);assert.equal(short.phaseUntil,28000);assert.equal(short.score,long.score);
  assert.deepEqual((await advance(long,long.phaseUntil-1)).results[0],lr);
  console.log('PASS: v1 identity/history, closed v2 admission, CAS/owner/replay, immutable defaults, three paused overlays plus cut, exact masks, payout parity, 3-swap cap, 3 unattended rounds, long count and hand policy.');
}finally{await c.query('rollback');await c.end();}
