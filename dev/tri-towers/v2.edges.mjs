import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {randomUUID as uuid} from 'node:crypto';
import {connect,fixture,state,action,actor,balances} from './bots-fixture.mjs';
const {database}=JSON.parse(await readFile('qualification.local/tri-towers/v2-context.json','utf8')),c=await connect(database),passed=[];
const pass=s=>{passed.push(s);console.log('PASS',s);};
try{
 const f=await fixture(c,database,[false,false]),m=await state(c,f);
 const attempts=await Promise.allSettled([action(database,f,f.users[1],m.revision,'draw'),action(database,f,f.users[1],m.revision,'draw')]);
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.match(attempts.find(r=>r.status==='rejected').reason.message,/stale_revision/);
 const started=await state(c,f);assert.equal(started.state.cursor,30);assert.equal(started.revision,m.revision+1);
 await c.query('BEGIN');await c.query('UPDATE public.games SET is_paused=true WHERE id=$1',[f.id]);const paused=await state(c,f);await c.query('SELECT pg_sleep(0.15)');await c.query('UPDATE public.games SET is_paused=false WHERE id=$1',[f.id]);const resumed=await state(c,f);assert(resumed.state.deadline-paused.state.deadline>=140);assert.equal(resumed.state.cursor,30);await c.query('ROLLBACK');
 pass('Concurrent first actions admit exactly once; pause/resume preserves the active clock and board');
 const late=await fixture(c,database,[false,false]),lm=await state(c,late);await c.query('BEGIN');await c.query('SELECT id FROM public.rounds WHERE id=$1 FOR UPDATE',[lm.round_id]);
 await c.query('UPDATE private.tri_towers_matches SET state=jsonb_set(state,\'{deadline}\',to_jsonb($2::bigint)) WHERE dealer_game_id=$1',[late.dealer,Date.now()+120]);
 const pending=action(database,late,late.users[1],lm.revision,'draw');await c.query('SELECT pg_sleep(0.25)');await c.query('COMMIT');const expired=await pending;
 assert.equal(expired.phase,'stage_complete');assert.equal(expired.stages.at(-1).reason,'ready_timeout');assert.equal(expired.stockRemaining,23);
 pass('Lock-delayed first action uses post-lock time; expired Ready cannot start a clock or consume stock');
 async function denied(kind){await c.query('BEGIN');try{const id=uuid(),users=[uuid(),uuid()],players=[uuid(),uuid()],deadline=new Date(Date.now()+600000).toISOString();
  await c.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline) VALUES($1,'game_selection',$2,2,$3)",[id,kind==='real-money',deadline]);
  for(let i=0;i<2;i++){await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,$3)',[users[i],'Boundary '+users[i],!(kind==='revoked'&&i===0)]);await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,$5)',[players[i],id,users[i],2-i,i===1]);}
  if(kind==='closed')await c.query('UPDATE private.tri_towers_release SET admission_enabled=false');
  await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[users[0]]);await c.query('SET LOCAL ROLE authenticated');await c.query('SAVEPOINT denial');
  const stake=kind==='zero'?0:kind==='negative'?-1:kind==='fraction'?1.5:kind==='large'?10000:5;
  await assert.rejects(c.query("SELECT public.tri_towers_configure($1,$2,2,'tri-towers',$3,$4)",[id,players[0],{ante_amount:stake},deadline]),/config|real_money_closed|release_closed|admission_closed/);await c.query('ROLLBACK TO SAVEPOINT denial');await c.query('RESET ROLE');
  assert.equal((await c.query('SELECT count(*) n FROM private.tri_towers_matches WHERE game_id=$1',[id])).rows[0].n,'0');assert.equal((await c.query('SELECT sum(chips) n FROM public.players WHERE game_id=$1',[id])).rows[0].n,'200');
 }finally{await c.query('ROLLBACK');}}
 for(const kind of ['zero','negative','fraction','large','real-money','revoked','closed'])await denied(kind);
 pass('Actual authenticated admission denies invalid stakes, real money, revoked accounts and the closed flag without financial changes');
 const old=(await c.query("SELECT state FROM private.tri_towers_matches WHERE state#>>'{rules,version}'<>'tri-towers/2' LIMIT 1")).rows[0]?.state;
 assert(old);const v1={...old,phase:'playing',deadline:120000,cursor:29,run:0,score:1000};
 for(const a of ['draw','take_score','give_up']){const result=(await c.query('SELECT private.tri_towers_reduce($1,$2,NULL,1000) current,private.tri_towers_reduce_v1($1,$2,NULL,1000) legacy',[v1,a])).rows[0];assert.deepEqual(result.current,result.legacy);}
 pass('Frozen v1 draw, Take Score and Give Up retain identical legacy authority');
 await writeFile('qualification.local/tri-towers/v2-edges.json',JSON.stringify({passed,productionWrites:0},null,2));
}finally{await c.end();}
