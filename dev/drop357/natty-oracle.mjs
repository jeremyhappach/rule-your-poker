// Independent exhaustive rank assignments; no production scoring implementation is imported.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {connect} from '../quintzee/database.mjs';
const db=process.argv[2];if(!/^drop357_v2_\d+$/.test(db??''))throw Error('Disposable database required');
const ranks=[2,3,4,5,6,7,8,9,10,11,12,13,15],rank=c=>c%13===12?15:c%13+2;
const compare=(a,b)=>{for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]??0)-(b[i]??0);if(d)return d;}return 0;};
function ordinary(rs,flush){
 const groups=[...new Set(rs)].map(r=>[rs.filter(x=>x===r).length,r]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]);
 const ordered=[...rs].sort((a,b)=>b-a),shape=groups.map(x=>x[0]).join(''),g=groups.map(x=>x[1]);
 if(rs.length===3)return shape==='3'?[3,g[0]]:shape==='21'?[1,...g]:[0];
 const sorted=[...new Set(rs.map(r=>r===15?14:r))].sort((a,b)=>a-b);
 const high=sorted.length===5?(sorted.join(',')==='2,3,4,5,14'?5:sorted[4]-sorted[0]===4?(sorted[4]===14?15:sorted[4]):0):0;
 if(shape==='5')return [10,g[0]];
 if(flush&&high)return high===15?[9]:[8,high];
 if(shape==='41')return [7,...g];
 if(shape==='32')return [6,...g];
 if(flush&&new Set(rs).size===5)return [5,...ordered];
 if(high)return [4,high];
 if(shape==='311')return [3,...g];
 if(shape==='221')return [2,...g];
 if(shape==='2111')return [1,...g];
 return [0,...ordered];
}

const pair={2:80,4:100,5:120,6:145,7:175,8:210,9:250,10:300,11:360,12:430,13:510,15:620};
const trips={2:800,4:880,5:970,6:1070,7:1170,8:1290,9:1420,10:1560,11:1720,12:1880,13:2050,15:2240};
function points(v,lane){
 const [cat,r,b]=v;
 if(lane===3)return cat===3?(trips[r]??0):cat===1?(pair[r]===undefined?0:pair[r]+2*b):0;
 return ({2:200+16*r+b,3:550+10*r,4:850+10*r,5:1200+10*r,6:1600+16*r+b,7:2250+10*r,8:2900+10*r,9:3700,10:4500+10*r})[cat]??0;
}
function candidate(v,lane,natural){const base=points(v,lane),bonus=natural?Math.round(base*.2):0;return {vector:v,points:base,bonus,score:base+bonus,natural:natural&&base>0};}
const better=(a,b)=>!b||a.score>b.score||a.score===b.score&&(compare(a.vector,b.vector)>0||compare(a.vector,b.vector)===0&&a.natural&&!b.natural);
function five(cards,lane){
 const fixed=cards.filter(c=>rank(c)!==lane),wild=cards.length-fixed.length;
 const flush=new Set(fixed.map(c=>Math.floor(c/13))).size<=1;
 let best=candidate(ordinary(cards.map(rank),new Set(cards.map(c=>Math.floor(c/13))).size===1),lane,true);
 function walk(rs,left){if(!left){const next=candidate(ordinary(rs,flush),lane,false);if(better(next,best))best=next;return;}for(const r of ranks)walk([...rs,r],left-1);}
 walk(fixed.map(rank),wild);return best;
}
function oracle(cards,lane){let best;
 for(let mask=1;mask<(1<<cards.length);mask++){
  const selected=cards.flatMap((c,i)=>mask&(1<<i)?[i]:[]);if(selected.length!==Math.min(5,lane))continue;
  const next={...five(selected.map(i=>cards[i]),lane),selected};if(better(next,best))best=next;
 }return best;
}
let seed=357;const next=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const c=await connect(db);let count=0;
function check(cards,lane,actual,old){
 const expected=oracle(cards,lane);
 for(const key of ['vector','selected','points','bonus','score','natural'])assert.deepEqual(actual[key],expected[key],JSON.stringify({cards,lane,key,actual,expected}));
 assert.ok(actual.score>=old.score,'new selector cannot pay less than the retained old interpretation');
 count++;
}
try{
 const threes=(await c.query('SELECT ARRAY[a,b,c] cards,private.drop357_lane(ARRAY[a,b,c],3,private.drop357_v7_rules()) r,private.drop357_lane(ARRAY[a,b,c],3,private.drop357_v6_rules()) old FROM generate_series(0,51)a,generate_series(0,51)b,generate_series(0,51)c WHERE a<b AND b<c')).rows;
 for(const x of threes)check(x.cards,3,x.r,x.old);
 for(const lane of [5,7])for(let i=0;i<150;i++){
  const cards=[];while(cards.length<lane){const card=Math.floor(next()*52);if(!cards.includes(card))cards.push(card);}
  if(i%3===0){const wild=lane-2+13*(i%4);if(!cards.includes(wild))cards[0]=wild;}
  if(cards.filter(x=>rank(x)===lane).length>2){i--;continue;}
  const {r,old}=(await c.query('SELECT private.drop357_lane($1,$2,private.drop357_v7_rules()) r,private.drop357_lane($1,$2,private.drop357_v6_rules()) old',[cards,lane])).rows[0];
  check(cards,lane,r,old);
 }
 const cases=JSON.parse(readFileSync('dev/drop357/natty-cases.json'));
 for(const f of cases){const r=(await c.query('SELECT private.drop357_lane($1,$2,private.drop357_v7_rules()) r',[f.cards,f.lane])).rows[0].r;check(f.cards,f.lane,r,{score:0});for(const k of ['category','points','bonus','natural'])assert.equal(r[k],f[k],f.name);if(f.selected)assert.deepEqual(r.selected,f.selected,f.name);}
 writeFileSync('qualification.local/drop357-natty/oracle.json',JSON.stringify({passed:true,comparisons:count,exhaustiveThrees:threes.length,randomFiveSeven:300,fixtures:cases.length}));
 console.log('PASS:',count,'independent exhaustive scoring comparisons, selected cards, rounding and non-regression');
}finally{await c.end();}
