// Disposable loopback PostgreSQL only. The candidate, fixtures and test clocks roll back together.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {connect} from '../quintzee/database.mjs';

const db=process.argv[2];
if(!/^chucky_showdown_v1_\d+$/.test(db??''))throw Error('Pass a disposable Chucky Showdown database name');
const c=await connect(db);
const one=async(sql,args=[])=>Object.values((await c.query(sql,args)).rows[0])[0];
const rejected=async(fn,pattern)=>{
  await c.query('savepoint rejection');
  await assert.rejects(fn,pattern);
  await c.query('rollback to rejection');
};

const migration=readFileSync('supabase/migrations/20261106191752_chucky_showdown_arcade_v1.sql','utf8');
const cards=spec=>spec.split(' ').map(t=>({rank:t.slice(0,-1),suit:{s:'♠',h:'♥',d:'♦',c:'♣'}[t.at(-1)]}));
const unique=cs=>new Set(cs.map(c=>c.rank+c.suit)).size===cs.length;
const rank=cs=>one('select public.holm_best_hand_value($1)',[JSON.stringify(cs)]);
try{
  await c.query('begin');
  if(!process.argv.includes('--installed'))await c.query(migration);
  assert.equal(await one("select enabled from private.arcade_rulesets where id='chucky-showdown/1'"),false);
  for(let level=1;level<=7;level++){
    const all=cards('As 2s 3s 4s').concat(cards('8h Jd 6c Qh 9h 7h').slice(0,level-1),cards('5s'));
    assert.deepEqual(await rank(all),[8,5], 'best five using last of '+level+' private cards');
  }
  assert.deepEqual(await rank(cards('2c 2s 2d Ac Ad 5h 7c Ks')), [6,2,14]);
  assert.deepEqual(await rank(cards('As Ah Kd Qc 9h 4d 7s 6s')), [1,14,13,12,9]);
  const users=[randomUUID(),randomUUID()];
  for(const id of users){
    await c.query('insert into auth.users(id) values($1)',[id]);
    await c.query("insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true",[id]);
    await c.query("insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true",[id,'Chucky Showdown '+id.slice(0,8)]);
  }

  const start=(actor,request=randomUUID())=>one("select public.arcade_start($1,$2,'chucky-showdown')",[actor,request]);
  const step=(actor,id,rev=null,round=null,request=null,action=null,level=null,token=null)=>
    one('select public.arcade_chucky_showdown_step($1,$2,$3,$4,$5,$6,$7,$8)',[actor,id,rev,round,request,action,level,token]);
  await c.query("update private.arcade_recovery_state set last_completed_at=clock_timestamp(),failure=null");
  await rejected(()=>start(users[0]),/unavailable/);
  const activate=readFileSync('supabase/chucky-showdown/activate.sql','utf8');
  await rejected(()=>c.query(activate),/publication_mismatch/);
  const digestSql=activate.slice(activate.indexOf('SELECT md5'),activate.indexOf('IF digest_i')).replace(' INTO digest_i','');
  const digest=await one(digestSql);
  await c.query("insert into public.system_settings(key,value) values('release_publication',jsonb_build_object('buildSha',repeat('a',40))) on conflict(key) do update set value=excluded.value");
  await c.query("select set_config('app.chucky_showdown_release_sha',repeat('a',40),true)");
  await rejected(()=>c.query(activate),/authority_changed/);
  await c.query("select set_config('app.chucky_showdown_authority_hash',$1,true)",[digest]);
  await c.query(activate);
  const request=randomUUID(),run=await start(users[0],request),opponent=await start(users[1]);
  assert.equal((await start(users[0],request)).id,run.id);
  await rejected(()=>step(users[1],run.id),/not_found/);
  await rejected(()=>step(null,run.id),/recovery_denied/);
  assert.equal(await one("select has_function_privilege('authenticated','public.arcade_chucky_showdown_step(uuid,uuid,bigint,text,uuid,text,integer,uuid)','execute')"),false);
  await rejected(()=>c.query("update public.game_defaults set decision_timer_seconds=0 where game_type='chucky-showdown'"),/duration|constraint/);
  await c.query("update public.game_defaults set decision_timer_seconds=15 where game_type='chucky-showdown'");
  assert.equal(await one("select id from private.arcade_rulesets where game='chucky-showdown' and enabled"),'chucky-showdown/1-duration-15');
  assert.equal(run.config.durationMs,30000);
  await c.query(`create function pg_temp.reject_write() returns trigger language plpgsql as $$ begin raise exception 'outside Arcade: %',tg_table_name;end $$;
    do $$ declare t record;begin for t in select schemaname,tablename from pg_tables where schemaname in ('public','private') and tablename not like 'arcade_%'
      loop execute format('create trigger chucky_showdown_write_guard before insert or update or delete or truncate on %I.%I for each statement execute function pg_temp.reject_write()',t.schemaname,t.tablename);end loop;end $$`);
  await c.query(`create function pg_temp.guard_game() returns trigger language plpgsql as $$begin
    if tg_op<>'INSERT' and old.game<>'chucky-showdown' then raise exception 'other game changed';end if;
    if tg_op<>'DELETE' and new.game<>'chucky-showdown' then raise exception 'other game changed';end if;
    if tg_op='DELETE' then return old;end if;return new;end$$;
    create trigger chucky_showdown_other_run before insert or update or delete on private.arcade_runs for each row execute function pg_temp.guard_game();
    create trigger chucky_showdown_other_record before insert or update or delete on private.arcade_results for each row execute function pg_temp.guard_game();`);

  const actor=users[0],id=run.id;
  let v=(await step(actor,id)).projection;
  const raw=()=>one('select state from private.arcade_runs where id=$1',[id]);
  const patch=async(fields)=>c.query('update private.arcade_runs set state=state||$2::jsonb where id=$1',[id,fields]);
  const advance=async()=>{await patch({due:Date.now()-1});v=(await step(actor,id)).projection;};
  const act=async(action,level=null,request=randomUUID())=>{
    const res=await step(actor,id,v.revision,v.roundId,request,action,level);
    assert.equal(res.outcome,'committed');v=res.projection;
  };
  assert.equal(v.phase,'deal');assert.equal(v.durationMs,30000);
  assert.ok(unique([...v.player,...v.community]));assert.deepEqual(v.chucky,[]);
  await rejected(()=>act('press',1),/illegal_action/);
  await advance();assert.equal(v.phase,'decision');assert.deepEqual(v.chucky,[]);
  assert.equal(v.due-v.since,30000);assert.equal((await step(actor,id)).projection.due,v.due);
  await rejected(()=>act('press',0),/illegal_action/);await rejected(()=>act('press',8),/illegal_action/);
  // Every subset and remaining choice: these 448 edges span all 5,040 orderings.
  assert.equal(await one(`with base as (select state s from private.arcade_runs where id=$1),
    subsets as (select mask,coalesce((select jsonb_agg(i) from generate_series(1,7) i where mask&(1<<(i-1))<>0),'[]') levels from generate_series(0,126) mask)
    select count(*)::int from base,subsets,generate_series(1,7) n where mask&(1<<(n-1))=0
      and (private.chucky_showdown_act_v1(s||jsonb_build_object('levels',levels),'press',n,123)->>'level')::int=n`,[id]),448);
  const oldFrame=v,pressId=randomUUID(),player=v.player;
  for(const level of [4,1,7,2,6,3,5]){
    const board=v.community,previousRisk=v.risk;
    await act('press',level,level===4?pressId:randomUUID());
    assert.equal(v.phase,'showdown');assert.deepEqual(v.chucky,[]);
    const committed=(await raw()).chucky;
    assert.equal(committed.length,level);assert.ok(unique([...player,...board,...committed]));
    if(level===4){
      assert.equal((await step(actor,id,oldFrame.revision,oldFrame.roundId,pressId,'press',4)).outcome,'duplicate');
      await rejected(()=>step(actor,id,oldFrame.revision,oldFrame.roundId,pressId,'press',1),/request_conflict/);
      assert.deepEqual((await raw()).chucky,committed);
    }
    for(let n=1;n<=level;n++){
      await advance();assert.deepEqual(v.chucky,committed.slice(0,n));
      assert.equal(v.phase,'showdown');assert.equal(v.risk,previousRisk);
    }
    // A deterministic, legal hand for payout; normal draws were verified above.
    await patch({player:cards('As Ks Qs Js'),community:cards('10s 2h 3d 4c'),chucky:cards('8d 8h 7c 7h 6c 6h 5s').slice(0,level)});
    await advance();assert.equal(v.phase,'win');assert.equal(v.risk,previousRisk+100*level);
    assert.ok(v.levels.includes(level));
    await patch({player});await advance();
    if(level!==5){
      assert.equal(v.phase,'deal');assert.equal(v.fresh,false);assert.deepEqual(v.player,player);
      assert.ok(unique([...v.player,...v.community]));assert.notDeepEqual(v.community,board);
      await advance();await rejected(()=>act('press',level),/illegal_action/);
    }
  }
  assert.equal(v.reason,'all');assert.equal(v.bank,2800);assert.equal(v.risk,0);
  await advance();assert.equal(v.hand,2);assert.deepEqual(v.levels,[]);assert.equal(v.fresh,true);
  await advance();await act('bank');assert.equal(v.bank,2800);assert.equal(v.beforeRisk,0);
  await advance();await advance();await patch({risk:500,levels:[5]});await advance();
  assert.equal(v.reason,'timeout');assert.equal(v.bank,3300);
  await advance();assert.equal(v.round,2);assert.equal(v.bank,0);assert.equal(v.completedRounds,3300);
  await advance();await patch({risk:200,levels:[2]});await act('press',1);
  await patch({player:cards('10s 2h 3d 5c'),community:cards('As Kh Qd Jc'),chucky:cards('10h')});
  await advance();await advance();assert.equal(v.reason,'cracked');assert.equal(v.beforeRisk,200);
  assert.equal(v.bank,0);assert.equal(v.completedRounds,3300);assert.equal(v.risk,0);
  for(let h=5;h<=9;h++){
    await advance();await advance();assert.equal(v.hand,h);assert.deepEqual(v.levels,[]);
    if(h===6)await patch({risk:100,levels:[1]});
    if(h%2===0)await act('bank');else await advance();
    assert.equal(v.reason,h%2===0?'bank':'timeout');
  }
  assert.equal(v.status,'completed');assert.equal(v.score,3400);
  assert.deepEqual((await raw()).results.map(r=>r.payouts),[[2800,0,500],[0,0,100],[0,0,0]]);
  assert.equal((await step(actor,id,oldFrame.revision,oldFrame.roundId,pressId,'press',4)).outcome,'duplicate');
  assert.equal((await step(actor,id,oldFrame.revision,oldFrame.roundId,randomUUID(),'bank')).outcome,'stale');
  assert.equal(await one('select count(*)::int from private.arcade_results where run_id=$1',[id]),1);
  const history=(user,before=null)=>one('select public.arcade_chucky_showdown_history($1,$2)',[user,before]);
  assert.equal((await history(actor))[0].score,3400);assert.deepEqual(await history(actor,id),[]);assert.deepEqual(await history(users[1]),[]);
  assert.ok(Date.parse((await history(actor))[0].completedAt));
  for(const period of ['30','all']){
    const b=await one("select public.arcade_leaderboard($1,'chucky-showdown',$2,$3,$4)",[actor,period,id,run.ruleset]);
    assert.equal(b.rows[0].score,3400);assert.ok(Date.parse(b.rows[0].completedAt));
  }
  await rejected(()=>c.query('update private.arcade_results set score=1 where run_id=$1',[id]),/immutable/);
  await step(users[1],opponent.id);
  await c.query("update private.arcade_runs set state=jsonb_set(state,'{due}','0') where id=$1",[opponent.id]);
  const token=randomUUID();
  await c.query("update private.arcade_recovery_state set token=$1,claimed=true,expires_at=clock_timestamp()+interval '1 minute'",[token]);
  const cold=(await step(null,opponent.id,null,null,null,null,null,token)).projection;
  assert.equal(cold.status,'completed');assert.equal(cold.hand,9);assert.equal(cold.score,0);
  console.log('PASS: admission, all level orders, rank/tie, privacy, immutable draws, timers, nine payouts, history, leaderboards, authorization, replay, cold recovery, write isolation. Digest',digest);
}finally{await c.query('rollback');await c.end();}
