// Exercise released games against the combined installed LOCAL package.
// No authority reinstallation, hosted connection, or committed fixtures.
import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID as uuid} from 'node:crypto';
import {connect} from './database.mjs';
const meta=JSON.parse(read('dev/battle31/evidence/package-proof.json','utf8'));
const c=await connect(meta.database),checks=[];
const q=async(s,a=[])=>(await c.query(s,a)).rows;
const facts=()=>q("SELECT jsonb_build_object('players',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.players p),'users',(SELECT count(*) FROM auth.users),'games',(SELECT count(*) FROM public.games),'raceGate',(SELECT to_jsonb(r) FROM private.race_poker_release r),'battleGate',(SELECT to_jsonb(r) FROM private.battle31_release r)) facts");
async function rejected(fn,pattern){await c.query('SAVEPOINT expected');try{await assert.rejects(fn,pattern);}finally{await c.query('ROLLBACK TO SAVEPOINT expected');}}
async function elevenBot(real){
 const users=[uuid(),uuid()],players=[uuid(),uuid()],game=uuid(),deadline=new Date(Date.now()+600000).toISOString();
 for(const u of users){await c.query('INSERT INTO auth.users(id) VALUES($1)',[u]);await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[u,'Combined '+u]);}
 await c.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',$2,2,$3,0,false,false)",[game,real,deadline]);
 for(let i=0;i<2;i++)await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,$5)',[players[i],game,users[i],2-i,i===1]);
 await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[users[0],JSON.stringify({sub:users[0],role:'authenticated'})]);
 const offer=(await q("SELECT public.eleven_up_configure($1,$2,2,'eleven-up','{\"ante_amount\":7}',$3) v",[game,players[0],deadline]))[0].v;
 return {game,dealer:offer.dealer_game.id};
}
try{
 const before=await facts();await c.query('BEGIN');
 for(const file of ['core-proof','financial-proof','rollback-failure-proof','v2-controls-proof'])await c.query(read('supabase/race-poker/'+file+'.sql','utf8'));
 checks.push('Race v1/v2 rules, both-money financial/rollback/replay and timeout/reclaim controls');
 await c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 await rejected(()=>elevenBot(true),/bots_fake_money_only/);
 const f=await elevenBot(false);
 await rejected(async()=>{await c.query('UPDATE public.games SET real_money=true WHERE id=$1',[f.game]);await c.query("UPDATE public.players SET ante_decision='ante_up' WHERE game_id=$1",[f.game]);await c.query('SELECT private.megatouch_begin($1,$2)',[f.game,f.dealer]);},/bots_fake_money_only/);
 await c.query('SELECT public.advance_ante_phase($1,$2)',[f.game,f.dealer]);
 const state=(await q('SELECT state FROM private.eleven_up_matches WHERE dealer_game_id=$1',[f.dealer]))[0]?.state;
 assert(state?.players.some(p=>p.isBot));assert.equal(state.players.length,2);
 checks.push('11 Up fake-money human/bot admission and shared bootstrap succeed; real-money setup and bootstrap reject bots');
 // Reuse the released Ready proof body, with fresh synthetic identities only.
 const released=read('dev/eleven-up/combined-production-proof.mjs','utf8');
 const match=/const controls=`([\s\S]*?)`;/.exec(released);assert(match,'Released controls proof boundary');
 const array='ARRAY['+Array.from({length:6},()=>"'"+uuid()+"'::uuid").join(',')+']';
 const controls=match[1].replace('${array}',array);assert(!controls.includes('${'),'Unexpected proof interpolation');
 await c.query("CREATE FUNCTION pg_temp.money_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'proof: %',label;END IF;END $$");
 await c.query(controls);checks.push('11 Up Ready real pause/fake autoplay, reclaim, scoring clock and all-human safeguard');
 await c.query('ROLLBACK');assert.deepEqual(await facts(),before);
 const result={at:new Date().toISOString(),database:meta.database,packageSHA256:meta.packageSHA256,passed:true,checks,rollbackPreservesExistingState:true};
 write('dev/battle31/evidence/released-games-proof.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await c.query('ROLLBACK');await c.end();}
