import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {connect} from '../quintzee/database.mjs';

const database=process.argv[2];
if(!/^originals_competition_\d+$/.test(database??''))throw Error('Disposable Originals database required');
const db=await connect(database);
const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
const board=(game,operation,cfg,round,score,state,at,action=null,items=null,level=null,deck=null)=>
 one('select private.originals_board($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) value',[game,operation,cfg,round,score,state,at,action,items,level,deck===null?null:JSON.stringify(deck)]);
try{
 await db.query('begin');
 await db.query("update private.arcade_rulesets set enabled=(config->>'version'=game||'/2') where game in('crib-lab','chucky-showdown')");
 // Every generated configuration still comes from the shared frozen registry.
 const cfg=await one("select private.originals_config('crib-lab',true) value");
 const deck=await one('select private.cribbage_new_deck() value');
 let a=await board('crib-lab','deal',cfg,1,0,null,1000,null,null,null,deck);
 let b=await board('crib-lab','deal',cfg,1,0,null,5000,null,null,null,deck);
 for(const field of ['hands','stock','cut'])assert.deepEqual(a[field],b[field]);
 assert.equal(a.deadline+4000,b.deadline);
 const visible=await one("select private.originals_visible('crib-lab',$1) value",[a]);
 assert.equal(visible.offer,null);assert.equal(visible.cut,null);assert.equal(visible.stock,undefined);
 assert.equal(visible._competitiveDeck,undefined);
 a=await board('crib-lab','reduce',cfg,1,0,a,a.nextDue,'tick');
 for(let hand=0;hand<5;hand++)for(const card of [4,5])a=await board('crib-lab','reduce',cfg,1,0,a,2200,'select',[hand,card]);
 a=await board('crib-lab','reduce',cfg,1,0,a,2300,'lock',[]);
 a=await board('crib-lab','reduce',cfg,1,0,a,a.nextDue,'tick');
 for(let i=0;i<5;i++)a=await board('crib-lab','reduce',cfg,1,0,a,3500+i,'pass',[]);
 a=await board('crib-lab','reduce',cfg,1,0,a,a.nextDue,'tick');
 a=await board('crib-lab','reduce',cfg,1,0,a,a.nextDue,'tick');
 const expected=await one("select private.crib_lab_action($1,'stand','{}',$2) value",[a,6000]);
 a=await board('crib-lab','reduce',cfg,1,0,a,6000,'stand',[]);
 assert.equal(a.phase,'stage_complete');assert.deepEqual(a.results,expected.results);
 assert.equal(a.score,expected.score);
 assert.equal(b.score,0);assert.equal(b.stockIndex,0);
 const next=await board('crib-lab','deal',cfg,2,a.score,null,100000);
 assert.equal(next.round,2);assert.equal(next.score,a.score);assert.notDeepEqual(next.hands,b.hands);
 const chucky=await one("select private.originals_config('chucky-showdown') value");
 let total=0;
 for(let round=1;round<=3;round++){
  let s=await board('chucky-showdown','deal',chucky,round,total,null,round*100000);
  assert.equal(s.round,round);assert.deepEqual(s.uses,[2,2,2,2,2,2,2]);
  const v=await one("select private.originals_visible('chucky-showdown',$1) value",[s]);
  assert.equal(v.community.length,2);assert.equal(v.chucky.length,0);
  for(let fold=0;fold<3;fold++){
   s=await board('chucky-showdown','reduce',chucky,round,total,s,s.nextDue,'tick');
   assert.equal(s.phase,'fold_stay');
   const shared=await one("select private.chucky_showdown_act_v2($1,'fold',null,$2) value",[s,s.nextDue-1]);
   s=await board('chucky-showdown','reduce',chucky,round,total,s,s.nextDue-1,'fold');
   assert.equal(s.folds,shared.folds);assert.equal(s.score,shared.score);
  }
  assert.equal(s.phase,'stage_complete');assert.equal(s.gamePhase,'round_over');assert.equal(s.results.length,1);
  total=s.score;
 }
 console.log(JSON.stringify({sharedDeck:true,privateProjection:true,independentClocks:true,cribScoreParity:true,chuckyThreeRoundFoldParity:true,admission:'closed',rollback:true}));
}finally{await db.query('rollback');await db.end();}
