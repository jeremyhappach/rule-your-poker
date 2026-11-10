// Exact finite-horizon five-dice audit. No product authority or random sampling.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const factorial=[1,1,2,6,24,120],D=6**5;
export const v4={matrix:[[25,25,25,25,25],[35,43,52,63,76],[135,165,200,245,300],[380,460,560,680,820],[1000,1210,1460,1760,2120]],early:[130,110,100],natural:120,ones:2600,time:50};
export const proposed={matrix:[[25,25,25,25,25],[35,43,52,63,76],[330,390,460,530,600],[400,470,550,635,720],[540,635,745,860,975]],early:[125,110,100],natural:120,ones:1600,time:15};
function combinations(n,prefix=[],face=0){if(face===5)return [[...prefix,n]];return Array.from({length:n+1},(_,i)=>combinations(n-i,[...prefix,i],face+1)).flat();}
const outcomes=Array.from({length:6},(_,n)=>combinations(n).map(c=>({c,w:factorial[n]/c.reduce((x,k)=>x*factorial[k],1)})));
export const states=outcomes[5].map(o=>o.c),index=new Map(states.map((s,i)=>[s.join(','),i]));
const holds=Array.from({length:6},(_,n)=>outcomes[n].map(o=>({c:o.c,n}))).flat();
for(const h of holds){h.transitions=outcomes[5-h.n].map(o=>[index.get(h.c.map((n,i)=>n+o.c[i]).join(',')),o.w*6**h.n]);assert.equal(h.transitions.reduce((a,t)=>a+t[1],0),D);}
const allowed=states.map(s=>holds.filter(h=>h.c.every((n,i)=>n<=s[i])));
export function classify(c){if(c[0]===5)return {size:5,rank:1,natural:true};let size=0,rank=0;for(let i=1;i<6;i++){const n=c[0]+c[i];if(n>=size){size=n;rank=i+1;}}return {size,rank,natural:size>=2&&c[0]===0};}
export function score(c,roll,cfg){const k=classify(c),base=k.rank===1?cfg.ones:cfg.matrix[k.size-1][k.rank-2];return Math.floor((base*cfg.early[roll-1]*(k.natural?cfg.natural:100)+5000)/10000);}
function bestRoll(values,available){let maximum=-Infinity,best;for(const h of available){let numerator=0;for(const [i,w] of h.transitions)numerator+=values[i]*w;if(numerator>maximum){maximum=numerator;best=h.c;}}return {numerator:maximum,held:best};}
// Exact reward on the final hand, conditional shadow value earlier in a completed round.
// Bank timing is common to both choices; each extra roll consumes explicit wall time.
// Whole-second floor is retained, including all distinct phases for a 1500ms roll.
export function audit(cfg,{rollMs=0,remainingMs=30000}={}){
 const bonus=t=>t<=0?0:Math.floor(t/1000)*cfg.time;
 const at=roll=>remainingMs-(roll-1)*rollMs,den=[0,D*D,D,1];
 const values=Array.from({length:4},()=>[]);
 const details=Array.from({length:4},()=>[]);
 for(let roll=3;roll>=1;roll--)for(let i=0;i<states.length;i++){
  const bank=at(roll)<=0?0:score(states[i],roll,cfg)+bonus(at(roll));
  if(roll===3){values[roll][i]=bank;continue;}
  const chase=at(roll+1)<=0?{numerator:0,held:[]}:bestRoll(values[roll+1],allowed[i]);
  const b=bank*den[roll],decision=chase.numerator>b?'roll':'bank';
  values[roll][i]=Math.max(b,chase.numerator);
  details[roll][i]={dice:states[i].flatMap((n,f)=>Array(n).fill(f+1)),...classify(states[i]),bank:score(states[i],roll,cfg),chase:chase.numerator/den[roll]-bonus(at(roll)),held:chase.held.flatMap((n,f)=>Array(n).fill(f+1)),decision};
 }
 return {details,rollMs,remainingMs};
}
if(process.argv[1]?.endsWith('horses-ev.mjs')){
const summaries=[];
for(const [name,cfg] of Object.entries({v4,proposed})){
 const audits=[{rollMs:0,remainingMs:30000},{rollMs:1500,remainingMs:30000},{rollMs:1500,remainingMs:30500},{rollMs:3000,remainingMs:30000},{rollMs:1500,remainingMs:1000}].map(p=>audit(cfg,p));
 const rows=[];
 for(const a of audits)for(const roll of [1,2])for(const size of [3,4])for(const natural of [false,true])for(let rank=2;rank<=6;rank++){
  const selected=a.details[roll].filter(x=>x.size===size&&x.rank===rank&&x.natural===natural);
  if(!selected.length)continue;const deviations=selected.map(x=>100*(x.chase/x.bank-1));
  rows.push({roll,rollMs:a.rollMs,remainingMs:a.remainingMs,size,rank,natural,states:selected.length,minPct:Math.min(...deviations),maxPct:Math.max(...deviations),meanPct:deviations.reduce((x,y)=>x+y,0)/deviations.length,outside10:selected.filter((x,i)=>Math.abs(deviations[i])>10).length,worst:selected[deviations.indexOf(Math.max(...deviations))]});
 }
 summaries.push({name,config:cfg,rows,audits});
}
const six=[0,1,0,0,0,4],critical=audit(proposed).details[2][index.get(six.join(','))];
assert.equal(critical.bank,950);assert.equal(critical.chase,933.5);
mkdirSync('qualification.local/coordinated',{recursive:true});
writeFileSync('qualification.local/coordinated/horses-ev.json',JSON.stringify({orderedStates:6**5,unorderedStates:states.length,holdMultisets:holds.length,critical,summaries},null,2));
console.log(JSON.stringify({states:states.length,ordered:6**5,holds:holds.length,critical,summary:summaries.map(s=>({name:s.name,zeroTime:s.rows.filter(r=>r.rollMs===0).map(r=>({roll:r.roll,size:r.size,rank:r.rank,natural:r.natural,min:+r.minPct.toFixed(2),max:+r.maxPct.toFixed(2),outside10:r.outside10}))}))},null,2));
}
