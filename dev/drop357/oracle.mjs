// Independent exhaustive wild-rank oracle; production uses constructive SQL patterns.
import assert from 'node:assert/strict';
import {connect} from '../quintzee/database.mjs';
const db=process.argv[2];if(!/^drop357_v1_\d+$/.test(db??''))throw Error('Disposable database required');
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
function five(cards,lane){const fixed=cards.filter(c=>rank(c)!==lane),w=cards.length-fixed.length,flush=new Set(fixed.map(c=>Math.floor(c/13))).size<=1;let best=null;
 function walk(rs,left){if(!left){const v=ordinary(rs,flush);if(!best||compare(v,best)>0)best=v;return;}for(const r of ranks)walk([...rs,r],left-1);}
 walk(fixed.map(rank),w);return {vector:best,natural:w===0};
}
function oracle(cards,lane){let best=null;
 for(let mask=1;mask<(1<<cards.length);mask++){
  const selected=cards.filter((_,i)=>mask&(1<<i));if(selected.length!==Math.min(5,lane))continue;
  const x=five(selected,lane);if(!best||compare(x.vector,best.vector)>0||compare(x.vector,best.vector)===0&&x.natural&&!best.natural)best=x;
 }return best;
}
let seed=357;const next=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const c=await connect(db);let count=0;
try{for(const lane of [3,5,7])for(let n=0;n<80;n++){
 const cards=[];while(cards.length<lane){const card=Math.floor(next()*52);if(!cards.includes(card))cards.push(card);}
 // Add targeted wild densities without repeating physical cards.
 if(n%3===0){const wild=(lane-2)+13*(n%4);if(!cards.includes(wild))cards[0]=wild;}
 if(cards.filter(x=>rank(x)===lane).length>2){n--;continue;}
 const expected=oracle(cards,lane),actual=(await c.query('select private.drop357_lane($1,$2) r',[cards,lane])).rows[0].r;
 assert.deepEqual(actual.vector,expected.vector,JSON.stringify({cards,lane,actual,expected}));
 assert.equal(actual.natural,expected.natural&&actual.points>0);count++;
}console.log('PASS:',count,'independent exhaustive wild assignment / best-five comparisons');}finally{await c.end();}
