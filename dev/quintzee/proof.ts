import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {context,connect} from './database.mjs';
import {QUINTZEE_CATEGORIES,quintzeeBasePreview} from '../../src/lib/quintzee/model';
const c=await connect((await context()).database),cases:string[]=[];
const q=async(sql:string,args:unknown[]=[]) => (await c.query(sql,args)).rows[0]?.v;
const record=(name:string)=>{cases.push(name);console.log('PASS',name);};
try{
 await c.query('BEGIN');
 const rules=await q('SELECT private.quintzee_rules() v');
 const start=async()=>q('SELECT private.quintzee_board_start($1,0) v',[rules]);
 const reduce=async(b:unknown,a:string,items:number[]|null,t:number)=>q('SELECT private.quintzee_board_reduce($1,$2,$3,$4) v',[b,a,items,t]);
 const vectors=[];
 for(let n=0;n<7776;n++){let x=n;const dice=[];for(let i=0;i<5;i++){dice.push(1+x%6);x=Math.floor(x/6);}for(const category of QUINTZEE_CATEGORIES)vectors.push({dice,category,expected:quintzeeBasePreview(category,dice)});}
 const mismatches=await q(`SELECT count(*)::int v FROM jsonb_array_elements($1::jsonb) x WHERE private.quintzee_category_score(x->>'category',x->'dice')<>(x->>'expected')::int`,[JSON.stringify(vectors)]);
 assert.equal(mismatches,0);record('93,312 category cases: SQL equals reused Yahtzee base scorer; no jokers');
 let b=await reduce(await start(),'tick',null,2500);
 assert.equal(b.rollsRemaining,2);assert.equal(b.deadline,182500);assert.equal(b.dice.length,5);
 const before=[...b.dice];b=await reduce(b,'roll',[0,2,4],3000);assert.deepEqual([b.dice[0],b.dice[2],b.dice[4]],[before[0],before[2],before[4]]);assert.equal(b.rollsRemaining,1);
 const heldAll=[...b.dice];b=await reduce(b,'roll',[0,1,2,3,4],3500);assert.deepEqual(b.dice,heldAll);assert.equal(b.rollsRemaining,0);
 await c.query('SAVEPOINT extra_roll');await assert.rejects(reduce(b,'roll',[],3600),/quintzee:roll/);await c.query('ROLLBACK TO extra_roll');
 record('server CSPRNG roll, two rerolls, held dice preserved; third reroll rejected');
 b={...b,dice:[4,4,4,3,5]};b=await reduce(b,'score',[6],4000);assert.equal(b.scores.three_of_a_kind,20);assert.equal(b.deadline,182500);assert.equal(b.rollsRemaining,2);record('category banks once, automatic next hand, clock unchanged');
 const sample={ones:3,twos:6,threes:9,fours:12,fives:15,sixes:18,three_of_a_kind:20,four_of_a_kind:21,full_house:25,large_straight:40,chance:20};
 b={...b,scores:sample,dice:[1,2,3,4,5],rollsRemaining:1};
 const finished=await q("SELECT private.quintzee_finish($1,'no_matches',92500) v",[b]);
 assert.equal(finished.result.upperBonus,35);assert.equal(finished.result.clearBonus,0);assert.equal(finished.result.rawSubtotal,224);assert.equal(finished.result.multiplier,200);assert.equal(finished.result.stageScore,44800);record('owner example exactly 63, +35 upper, no completion bonus, 44,800 halfway');
 const all={...b,scores:{...sample,yahtzee:50}};const cleared=await q("SELECT private.quintzee_finish($1,'all_categories',92500) v",[all]);
 assert.equal(cleared.result.clearBonus,35);assert.equal(cleared.result.rawSubtotal,309);assert.equal(cleared.result.stageScore,61800);record('separate +35 all-twelve award enters raw subtotal');
 const timeout=await reduce(b,'score',[8],182500);assert.equal(timeout.result.reason,'timeout');assert.equal(timeout.result.multiplier,100);assert.equal(timeout.result.stageScore,22400);assert.equal(timeout.scores.yahtzee,undefined);record('deadline beats crossing action, banked points survive, no late scoring');
 const noMatch=await reduce({...b,rollsRemaining:1},'roll',[0,1,2,3,4],92500);assert.equal(noMatch.result.reason,'no_matches');record('exhausted rerolls with no available match ends round without scratch');
 for(const duration of [90000,180000,240000]){assert.equal(await q('SELECT private.quintzee_speed($1,$2) v',[duration/2,duration]),200);}
 record('speed scales to configured duration');
 const players=Array.from({length:4},()=>randomUUID());let s=await q('SELECT private.quintzee_start($1,$2,0) v',[players,rules]);
 const order=[];
 for(let i=0;i<8;i++){
  order.push([s.round,s.players[s.turnIndex]]);
  const points=i===0||i===4?40000:i===1||i===5?39999:0;
  const who=s.players[s.turnIndex];s.scores[who]+=points;
  s.board={...s.board,phase:'stage_complete',deadline:i+1,score:s.scores[who]};
  s=await q("SELECT private.quintzee_reduce($1,'tick',NULL,$2) v",[s,i+1]);
 }
 assert.deepEqual(order,players.map(p=>[1,p]).concat(players.map(p=>[2,p])));assert.deepEqual(s.qualified,[players[0]]);assert.equal(s.round,3);assert.equal(s.turnIndex,0);
 s.board={...s.board,phase:'stage_complete',deadline:9};s.scores[players[0]]=200000;
 s=await q("SELECT private.quintzee_reduce($1,'tick',NULL,9) v",[s]);assert.equal(s.finished,true);record('four-player whole-round rotation, 80,000 inclusive / 79,998 excluded, one bonus only');
 const solo=await q('SELECT private.quintzee_start($1,$2,0) v',[[players[0]],rules]);
 const recovered=await q('SELECT private.quintzee_advance($1,9999999) v',[solo]);assert.equal(recovered.finished,true);assert.equal(recovered.results.length,2);assert.equal(recovered.scores[players[0]],0);record('zero-client catch-up completes two expired rounds without invented points');
 // Protocol proof uses the local adapter, not a claim about production settlement.
 const id=randomUUID();await c.query('INSERT INTO quintzee_qualification.runs(id,state,theme,config,dependency_hash) VALUES($1,$2,\'classic\',$3,md5(pg_get_functiondef(\'private.yahtzee_category_score(jsonb,jsonb,text)\'::regprocedure)))',[id,solo,rules]);
 const now=Date.now();const active=await q('SELECT private.quintzee_start($1,$2,$3) v',[[players[0]],rules,now-2600]);
 await c.query('UPDATE quintzee_qualification.runs SET state=$2 WHERE id=$1',[id,active]);
 let v=await q('SELECT quintzee_qualification.command($1,$2) v',[id,players[0]]);
 const request=randomUUID(),args=[id,players[0],request,v.revision,v.scope,'score',[11]];
 v=await q('SELECT quintzee_qualification.command($1,$2,$3,$4,$5,$6,$7) v',args);assert.equal(v.outcome,'committed');
 const replay=await q('SELECT quintzee_qualification.command($1,$2,$3,$4,$5,$6,$7) v',args);assert.equal(replay.outcome,'duplicate');assert.equal(replay.revision,v.revision);assert.deepEqual(replay.state,v.state);record('atomic local command receipt prevents duplicate scoring and dice draws');
 await c.query('SAVEPOINT forbidden');let denied=false;try{await q('SELECT quintzee_qualification.command($1,$2) v',[id,randomUUID()]);}catch{denied=true;await c.query('ROLLBACK TO forbidden');}assert.equal(denied,true);record('unrelated actor rejected by local authority');
 await c.query('ROLLBACK');record('all synthetic state rolled back');
 mkdirSync('dev/quintzee/evidence',{recursive:true});writeFileSync('dev/quintzee/evidence/rules.json',JSON.stringify({passed:true,cases,canonicalFinancialProof:'MISSING',productionAdmission:false},null,2));
}catch(e){await c.query('ROLLBACK');console.error(e);process.exitCode=1;}finally{await c.end();}
