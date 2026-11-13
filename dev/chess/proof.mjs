import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {openWordsDatabase} from '../words-gameplay/database.mjs';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
mkdirSync('qualification.local/chess',{recursive:true});
await build({entryPoints:['server/chess/operation.ts'],outfile:'qualification.local/chess/authority.mjs',bundle:true,platform:'node',format:'esm'});
const {chessOperation}=await import(pathToFileURL(resolve('qualification.local/chess/authority.mjs')).href);
process.env.PTOWN_WORDS_PG_MODULE??='C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
const db=await openWordsDatabase(process.argv[2]);
const real=process.argv.includes('--real');
try{
 const originals=readFileSync('supabase/migrations/20261107184515_originals_competitive_release.sql','utf8');
 await db.execute('SET check_function_bodies=off;'+originals.slice(originals.indexOf('CREATE TABLE private.originals_release'),originals.indexOf('CREATE FUNCTION private.originals_config')));
 // Bring only the inspected ownership functions into the disposable schema fixture.
 for(const d of [...JSON.parse(readFileSync('dev/chess/installed.json','utf8')),...JSON.parse(readFileSync('dev/chess/installed-views.json','utf8'))])await db.execute(d.definition);
 await db.execute(readFileSync('supabase/game-backgrounds/candidate.sql','utf8'));
 await db.execute(readFileSync('supabase/chess/candidate.sql','utf8'));
 await db.execute('UPDATE private.chess_release SET enabled=true,admission_enabled=true,async_enabled=true,preview_only=false');
 if(real)await db.execute('UPDATE private.chess_release SET real_qualified=true');
 const client=await db.connect();
 try{
 await client.query('BEGIN');
 const rpc=async(actor,name,args,role='authenticated')=>{await client.query('RESET ROLE');await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[actor,JSON.stringify({sub:actor,role})]);await client.query('SET LOCAL ROLE '+role);const entries=Object.entries(args);const result=await client.query('SELECT public.'+name+'('+entries.map(([k],i)=>k+'=>$'+(i+1)).join(',')+') value',entries.map(([,v])=>v&&typeof v==='object'?JSON.stringify(v):v));await client.query('RESET ROLE');await client.query('SET CONSTRAINTS ALL IMMEDIATE');await client.query('SET CONSTRAINTS ALL DEFERRED');return result.rows[0].value;};
 const users=[randomUUID(),randomUUID()],players=[randomUUID(),randomUUID()],session=randomUUID(),deadline=new Date(Date.now()+600000).toISOString();
 for(const [i,user] of users.entries()){await client.query('INSERT INTO auth.users(id) VALUES($1)',[user]);await client.query('UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=$1',[user]);await client.query('UPDATE public.profiles SET is_active=true,username=$2 WHERE id=$1',[user,'Chess '+i]);}
 await client.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host) VALUES($1,'game_selection',$4,2,$2,0,false,false,$3)",[session,deadline,users[0],real]);
 for(const [i,p]of players.entries())await client.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[p,session,users[i],2-i]);
 const configured=await rpc(users[0],'chess_configure',{p_game_id:session,p_dealer_player_id:players[0],p_expected_dealer_position:2,p_game_type:'chess',p_config:{ante_amount:5},p_expected_config_deadline:deadline});
 const id=configured.dealer_game.id;const capability=await rpc(users[0],'chess_capabilities',{p_session_id:session});assert.equal(capability.enabled,true);assert.equal(capability.user_id,users[0]);assert.equal(capability.session_id,session);
 await rpc(users[1],'submit_ante_decision',{p_game_id:session,p_expected_dealer_game_id:id,p_player_id:players[1],p_decision:'ante_up'});
 const row=await rpc(users[0],'chess_load',{p_mode:'live',p_id:id,p_actor:users[0]},'service_role');assert.equal(row.state.rules.turnMs,300000);assert(row.state.backgroundId);assert.equal(row.state.players.length,2);
 const parent=await rpc(users[0],'delayed_create',{p_request:randomUUID(),p_opponent:users[1],p_real_money:real,p_lineup:[{game:'chess',stake:7}]});
 const offer=(await client.query('SELECT offer_hash FROM private.delayed_matches WHERE id=$1',[parent])).rows[0].offer_hash;
 await rpc(users[1],'delayed_respond',{p_match:parent,p_request:randomUUID(),p_offer_hash:offer,p_action:'accept'});
 const asyncRow=(await client.query('SELECT * FROM private.delayed_children WHERE match_id=$1',[parent])).rows[0];assert.equal(asyncRow.state.mode,'async');assert.equal(asyncRow.state.opened,false);assert(asyncRow.state.backgroundId);
 mkdirSync('qualification.local/chess',{recursive:true});writeFileSync('qualification.local/chess/live.json',JSON.stringify({...row,...row.state,id,canAct:row.viewerId===row.state.players[0].id}));
 await client.query('SAVEPOINT initial_games');
 const operate=(actor,body)=>chessOperation((name,args)=>rpc(actor,name,args,'service_role'),actor,body);
 const state=(mode,matchId,actor)=>operate(actor,{op:'state',mode,matchId});
 const action=async(mode,matchId,intent)=>{const current=await state(mode,matchId,users[0]);const actor=current.players[current.turnIndex].userId;const body={op:'action',mode,matchId,requestId:randomUUID(),revision:current.revision,intent};const next=await operate(actor,body);const replayed=await operate(actor,body);assert.equal(replayed.revision,next.revision,'Identical request replays current state');return {next:replayed,body,actor};};
 const failed=async(work,pattern)=>{await client.query('SAVEPOINT rejection');try{await assert.rejects(work,pattern);}finally{await client.query('ROLLBACK TO rejection');}};
 await failed(()=>state('live',id,randomUUID()),/authentication_required|participant_required/);
 await failed(()=>rpc(users[0],'chess_load',{p_mode:'live',p_id:id,p_actor:users[0]}),/permission denied/);
 await failed(()=>rpc(users[0],'settle_gameplay_chip_transfers',{p_game_id:session,p_transfers:[{from:{kind:'player',playerId:players[0]},to:{kind:'player',playerId:players[1]},amount:5}],p_reason:'win'}),/permission denied|server|authority|denied/);
 const first=await action('live',id,{type:'move',from:'f2',to:'f3'});
 await action('live',id,{type:'move',from:'e7',to:'e5'});
 assert.equal((await operate(first.actor,first.body)).moves.length,2,'Late replay never rewinds');
 await failed(()=>operate(first.actor,{...first.body,intent:{type:'move',from:'e2',to:'e4'}}),/request_conflict/);
 await action('live',id,{type:'move',from:'g2',to:'g4'});
 const won=(await action('live',id,{type:'move',from:'d8',to:'h4'})).next;
 assert.equal(won.reason,'checkmate');assert(won.settled);assert.equal(won.winnerIds.length,1);
 for(const p of won.players)assert.equal(won.financial.balances[p.id],won.winnerIds.includes(p.id)?105:95,'Actual canonical chips change by one stake');
 assert.equal(Object.values(won.settlement).reduce((a,b)=>a+b,0),0);
 assert.equal((await client.query("SELECT count(*)::int n FROM public.game_results WHERE dealer_game_id=$1 AND settlement_key='chess_terminal'",[id])).rows[0].n,1);
 assert(won.financial.batch,'Canonical chip transfer receipt');assert.deepEqual(won.financial.batch.unmatched_deltas,{});assert.equal(won.financial.batch.transfers[0].amount,5);
 await client.query("UPDATE private.chess_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=$1",[id]);
 const continued=await state('live',id,users[0]);assert(continued.finished,'Canonical postgame continuation');
 assert.equal((await operate(first.actor,first.body)).finished,true,'Replay after continuation is read-only');
 await action('async',asyncRow.id,{type:'open'});
 const bank=(await action('async',asyncRow.id,{type:'bank',slot:0})).next;
 assert.equal(bank.deadline-bank.serverAt>470000,true);
 await failed(()=>action('async',asyncRow.id,{type:'bank',slot:0}),/bank_used/);
 await client.query("UPDATE private.delayed_children SET state=jsonb_set(state,'{deadline}','0'),gameplay_due_at=clock_timestamp()-interval '1 second' WHERE id=$1",[asyncRow.id]);
 const expired=await state('async',asyncRow.id,users[0]);assert(expired.finished);assert.equal(expired.reason,'timeout');if(real){const postings=(await client.query("SELECT count(*)::int n,sum(amount)::int total,sum(abs(amount))::int gross FROM public.player_transactions WHERE source_game_id=$1 AND transaction_type='SessionResult'",[parent])).rows[0];assert.deepEqual(postings,{n:2,total:0,gross:14});}
 assert.equal((await client.query('SELECT count(*)::int n FROM private.delayed_outcomes WHERE child_id=$1',[asyncRow.id])).rows[0].n,1);
 await state('async',asyncRow.id,users[1]);
 assert.equal((await client.query('SELECT count(*)::int n FROM private.delayed_outcomes WHERE child_id=$1',[asyncRow.id])).rows[0].n,1,'Opponent reconnect does not settle twice');
 await client.query('ROLLBACK TO initial_games');
 const fen='7k/5K2/8/6Q1/8/8/8/8 w - - 0 1';
 for(const mode of ['live','async']){
  const matchId=mode==='live'?id:asyncRow.id,table=mode==='live'?'chess_matches':'delayed_children',key=mode==='live'?'dealer_game_id':'id';
  const initial=mode==='live'?row.state:asyncRow.state;
  // A synthetic legal position proves the same reducer/financial boundary for stalemate.
  await client.query('UPDATE private.'+table+' SET state=$2 WHERE '+key+'=$1',[matchId,JSON.stringify({...initial,initialFen:fen,fen,positions:[],opened:true,deadline:Date.now()+300000})]);
  const drawn=(await action(mode,matchId,{type:'move',from:'g5',to:'g6'})).next;
  assert.equal(drawn.reason,'stalemate');assert.equal(drawn.winnerIds.length,2);
  if(mode==='live'){assert(Object.values(drawn.financial.balances).every(n=>n===100));assert(Object.values(drawn.settlement).every(n=>n===0));assert.equal(drawn.financial.batch,null);}
  else {const outcome=(await client.query('SELECT * FROM private.delayed_outcomes WHERE child_id=$1',[matchId])).rows[0];assert.equal(outcome.organizer_delta,0);assert.equal(outcome.opponent_delta,0);if(real){const postings=(await client.query("SELECT coalesce(sum(abs(amount)),0)::int gross FROM public.player_transactions WHERE source_game_id=$1 AND transaction_type='SessionResult'",[parent])).rows[0];assert.equal(postings.gross,0);}}
 }
 await client.query('ROLLBACK TO initial_games');
 await client.query("UPDATE private.chess_matches SET state=jsonb_set(state,'{deadline}','0') WHERE dealer_game_id=$1",[id]);
 await client.query('SELECT private.chess_recover()');
 assert.equal((await client.query('SELECT state FROM private.chess_matches WHERE dealer_game_id=$1',[id])).rows[0].state.reason,'timeout','Zero-client live expiry uses canonical settlement');
 await client.query('ROLLBACK TO initial_games');
 // Only initial synthetic fixtures are committed, inside the disposable database,
 // so independent connections can exercise actual row-lock races.
 await client.query('COMMIT');
 let loads=0,release;let barrier=new Promise(r=>release=r);
 const concurrentRpc=async(name,args)=>{const c=await db.connect();let value;try{await c.query('BEGIN');await c.query('SET LOCAL ROLE service_role');const es=Object.entries(args);value=(await c.query('SELECT public.'+name+'('+es.map(([k],i)=>k+'=>$'+(i+1)).join(',')+') value',es.map(([,v])=>v&&typeof v==='object'?JSON.stringify(v):v))).rows[0].value;await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}if(name==='chess_load'){if(++loads===2)release();await barrier;}return value;};
 const actor=row.state.players[0].userId,body={op:'action',mode:'live',matchId:id,revision:row.revision,requestId:randomUUID(),intent:{type:'move',from:'e2',to:'e4'}};
 const duplicates=await Promise.all([chessOperation(concurrentRpc,actor,body),chessOperation(concurrentRpc,actor,body)]);assert.equal(duplicates[0].moves.length,1);assert.equal(duplicates[1].moves.length,1);assert.equal(duplicates[0].revision,duplicates[1].revision);
 loads=0;barrier=new Promise(r=>release=r);
 const other=row.state.players[1].userId;
 const competing=await Promise.allSettled(['e7','d7'].map(from=>chessOperation(concurrentRpc,other,{...body,revision:duplicates[0].revision,requestId:randomUUID(),intent:{type:'move',from,to:from[0]+'5'}})));
 assert.equal(competing.filter(v=>v.status==='fulfilled').length,1);assert.equal((await db.sql('SELECT state FROM private.chess_matches WHERE dealer_game_id=$1',[id])).state.moves.length,2);
 console.log(JSON.stringify({money:real?'real':'play',rollback:['creation','checkmate','canonical 105/95 chips','balanced receipt','duplicates','late replay','authorization','continuation','live/Async stalemate zero transfer','banks','expiry','zero-client recovery'],concurrency:['same UUID exactly once','competing legal moves one winner']}));
 }finally{await client.query('ROLLBACK');client.release();}
}finally{await db.close();}
