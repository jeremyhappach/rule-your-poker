import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {connect} from './local.mjs';
const database=JSON.parse(read('.polish-authority/context.json')).database,admin=await connect(database),checks=[];
const q=async(sql,args=[])=>(await admin.query(sql,args)).rows[0]?.v;
async function choice(f,type,request){const db=await connect(database);try{await db.query('BEGIN');await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[f.actor]);await db.query('SET LOCAL ROLE '+(f.async?'service_role':'authenticated'));
 const v=(await db.query(f.async?'SELECT public.delayed_bonus_choice($1,$2,$3,$4,$5,$6) v':'SELECT public.competitive_bonus_choice($1,$2,$3,$4,$5) v',f.async?[f.id,f.actor,request,f.revision,f.segment,type]:[f.game,f.id,request,f.revision,type])).rows[0].v;
 await db.query('COMMIT');return v;}catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}}
try{
 await admin.query(read('dev/production-polish/fixture.sql','utf8'));
 await admin.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 await admin.query("UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()");
 for(const asyncMode of [false,true])for(const game of asyncMode?['tri-towers','quintzee','boxdrop']:['tri-towers','boxdrop','eleven-up','royal-flash']){
  for(const kind of ['duplicate','competing']){
   const f=await q('SELECT public.qualification_bonus_fixture($1,$2) v',[game,asyncMode]),request=randomUUID();
   const outcomes=await Promise.allSettled([choice(f,'skip',request),choice(f,'skip',kind==='duplicate'?request:randomUUID())]);
   assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,kind==='duplicate'?2:1,game+' '+kind);
   if(kind==='competing')assert.match(outcomes.find(o=>o.status==='rejected').reason.message,/stale|inactive/);
   assert.equal(await q('SELECT count(*)::int v FROM public.gameplay_transfer_batches WHERE game_id=$1',[f.match]),1);
   assert.equal(await q('SELECT count(*)::int v FROM public.game_results WHERE game_id=$1',[f.match]),1);
   const moneyBefore=await q('SELECT jsonb_agg(to_jsonb(p) ORDER BY id) v FROM public.players p WHERE game_id=$1',[f.match]);
   const noticesBefore=asyncMode?await q('SELECT to_jsonb(m) v FROM private.delayed_matches m WHERE id=$1',[f.match]):null;
   await choice(f,'skip',request);
   assert.deepEqual(await q('SELECT jsonb_agg(to_jsonb(p) ORDER BY id) v FROM public.players p WHERE game_id=$1',[f.match]),moneyBefore);
   if(asyncMode)assert.deepEqual(await q('SELECT to_jsonb(m) v FROM private.delayed_matches m WHERE id=$1',[f.match]),noticesBefore);
   checks.push({game,async:asyncMode,kind,onePayout:true,lateReplay:true});
  }
  const fake=await q('SELECT public.qualification_bonus_fixture($1,$2,false) v',[game,asyncMode]);
  const offered=await q(asyncMode?"SELECT state ? 'optionalBonus' v FROM private.delayed_children WHERE id=$1":`SELECT state ? 'optionalBonus' v FROM private.${game.replaceAll('-','_')}_matches WHERE dealer_game_id=$1`,[fake.id]);
  assert.equal(offered,false,'fake money unchanged');checks.push({game,async:asyncMode,fakeMoneyUnchanged:true});
 }
 write('.polish-authority/concurrency.json',JSON.stringify(checks,null,2));console.log('PASS',checks.length,'independent-connection and fake-money cases');
}finally{await admin.end();}
