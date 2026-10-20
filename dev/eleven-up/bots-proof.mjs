import {readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {connect,context} from './bots-database.mjs';
import {migrationSql,hash} from './bots-release-package.mjs';
const {database}=context(),c=await connect(database),evidence=[];
const releasePackage=process.argv.includes('--release-package');
const unwrapped=s=>s.replace('\nBEGIN;\n','\n').replace(/\nCOMMIT;\s*$/,'\n');
const candidate=()=>releasePackage?unwrapped(migrationSql()):['bots','bot-recovery'].map(n=>read(`supabase/eleven-up/${n}.sql`,'utf8')).join('\n');
const q=async(sql,args=[])=>(await c.query(sql,args)).rows[0]?.v;
const pass=(name,details={})=>{evidence.push({name,...details});console.log('PASS',name);};
async function actor(user){await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[user,JSON.stringify({sub:user,role:'authenticated'})]);}
async function rejects(sql,args,pattern){await c.query('savepoint reject');try{await assert.rejects(()=>c.query(sql,args),pattern);}finally{await c.query('rollback to reject');await c.query('release reject');}}
async function fixture(real=false){
 await c.query("update private.game_recovery_dispatch_state set last_completed_at=clock_timestamp(),last_outcome='completed'");
 const f={game:uuid(),users:[uuid(),uuid()],players:[uuid(),uuid()],deadline:new Date(Date.now()+600000).toISOString()};
 for(const u of f.users){await c.query('insert into auth.users(id) values($1)',[u]);await c.query("insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true",[u,'11 Bot proof '+u.slice(0,8)]);}
 await c.query("insert into public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) values($1,'game_selection',$2,2,$3,0,false,false)",[f.game,real,f.deadline]);
 for(let i=0;i<2;i++)await c.query("insert into public.players(id,game_id,user_id,position,chips,is_bot) values($1,$2,$3,$4,100,$5)",[f.players[i],f.game,f.users[i],2-i,i===1]);
 await actor(f.users[0]);await c.query('set local role authenticated');
 const offer=await q("select public.eleven_up_configure($1,$2,2,'eleven-up','{\"ante_amount\":7}',$3) v",[f.game,f.players[0],f.deadline]);await c.query('reset role');f.dealer=offer.dealer_game.id;
 assert.equal(await q('select count(*)::int v from private.eleven_up_matches where dealer_game_id=$1',[f.dealer]),0);
 await c.query('select public.advance_ante_phase($1,$2)',[f.game,f.dealer]);
 return f;
}
async function state(f){return q('select state v from private.eleven_up_matches where dealer_game_id=$1',[f.dealer]);}
async function fullPlay(real){
 const f=await fixture(real);let moves=0,humanMoves=0,reconnects=0,steps=0,lastHuman,admissionRolledBack=false;
 const rules=(await state(f)).rules;
 while(++steps<1000){
  const m=(await c.query('select * from private.eleven_up_matches where dealer_game_id=$1',[f.dealer])).rows[0],s=m.state;
  if(s.phase==='complete')break;
  if(['intro','stage_complete'].includes(s.phase)){
   await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)) where dealer_game_id=$1",[f.dealer,Date.now()-1]);await c.query('select private.eleven_up_recover()');continue;
  }
  if(s.players[s.turnIndex].isBot){
   // Honor the real durable schedule; the trigger intentionally rejects due-only rewrites.
   await c.query('select pg_sleep(greatest(0,($1::bigint-floor(extract(epoch from clock_timestamp())*1000))/1000.0)+0.01)',[m.bot_due_at]);
   await c.query('select private.eleven_up_recover()');const after=await state(f);assert.notDeepEqual(after,s);moves++;
   if(releasePackage&&!admissionRolledBack){
    await c.query(unwrapped(read('supabase/eleven-up/rollback-bot-admission.sql','utf8')));
    await c.query('savepoint closed_admission');
    try{await assert.rejects(()=>fixture(false),/bots_not_supported/);}finally{await c.query('rollback to closed_admission');await c.query('release closed_admission');}
    admissionRolledBack=true;
   }
   const rev=await q('select revision v from private.eleven_up_matches where dealer_game_id=$1',[f.dealer]);await c.query('select private.eleven_up_recover()');assert.equal(await q('select revision v from private.eleven_up_matches where dealer_game_id=$1',[f.dealer]),rev);
  }else{
   await actor(f.users[0]);await c.query('set local role authenticated');
   const snapshot=await q('select public.eleven_up_snapshot($1) v',[f.dealer]);assert(!('deck' in snapshot));reconnects++;
   const action=s.phase==='ready'?'pass':'take_score',request=uuid();
   const a=await q('select public.eleven_up_action($1,$2,$3,$4,null) v',[f.dealer,request,m.revision,action]);
   const replay=await q('select public.eleven_up_action($1,$2,$3,$4,null) v',[f.dealer,request,m.revision,action]);
   assert.deepEqual({...replay,serverAt:0},{...a,serverAt:0});
   await c.query('reset role');lastHuman=[f.dealer,request,m.revision,action];humanMoves++;
  }
 }
 assert(steps<1000);assert(moves>2);assert(humanMoves>=4);assert.deepEqual((await state(f)).rules,rules);
 await c.query('set constraints all immediate');
 const balances=(await c.query('select id,chips from public.players where game_id=$1',[f.game])).rows;assert.equal(balances.reduce((n,p)=>n+p.chips,0),200);
 assert.equal(await q('select count(*)::int v from public.game_results where dealer_game_id=$1',[f.dealer]),1);
 assert.equal(await q('select count(*)::int v from public.session_player_snapshots s join public.players p on p.id=s.player_id and p.chips=s.chips where s.dealer_game_id=$1',[f.dealer]),2);
 await actor(f.users[0]);await c.query('set local role authenticated');await q('select public.eleven_up_action($1,$2,$3,$4,null) v',lastHuman);await c.query('reset role');
 await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{terminal,deadline}','0') where dealer_game_id=$1",[f.dealer]);await c.query('select private.eleven_up_recover()');
 await actor(f.users[0]);await c.query('set local role authenticated');await q('select public.eleven_up_action($1,$2,$3,$4,null) v',lastHuman);await c.query('reset role');
 assert.equal(await q('select finished v from private.eleven_up_matches where dealer_game_id=$1',[f.dealer]),true);
 assert.deepEqual((await c.query('select id,chips from public.players where game_id=$1',[f.game])).rows,balances);
 await c.query('set constraints all deferred');pass('Complete human/bot match and reconnect/replay/continuation '+(real?'real':'fake'),{moves,humanMoves,reconnects,balances});
 if(admissionRolledBack){await c.query(candidate());pass('Admission rollback rejects new bots while admitted bot match completes and settles');}
}
async function policy(){
 const rules=await q('select private.eleven_up_rules() v');
 const board=await q("select private.eleven_up_board_deal(jsonb_build_object('rules',$1::jsonb,'score',0),1000) v",[rules]);
 const b={...board,phase:'ready',deadline:99999,slots:Array(22).fill(null),current:48,cursor:52};b.slots[8]=16;b.slots[17]=20;b.slots[21]=32;
 const v=await q('select private.eleven_up_visible($1) v',[b]);
 const choice=await q('select private.eleven_up_bot_choice($1,4000) v',[v]);assert.equal(choice.action,'group');assert.deepEqual(choice.items,[16,20,32]);
 const reduced=await q('select private.eleven_up_board_reduce($1,$2,$3,4000) v',[b,choice.action,choice.items]);assert.equal(reduced.result.reason,'cleared');
 const altered={...v,deck:[51,50],cursor:0,slots:[...v.slots]};altered.slots[0]=0; // covered/undisclosed slot omitted from exposed
 assert.deepEqual(await q('select private.eleven_up_bot_choice($1,4000) v',[altered]),choice);
 assert.equal(await q('select private.eleven_up_bot_choice($1,99999) v',[v]),null);
 for(let i=0;i<30;i++){
  let s=await q("select private.eleven_up_board_deal(jsonb_build_object('rules',$1::jsonb,'score',0),1000) v",[rules]);s=await q("select private.eleven_up_board_reduce($1,'tick',null,3500) v",[s]);let n=0;
  while(['ready','playing'].includes(s.phase)&&n++<120){const choice=await q('select private.eleven_up_bot_choice(private.eleven_up_visible($1),$2) v',[s,4000+n*750]);assert(choice);s=await q('select private.eleven_up_board_reduce($1,$2,$3,$4) v',[s,choice.action,choice.items??null,4000+n*750]);}assert.equal(s.phase,'stage_complete');
 }
 pass('Visible-only three-ball policy, deadline precedence, 30 randomized legal full rounds');
}
async function lifecycle(){
 const f=await fixture(),s=await state(f);assert(s.players[0].isBot);
 await c.query("update private.eleven_up_matches set state=state||jsonb_build_object('phase','ready','deadline',$2::bigint) where dealer_game_id=$1",[f.dealer,Date.now()+30000]);
 await actor(f.users[1]);await c.query('set local role authenticated');await rejects("select public.eleven_up_action($1,$2,0,'pass',null)",[f.dealer,uuid()],/participant_required/);await c.query('reset role');
 await actor(f.users[0]);await c.query('update public.games set is_paused=true where id=$1',[f.game]);const paused=await state(f);
 assert.equal(await q('select bot_due_at v from private.eleven_up_matches where dealer_game_id=$1',[f.dealer]),null);await c.query('select private.eleven_up_recover()');assert.deepEqual(await state(f),paused);
 await c.query('update public.games set is_paused=false where id=$1',[f.game]);assert(await q('select bot_due_at is not null v from private.eleven_up_matches where dealer_game_id=$1',[f.dealer]));
 await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)) where dealer_game_id=$1",[f.dealer,Date.now()-10000000]);
 await c.query('select private.eleven_up_recover()');assert.equal((await state(f)).phase,'complete');
 pass('Bot impersonation rejected, pause/resume schedule and zero-client deadline completion');
}
async function canonicalSeats(){
 const u=uuid(),g=uuid(),p=uuid(),bot=uuid(),deadline=new Date(Date.now()+600000).toISOString();
 await c.query('insert into auth.users(id) values($1)',[u]);
 await c.query("insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true",[u,'11 owner '+u]);
 await c.query("insert into public.games(id,current_host,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) values($1,$2,'game_selection',false,2,$3,0,false,false)",[g,u,deadline]);
 await c.query('insert into public.players(id,game_id,user_id,position,chips,is_bot) values($1,$2,$3,2,100,false)',[p,g,u]);
 await actor(u);await c.query('set local role authenticated');
 const created=await q("select public.create_session_bot($1,$2,'normal',1,false,false) v",[g,bot]);assert.equal(created.player.is_bot,true);
 const replay=await q("select public.create_session_bot($1,$2,'normal',1,false,false) v",[g,bot]);assert.equal(replay.deduped,true);assert.equal(replay.player.id,created.player.id);
 await c.query('reset role');
 await c.query('savepoint real_rejection');await c.query('update public.games set real_money=true where id=$1',[g]);
 await c.query('set local role authenticated');
 await rejects("select public.create_session_bot($1,$2,'normal',3,false,false)",[g,uuid()],/fake_money_only/);
 await rejects("select public.eleven_up_configure($1,$2,2,'eleven-up','{\"ante_amount\":7}',$3)",[g,p,deadline],/bots_fake_money_only/);
 await c.query('reset role');await c.query('rollback to real_rejection');await c.query('release real_rejection');
 await c.query('set local role authenticated');
 const offer=await q("select public.eleven_up_configure($1,$2,2,'eleven-up','{\"ante_amount\":7}',$3) v",[g,p,deadline]);await c.query('select public.advance_ante_phase($1,$2)',[g,offer.dealer_game.id]);
 const waiting=await q("select public.create_session_bot($1,$2,'normal',3,true,true) v",[g,uuid()]);assert(waiting.player.waiting&&waiting.player.sitting_out);
 await c.query('reset role');assert.equal(await q("select jsonb_array_length(state->'players') v from private.eleven_up_matches where dealer_game_id=$1",[offer.dealer_game.id]),2);
 assert.equal(await q("select count(*)::int v from public.session_events where game_id=$1 and event_type='bot_added'",[g]),2);
 pass('Canonical Add Bot, UUID replay, waiting admission, and real-money bot refusal');
}
function matrix(){
 let sql=read('supabase/multiplayer-money/matrix.sql','utf8').replaceAll('__FAMILY__','eleven_up').replaceAll('__GAME__','eleven-up');
 sql=sql.replace("100,'active',false,false,false,true FROM generate_series(1,n)x","100,'active',false,false,x>1 AND NOT real_mode,true FROM generate_series(1,n)x");
 const a=sql.indexOf('  FOR i IN 2..n LOOP'),b=sql.indexOf('  PERFORM pg_temp.money_assert((SELECT stake=stake_i',a);
 assert(a>0&&b>a);sql=sql.slice(0,a)+"  IF real_mode THEN\n"+sql.slice(a,b)+"  ELSE PERFORM public.advance_ante_phase(g,d);END IF;\n"+sql.slice(b);
 return sql;
}
try{
 const before=await q("select jsonb_object_agg(n.nspname||'.'||p.oid::text,md5(pg_get_functiondef(p.oid))) v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.prokind='f' and p.proname not in('eleven_up_configure','megatouch_begin','eleven_up_recover','eleven_up_bot_choice','eleven_up_schedule_bot')");
 await c.query('begin');await c.query(candidate());
 await c.query('update private.eleven_up_release set enabled=true,admission_enabled=true');
 await policy();await lifecycle();await canonicalSeats();await fullPlay(false);
 await c.query("update private.game_recovery_dispatch_state set last_completed_at=clock_timestamp(),last_outcome='completed'");
 await c.query(matrix());const financial=(await c.query('select * from money_evidence')).rows;assert.equal(financial.length,36);pass('Both money modes, 2–7 seats: winner/split/tie, exact chips/ledger/snapshots, fault rollback',{cases:financial.length});
 const after=await q("select jsonb_object_agg(n.nspname||'.'||p.oid::text,md5(pg_get_functiondef(p.oid))) v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.prokind='f' and p.proname not in('eleven_up_configure','megatouch_begin','eleven_up_recover','eleven_up_bot_choice','eleven_up_schedule_bot')");assert.deepEqual(after,before);
 await c.query('rollback');pass('All candidate changes and synthetic data rolled back; unrelated functions unchanged');
 write('qualification.local/eleven-up-bots/'+(releasePackage?'release-proof.json':'proof.json'),JSON.stringify({database,...(releasePackage?{migrationSha256:hash(migrationSql())}:{}),evidence},null,2));
}catch(e){await c.query('rollback').catch(()=>{});throw e;}finally{await c.end();}
