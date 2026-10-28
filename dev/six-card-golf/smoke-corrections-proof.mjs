import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {randomUUID as uuid} from 'node:crypto';
import assert from 'node:assert/strict';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
const connect=async database=>{const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await c.connect();return c;};
const source=JSON.parse(read('qualification.local/six-card-golf/ui-context.json','utf8')).database;
const database='golf_smoke_'+Date.now(),root='qualification.local/golf-sweep-smoke';mkdirSync(root,{recursive:true});
const provision=await connect('postgres');await provision.query('CREATE DATABASE '+database+' TEMPLATE '+source);await provision.end();
const c=await connect(database),peers=[];const evidence={database,production:false,checks:[]};
const q=async(c,sql,args=[])=> (await c.query(sql,args)).rows[0]?.v;
const login=async(c,user)=>{await c.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,role:'authenticated'})]);};
const snap=(c,d)=>q(c,'SELECT public.golf_snapshot($1) v',[d]);
const act=(c,d,s,id,action,items=null)=>q(c,'SELECT public.golf_action($1,$2,$3,$4,$5,$6) v',[d,s.identity.roundId,id,s.revision,action,items]);
try{
 await c.query(read('supabase/six-card-golf/rules-v2.candidate.sql','utf8'));
 await c.query(read('dev/six-card-golf/smoke-installed.sql','utf8'));
 await c.query(read('supabase/six-card-golf/smoke-corrections.candidate.sql','utf8'));
 await c.query("UPDATE private.golf_release SET enabled=true,admission_enabled=true;UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 for(let i=0;i<4;i++)peers.push(await connect(database));
 for(const n of [2,3,4]){
  const users=Array.from({length:n},uuid),ids=Array.from({length:n},uuid),g=uuid(),offer=new Date(Date.now()+600000).toISOString();
  for(let i=0;i<n;i++){await c.query('INSERT INTO auth.users(id) VALUES($1)',[users[i]]);await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true)',[users[i],'Smoke '+users[i]]);}
  await c.query("INSERT INTO public.games(id,status,current_host,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',$2,false,4,$3,0,false,false)",[g,users[0],offer]);
  for(let i=0;i<n;i++)await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[ids[i],g,users[i],4-i]);
  await login(c,users[0]);const d=(await q(c,"SELECT public.golf_configure($1,$2,4,'six-card-golf','{\"ante_amount\":5}',$3) v",[g,ids[0],offer])).dealer_game.id;
  for(let i=1;i<n;i++){await login(c,users[i]);await q(c,"SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v",[g,d,ids[i]]);}
  for(let i=0;i<n;i++){await login(peers[i],users[i]);await peers[i].query('SET ROLE authenticated');}
  const frames=await Promise.all(peers.slice(0,n).map(p=>snap(p,d))),first=frames[0];
  assert(frames.every(s=>s.canAct&&s.openingMode==='simultaneous'&&!s.openingCommitted));
  assert(frames.every(s=>Object.values(s.tableaus).every(b=>b.cards.every(x=>x===null))));
  await assert.rejects(act(peers[0],d,first,uuid(),'draw'),/phase|illegal_open|not_actor/);
  const openingActor=ids.indexOf(first.players[first.turnIndex].id);
  await assert.rejects(act(peers[openingActor],d,first,uuid(),'discard',[0,3]),/illegal_open/);
  const requests=users.map(()=>uuid());
  const results=await Promise.all(peers.slice(0,n).map((p,i)=>act(p,d,frames[i],requests[i],'open',[i%3,i%3+3])));
  const final=await snap(peers[0],d);assert.equal(final.phase,'playing');assert.equal(final.openingRemaining,0);assert.equal(final.turnIndex,(final.dealerIndex+1)%n);
  assert.equal(final.revision,first.revision+n);assert(Object.values(final.tableaus).every(b=>b.exposed.filter(Boolean).length===2));
  for(const r of results.filter(r=>r.phase==='opening'))assert(Object.values(r.tableaus).every(b=>b.cards.every(x=>x===null)));
  const replay=await act(peers[0],d,first,requests[0],'open',[0,3]);assert.equal(replay.revision,final.revision);assert.deepEqual(replay.receipt,results[0].receipt);
  await assert.rejects(act(peers[0],d,first,requests[0],'open',[1,4]),/replay_conflict/);
  const same=await act(peers[0],d,first,uuid(),'open',[3,0]);assert.equal(same.revision,final.revision);
  await assert.rejects(act(peers[0],d,first,uuid(),'open',[1,4]),/opening_committed/);
  const actor=ids.indexOf(final.players[final.turnIndex].id),draw=await act(peers[actor],d,final,uuid(),'draw');
  const observed=await Promise.all(peers.slice(0,n).map(p=>snap(p,d)));assert(observed.every(s=>s.pending.card===draw.pending.card&&s.publicDraw));
  assert(observed.every(s=>Object.values(s.tableaus).every(b=>b.cards.every((x,i)=>b.exposed[i]||x===null))));
  const observer=await q(c,'SELECT private.golf_visible(state) v FROM private.golf_matches WHERE dealer_game_id=$1',[d]);assert.deepEqual(observer.pending,draw.pending);assert(!('stock' in observer));
  await assert.rejects(act(peers[actor],d,final,uuid(),'reject'),/stale_revision/);
  await login(c,uuid());await assert.rejects(snap(c,d),/membership_required/);
  for(let i=0;i<n;i++)await peers[i].query('RESET ROLE');
  evidence.checks.push(n+' seats: independent connections, common revision, privacy barrier, first actor, exact replay, changed replay rejection, public draw, stale action and outsider rejection');
 }
 await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='180s'");
 await c.query(read('supabase/six-card-golf/core-proof.sql','utf8').split('DO $$')[0]);
 await c.query(read('supabase/six-card-golf/proof.sql','utf8').split('DO $$')[0]);
 for(const proof of ['proof','financial-proof','recovery-proof']){
  let sql=read('supabase/six-card-golf/'+proof+'.sql','utf8').replace(/\r\n/g,'\n');
  if(proof==='proof')sql=sql.replace("IF v->>'phase'<>'complete' THEN","IF v->>'phase'<>'complete' AND action<>'open' THEN");
  if(proof==='recovery-proof')sql=sql.replace(" SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;\n PERFORM pg_temp.golf_login(u);", `
 -- A peer commit cannot renew the shared opening allowance.
 UPDATE public.games SET timeout_enforcement_enabled=false,timeout_action='none' WHERE id=g;
 PERFORM private.golf_recover();
 PERFORM pg_temp.golf_assert((SELECT is_paused FROM public.games WHERE id=g),'remaining human expiry pauses without losing bot commit');
 PERFORM pg_temp.golf_login(u);
 PERFORM public.set_game_paused(g,false,d,(SELECT pause_version FROM public.games WHERE id=g));
 SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.golf_login(u);`);
  await c.query(sql);evidence.checks.push(proof+' rollback');
 }
 await c.query('SET CONSTRAINTS ALL IMMEDIATE');await c.query('ROLLBACK');
 evidence.passed=true;write(root+'/context.json',JSON.stringify({database}));
}catch(e){await c.query('ROLLBACK');evidence.error={message:e.message,where:e.where};process.exitCode=1;}
finally{write(root+'/database-proof.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));for(const p of peers)await p.end();await c.end();}
