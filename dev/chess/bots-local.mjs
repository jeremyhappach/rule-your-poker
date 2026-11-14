import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildSync} from 'esbuild';
import {openWordsDatabase} from '../words-gameplay/database.mjs';
const out='qualification.local/chess-bots';mkdirSync(out,{recursive:true});
buildSync({entryPoints:['server/chess/recovery.ts'],outfile:out+'/recovery.mjs',bundle:true,platform:'node',format:'esm'});
buildSync({entryPoints:['server/chess/operation.ts'],outfile:out+'/operation.mjs',bundle:true,platform:'node',format:'esm'});
const {recoverChess}=await import(pathToFileURL(resolve(out+'/recovery.mjs')));
const {chessOperation}=await import(pathToFileURL(resolve(out+'/operation.mjs')));
process.env.PTOWN_WORDS_PG_MODULE??='C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
const db=await openWordsDatabase(process.argv[2]);const evidence=[];
try {
 await db.execute('SET check_function_bodies=off');
 const existing=await db.sql("SELECT to_regclass('private.originals_release') present");
 if(!existing.present){const originals=read('supabase/migrations/20261107184515_originals_competitive_release.sql','utf8');await db.execute(originals.slice(originals.indexOf('CREATE TABLE private.originals_release'),originals.indexOf('CREATE FUNCTION private.originals_config')));}
 for(const d of [...JSON.parse(read('dev/chess/installed.json','utf8')),...JSON.parse(read('dev/chess/installed-views.json','utf8'))])await db.execute(d.definition);
 await db.execute(read('supabase/game-backgrounds/candidate.sql','utf8'));
 await db.execute(read('supabase/chess/candidate.sql','utf8'));
 for(const d of JSON.parse(read('dev/chess/bots-installed.json','utf8')).definitions)await db.execute(d.definition);
 await db.execute(read('supabase/chess/bots.candidate.sql','utf8'));
 await db.execute("UPDATE private.chess_release SET enabled=true,admission_enabled=true,async_enabled=true,preview_only=false,bots_enabled=true;UPDATE private.chess_bot_recovery SET last_completed_at=clock_timestamp()");
 await db.execute('BEGIN;'+read('supabase/chess/financial-proof.sql','utf8')+read('supabase/chess/bots-proof.sql','utf8')+'ROLLBACK;');
 const rpc=async(name,args,actor=null,role='service_role')=>{
  assert.match(name,/^(chess_|submit_ante_decision)/);const c=await db.connect();
  try{await c.query('BEGIN');if(actor)await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[actor,JSON.stringify({sub:actor,role})]);await c.query('SET LOCAL ROLE '+role);const entries=Object.entries(args);const value=(await c.query('SELECT public.'+name+'('+entries.map(([key],i)=>key+'=>$'+(i+1)).join(',')+') value',entries.map(([,v])=>v&&typeof v==='object'?JSON.stringify(v):v))).rows[0].value;await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 };
 for(const difficulty of ['easy','medium','expert']){
  await db.execute('UPDATE public.game_defaults SET chess_bot_difficulty=$1 WHERE game_type=\'chess\'',[difficulty]);
  const users=[randomUUID(),randomUUID()],players=[randomUUID(),randomUUID()],session=randomUUID(),deadline=new Date(Date.now()+600000).toISOString();
  for(const [i,user] of users.entries()){await db.execute('INSERT INTO auth.users(id) VALUES($1)',[user]);await db.execute('UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=$1',[user]);await db.execute('UPDATE public.profiles SET is_active=true,username=$2 WHERE id=$1',[user,(i?'Chess Bot ':'Player ')+user.slice(0,8)]);}
  await db.execute("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host) VALUES($1,'game_selection',false,2,$2,0,false,false,$3)",[session,deadline,users[0]]);
  for(const [i,p]of players.entries())await db.execute('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,$5)',[p,session,users[i],2-i,i===1]);
  const configured=await rpc('chess_configure',{p_game_id:session,p_dealer_player_id:players[0],p_expected_dealer_position:2,p_game_type:'chess',p_config:{ante_amount:5},p_expected_config_deadline:deadline},users[0],'authenticated'),id=configured.dealer_game.id;
  await db.execute('SELECT private.advance_ante_phase_exact(id,current_game_uuid,ante_decision_deadline,clock_timestamp()) FROM public.games WHERE id=$1',[session]);
  const wake=async(race=false)=>{
   const token=randomUUID();await db.execute("UPDATE private.chess_bot_recovery SET token=$1,expires_at=clock_timestamp()+interval '25 seconds',claimed=false,matches='{}'",[token]);
   await db.execute("UPDATE private.chess_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint+290000)) WHERE dealer_game_id=$1",[id]);
   return recoverChess(async(name,args)=>{
    if(race&&name==='chess_bot_commit'){const both=await Promise.all([rpc(name,args),rpc(name,args)]);assert.deepEqual(both.map(v=>v.outcome).sort(),['committed','duplicate']);return both.find(v=>v.outcome==='committed');}
    return rpc(name,args);
   },token);
  };
  assert.deepEqual(await wake(true),{processed:1,failures:0});
  let row=await rpc('chess_load',{p_mode:'live',p_id:id,p_actor:users[0]});assert.equal(row.state.moves.length,1);assert.equal(row.state.bot.difficulty,difficulty);
  // A human action returns to the same independent worker, with no browser controller.
  const {Chess}=await import('chess.js');const move=new Chess(row.state.fen).moves({verbose:true})[0];
  await chessOperation((name,args)=>rpc(name,args),users[0],{op:'action',mode:'live',matchId:id,requestId:randomUUID(),revision:row.revision,intent:{type:'move',from:move.from,to:move.to}});
  assert.deepEqual(await wake(),{processed:1,failures:0});
  row=await rpc('chess_load',{p_mode:'live',p_id:id,p_actor:users[0]});assert.equal(row.state.moves.length,3);
  write(out+'/'+difficulty+'-view.json',JSON.stringify({...row,...row.state,id,canAct:true}));
  const mate={...row.state,initialFen:'R5bk/8/4Q1K1/8/8/8/8/8 w - - 0 1',fen:'R5bk/8/4Q1K1/8/8/8/8/8 w - - 0 1',moves:[],positions:[],captured:{w:[],b:[]},turnIndex:0,turn:1};
  await db.execute('UPDATE private.chess_matches SET state=$2 WHERE dealer_game_id=$1',[id,JSON.stringify(mate)]);
  assert.deepEqual(await wake(true),{processed:1,failures:0});
  row=await rpc('chess_load',{p_mode:'live',p_id:id,p_actor:users[0]});assert.equal(row.state.reason,'checkmate');assert.equal(row.financial.balances[players[1]],105);assert.equal(row.financial.balances[players[0]],95);assert(row.state.movePresentation.readyAt>row.state.moves[0].at);
  evidence.push({difficulty,worker:'legal opening, human handoff, autonomous reply, checkmate',concurrency:'same lease commits once',balances:[95,105]});
 }
 write(out+'/defaults.json',JSON.stringify((await db.execute("SELECT * FROM public.game_defaults WHERE game_type='chess'")).rows));
 write(out+'/local.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await db.close();}
