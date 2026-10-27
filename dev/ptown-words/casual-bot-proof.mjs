import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {connect} from './database.mjs';
const database=JSON.parse(read('qualification.local/ptown-words/release/route-context.json','utf8')).database;
if(!/^ptown_words_route_\d+$/.test(database))throw Error('Local route database required');
const c=await connect(database),candidate=read('supabase/ptown-words/bot-vocabulary.sql','utf8')+'\n'+read('supabase/ptown-words/bots.sql','utf8');
const prior=execFileSync('git',['show','cc2939634:supabase/ptown-words/bots.sql'],{encoding:'utf8'}).replaceAll('private.ptown_words_bot_choice','pg_temp.words_previous_choice');
const scalar=async(sql,args=[])=>(await c.query(sql,args)).rows[0].v;
const comparisons=[];
try{
 await c.query('BEGIN');await c.query(candidate);await c.query(prior);await c.query(read('supabase/ptown-words/core-proof.sql','utf8'));
 const table=await scalar("SELECT jsonb_build_object('rls',relrowsecurity,'primaryKey',(SELECT count(*) FROM pg_index WHERE indrelid='private.ptown_words_bot_vocabulary'::regclass AND indisprimary),'clientSelect',has_table_privilege('authenticated','private.ptown_words_bot_vocabulary','SELECT')) v FROM pg_class WHERE oid='private.ptown_words_bot_vocabulary'::regclass");assert.equal(table.rls,true);assert.equal(table.primaryKey,1);assert.equal(table.clientSelect,false);
 for(const letters of ['QUIZERT','RETAINS','CATSER?','XYLYLAA','HELLOST','AEIOUNR','BREADST','JUMPSAE'])for(const midgame of [false,true]){
  const rack=await scalar("SELECT jsonb_agg(pg_temp.words_tile(i,substr($1,i+1,1))) v FROM generate_series(0,6)i",[letters]);
  let s=await scalar('SELECT pg_temp.words_state($1) v',[JSON.stringify(rack)]);
  if(midgame){s.board[112]={id:90,face:'C',letter:'C',value:3};s.board[113]={id:91,face:'A',letter:'A',value:1};s.board[114]={id:92,face:'T',letter:'T',value:1};}
  const visible=await scalar("SELECT private.ptown_words_visible($1,'p1') v",[s]);
  const old=await scalar('SELECT pg_temp.words_previous_choice($1,2000) v',[visible]),start=performance.now(),choice=await scalar('SELECT private.ptown_words_bot_choice($1,2000) v',[visible]),elapsed=performance.now()-start;
  assert.ok(elapsed<2000);assert.deepEqual(choice,await scalar('SELECT private.ptown_words_bot_choice($1,2000) v',[visible]));
  const detail=async move=>{if(move.action!=='place')return {action:move.action};const after=await scalar('SELECT private.ptown_words_reduce($1,$2,$3,2000) v',[s,move.action,JSON.stringify(move.items)]);return {action:move.action,words:after.moves.at(-1).words.map(w=>w.word),score:after.event.points};};
  const previous=await detail(old),casual=await detail(choice);if(casual.words)for(const word of casual.words)assert.equal(await scalar('SELECT EXISTS(SELECT 1 FROM private.ptown_words_bot_vocabulary WHERE word=$1) v',[word]),true);
  const hidden={...s,bag:[...s.bag].reverse(),racks:{...s.racks,p2:[]}};assert.deepEqual(choice,await scalar("SELECT private.ptown_words_bot_choice(private.ptown_words_visible($1,'p1'),2000) v",[hidden]));
  comparisons.push({letters,midgame,previous,casual,elapsedMs:Math.round(elapsed)});
 }
 await assert.rejects(c.query("SELECT private.ptown_words_bot_choice('{\"bag\":[],\"rack\":[]}',2000)"),/bot_private_input/);
 // The expected exception aborts this transaction; no sample state is retained.
 await c.query('ROLLBACK');
 await c.query('BEGIN');await c.query(candidate);await c.query(read('supabase/ptown-words/core-proof.sql','utf8'));await c.query(read('supabase/ptown-words/proof.sql','utf8').replaceAll('PERFORM private.ptown_words_recover()','PERFORM private.ptown_words_recover(dealer)'));await c.query('ROLLBACK');
 // Only after the complete rollback-contained human gate passes, install local policy.
 await c.query('BEGIN');await c.query(candidate);await c.query('COMMIT');
 write('dev/ptown-words/evidence/casual-bot.json',JSON.stringify({passed:true,localOnly:true,coreAnd12FinancialCases:true,privateVocabulary:table,comparisons},null,2));console.log(JSON.stringify({passed:true,comparisons},null,2));
}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
