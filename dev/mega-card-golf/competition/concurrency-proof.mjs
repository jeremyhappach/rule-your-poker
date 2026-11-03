// Committed fixtures are confined to a disposable loopback database, dropped below.
import {connect} from './local.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {megaLiveOperation}=await import(pathToFileURL(resolve('qualification.local/mega-competition/services/megaCardGolf/multiplayer.js')));
const database='mega_competition_'+Date.now(),root=await connect('postgres');
await root.query('CREATE DATABASE '+database+' TEMPLATE async_real_1793571492049');
const db=await connect(database),peer=await connect(database),checks=[];
const q=async(sql,args=[],client=db)=>(await client.query(sql,args)).rows[0]?.v;
const rpc=client=>async(name,args)=>q('SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') v',Object.values(args).map(v=>v&&typeof v==='object'?JSON.stringify(v):v),client);
try{
 await db.query('BEGIN');
 const golf=read('supabase/six-card-golf/rules.sql','utf8');await db.query(golf.slice(golf.indexOf('CREATE OR REPLACE FUNCTION private.golf_points'),golf.indexOf('CREATE OR REPLACE FUNCTION private.golf_integrity')));
 if(!await q("SELECT to_regclass('private.arcade_mega_configs') v"))await db.query(read('supabase/mega-card-golf/candidate.sql','utf8'));
 await db.query("INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('mega-card-golf/4','mega-card-golf','{}',true) ON CONFLICT(id) DO UPDATE SET enabled=true");
 for(const f of [...JSON.parse(read('dev/mega-card-golf/competition/installed-functions.json')),...JSON.parse(read('dev/mega-card-golf/competition/installed-lifecycle.json'))])await db.query(f.definition);
 await db.query('COMMIT');
 const migration=read('supabase/migrations/20261103191500_mega_card_golf_competition.sql','utf8');
 await db.query(migration);await db.query(migration);
 assert.deepEqual(await q('SELECT jsonb_build_array(live_enabled,async_enabled) v FROM private.mega_competition_release'),[false,false]);
 await db.query('BEGIN');await db.query(read('supabase/mega-card-golf/competition-proof.sql','utf8'));await db.query('ROLLBACK');
 checks.push('registered migration is idempotent, stays closed and passes the installed rollback financial matrix');
 await db.query('BEGIN');await db.query('UPDATE private.mega_competition_release SET live_enabled=true');
 const users=[randomUUID(),randomUUID()],players=[randomUUID(),randomUUID()],game=randomUUID(),deadline=new Date(Date.now()+600000).toISOString();
 for(const u of users){await db.query('INSERT INTO auth.users(id) VALUES($1)',[u]);await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[u,'Mega race '+u]);}
 await db.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',false,4,$2,0,false,false)",[game,deadline]);
 for(let i=0;i<2;i++)await db.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[players[i],game,users[i],4-i]);
 await q("SELECT set_config('request.jwt.claim.sub',$1,true) v",[users[0]]);
 const config=await q('SELECT private.mega_competition_config() v');config.course.holes=3;
 const setup=await rpc(db)('mega_configure',{p_game_id:game,p_dealer_player_id:players[0],p_expected_dealer_position:4,p_game_type:'mega-card-golf',p_config:{ante_amount:5,mega:config},p_expected_config_deadline:deadline}),id=setup.dealer_game.id;
 await q("SELECT set_config('request.jwt.claim.sub',$1,true) v",[users[1]]);await q("SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v",[game,id,players[1]]);
 await db.query('COMMIT');
 for(const c of [db,peer])await q("SELECT set_config('request.jwt.claim.role','service_role',false) v",[],c);
 let view=await megaLiveOperation(rpc(db),users[0],{op:'state',matchId:id});
 for(let turn=0;turn<6;turn++){
  const actor=users[players.indexOf(view.actor)];
  for(const intent of [{type:'open',indices:[0]},{type:'open',indices:[1]},...(turn===5?[]:[{type:'stand-pat'}])])view=await megaLiveOperation(rpc(db),actor,{op:'action',matchId:id,requestId:randomUUID(),revision:view.revision,scope:view.scope,intent});
  if(turn<5){await db.query("UPDATE private.mega_live_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1)) WHERE dealer_game_id=$1",[id]);view=await megaLiveOperation(rpc(db),users[0],{op:'state',matchId:id});}
 }
 const actor=users[players.indexOf(view.actor)],command={op:'action',matchId:id,requestId:randomUUID(),revision:view.revision,scope:view.scope,intent:{type:'stand-pat'}};
 const replies=await Promise.all([megaLiveOperation(rpc(db),actor,command),megaLiveOperation(rpc(peer),actor,command)]);
 assert(replies.every(v=>v.settled));assert.deepEqual(replies[0].settlement,replies[1].settlement);
 assert.equal(await q('SELECT count(*)::int v FROM public.game_results WHERE dealer_game_id=$1',[id]),1);
 assert.equal(await q('SELECT count(*)::int v FROM private.mega_live_requests WHERE dealer_game_id=$1 AND request_id=$2',[id,command.requestId]),1);
 assert.equal(await q('SELECT sum(chips)::int v FROM public.players WHERE game_id=$1',[game]),200);
 assert.equal(await q('SELECT count(*)::int v FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[id]),Object.values(replies[0].settlement).some(n=>n!==0)?1:0);
 checks.push('two independent database connections race the same earned final-hole request: one receipt, result and balanced settlement');
 write('qualification.local/mega-competition/concurrency-proof.json',JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await db.end();await peer.end();await root.query('DROP DATABASE '+database);await root.end();}
