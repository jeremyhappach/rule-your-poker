// Independent, deterministic audit. Policies see only dealt cards and their own board.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
export const ranks=[15,13,12,11,10,9,8,7,6,5,4,3,2];
export const pair={2:80,4:100,5:120,6:145,7:175,8:210,9:250,10:300,11:360,12:430,13:510,15:620};
export const trips={2:800,4:880,5:970,6:1070,7:1170,8:1290,9:1420,10:1560,11:1720,12:1880,13:2050,15:2240};
export const rank=c=>c%13===12?15:c%13+2;
const rankOf=Array.from({length:52},(_,c)=>rank(c));
const straights=Array.from({length:10},(_,i)=>{const hi=14-i;return hi===14?[10,11,12,13,15]:hi===5?[15,2,3,4,5]:[hi-4,hi-3,hi-2,hi-1,hi];});
const encode=v=>v.reduce((k,x)=>k*16+x,0)*16**(6-v.length);
function vector(cards,lane){
 const counts=new Uint8Array(16);let w=0,flush=true,suit=-1,unique=true;
 for(const card of cards){const r=rankOf[card];if(r===lane){w++;continue;}counts[r]++;if(counts[r]>1)unique=false;const s=Math.floor(card/13);if(suit<0)suit=s;else if(suit!==s)flush=false;}
 const present=ranks.filter(r=>counts[r]);
 if(cards.length===3){for(const r of ranks)if(counts[r]+w===3)return [3,r];for(const r of ranks)if(counts[r]+w>=2)return [1,r,present.find(x=>x!==r)??(r===15?13:15)];return [0];}
 if(w===0){
  const groups=present.slice().sort((a,b)=>counts[b]-counts[a]||b-a),a=groups[0],b=groups[1];let straight=0;
  if(unique)for(let i=0;i<straights.length;i++)if(present.every(r=>straights[i].includes(r))){straight=i===0?15:14-i;break;}
  if(flush&&straight)return straight===15?[9]:[8,straight];
  if(counts[a]===4)return [7,a,b];if(counts[a]===3&&counts[b]===2)return [6,a,b];
  if(flush)return [5,...present];if(straight)return [4,straight];
  if(counts[a]===3)return [3,...groups];if(counts[a]===2&&counts[b]===2)return [2,...groups];
  if(counts[a]===2)return [1,...groups];return [0,...present];
 }
 for(const r of ranks)if(counts[r]+w===5)return [10,r];
 let straight=0;if(unique)for(let i=0;i<straights.length;i++)if(present.every(r=>straights[i].includes(r))){straight=i===0?15:14-i;break;}
 if(flush&&straight)return straight===15?[9]:[8,straight];
 for(const r of ranks)if(counts[r]+w>=4)return [7,r,present.find(x=>x!==r)??(r===15?13:15)];
 for(const a of ranks)if(counts[a]+w>=3)for(const b of ranks)if(a!==b&&counts[a]<=3&&counts[b]<=2&&counts[a]+counts[b]+w===5)return [6,a,b];
 if(flush){const rs=[...present];for(const r of ranks)if(rs.length<5&&!rs.includes(r))rs.push(r);return [5,...rs.sort((a,b)=>b-a)];}
 if(straight)return [4,straight];
 for(const a of ranks)if(counts[a]+w>=3&&present.every(r=>r===a||counts[r]===1)){const rs=present.filter(r=>r!==a);for(const r of ranks)if(rs.length<2&&r!==a&&!rs.includes(r))rs.push(r);return [3,a,...rs.sort((a,b)=>b-a)];}
 for(const a of ranks)for(const b of ranks)if(a>b&&counts[a]<=2&&counts[b]<=2&&4-counts[a]-counts[b]<=w)return [2,a,b,present.find(r=>r!==a&&r!==b)??ranks.find(r=>r!==a&&r!==b)];
 for(const a of ranks)if(counts[a]+w>=2){const rs=present.filter(r=>r!==a);for(const r of ranks)if(rs.length<3&&r!==a&&!rs.includes(r))rs.push(r);return [1,a,...rs.sort((a,b)=>b-a)];}
 return [0,...present];
}
function selected(cards,lane,version){const v=vector(cards,lane),cat=v[0],r=v[1],nat=cards.every(c=>rankOf[c]!==lane);let base=0;
 if(lane===3)base=cat===3?(version===6?trips[r]:150+30*r):cat===1?(version===6?pair[r]+2*v[2]:10*r+v[2]):0;
 else base=cat===2?200+16*r+v[2]:cat===3?550+10*r:cat===4?850+10*r:cat===5?1200+10*r:cat===6?1600+16*r+v[2]:cat===7?2250+10*r:cat===8?2900+10*r:cat===9?3700:cat===10?4500+10*r:0;
 return {vector:v,key:encode(v),natural:nat&&base>0,score:base+(nat?Math.round(base*.2):0),category:cat,base};
}
const subsets7=[];for(let a=0;a<7;a++)for(let b=a+1;b<7;b++)subsets7.push(Array.from({length:7},(_,i)=>i).filter(i=>i!==a&&i!==b));
export function evaluate(cards,lane,version=6){if(lane!==7)return selected(cards,lane,version);let best;
 for(const ids of subsets7){const r=selected(ids.map(i=>cards[i]),lane,version);if(!best||r.key>best.key||r.key===best.key&&r.natural&&!best.natural)best=r;}return best;
}
function rng(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const combinations=(cards,n)=>n===1?cards.map(c=>[c]):cards.flatMap((a,i)=>cards.slice(i+1).map(b=>[a,b]));
// A carry is selected only after both the source and destination's fresh cards
// are known. This is legal in v5: carry remains an explicit, one-time action.
function resolve(board,version){const rows=[board[0],null,null],carry=[];
 for(let i=1;i<3;i++){let best;for(const c of combinations(rows[i-1],i)){const candidate=[...c,...board[i]],ev=evaluate(candidate,[3,5,7][i],version);if(!best||ev.score>best.ev.score||ev.score===best.ev.score&&ev.key>best.ev.key)best={cards:candidate,ev,c};}rows[i]=best.cards;carry.push(best.c);}
 return {rows,carry,values:rows.map((r,i)=>evaluate(r,[3,5,7][i],version))};
}
// Online placement policies use explicit rank/suit affinities, never the deck.
// Balanced spreads cards toward promising rows; aggressive preferentially builds
// the best available high pair/trips in 3s. Both save passes for harmful late cards.
function affinity(cards,lane,version){const rs=cards.map(rank),counts=new Map();let w=0;for(const r of rs)if(r===lane)w++;else counts.set(r,(counts.get(r)??0)+1);
 const groups=[...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]),top=groups[0]??[15,0];
 if(lane===3){const n=top[1]+w,high=groups.reduce((a,[r])=>Math.max(a,r),0);return n>=3?(version===6?trips[top[0]]:150+30*top[0]):n===2?(version===6?pair[top[0]]:10*top[0])+high:high*2;}
 let suits=[0,0,0,0];cards.forEach(c=>{if(rank(c)!==lane)suits[Math.floor(c/13)]++;});
 const straight=Math.max(...straights.map(s=>rs.filter(r=>r!==lane&&s.includes(r)).filter((r,i,a)=>a.indexOf(r)===i).length));
 return 170*(top[1]+w)**2+60*(groups[1]?.[1]??0)**2+35*(Math.max(...suits)+w)**2+25*(straight+w)**2+top[0];
}
function decision({board,card,passes,version,policy}){
 const capacities=[3,4,5],open=[0,1,2].filter(i=>board[i].length<capacities[i]);
 if(policy==='sequential')return {lane:open[0]};
 if(policy==='balanced'){
  const r=rank(card),own=[3,5,7].indexOf(r);if(open.includes(own))return {lane:own};
  if(open.includes(0)){
   const current=board[0],rs=current.map(rank);
   if(current.length===0&&r>=10&&!board.slice(1).some(row=>row.some(c=>rank(c)===r)))return {lane:0};
   if(current.length===1&&(rs[0]===3||rs[0]===r))return {lane:0};
   if(current.length===2&&evaluate([...current,card],3,version).category===3)return {lane:0};
  }
 }
 if(policy==='aggressive3'&&open.includes(0)){
  const current=board[0],r=rank(card),rs=current.map(rank);
  const improves=current.length===0?(r===3||r>=10):current.length===1?(r===3||rs[0]===3||r===rs[0]):evaluate([...current,card],3,version).category===3;
  if(improves)return {lane:0};
  if(open.length===1&&passes>0)return {pass:true};
 }
 const utility=i=>{const inherited=i===0?[]:board[i-1].slice().sort((a,b)=>((rank(b)===[3,5,7][i]?100:rank(b))-(rank(a)===[3,5,7][i]?100:rank(a)))).slice(0,i);const prior=[...inherited,...board[i]],next=[...prior,card],lane=[3,5,7][i];
  const delta=affinity(next,lane,version)-affinity(prior,lane,version);
  // Reserve scarce 3s slots for matching ranks. Score values drive the preference.
  const weight=['aggressive3','weighted3'].includes(policy)?(i===0?3.5:i===2?1:.9):1;
  let value=delta*weight/(i===0?1:2.5);
  if(i===0&&next.length===3)value=(evaluate(next,3,version).score-affinity(prior,3,version)) *weight;
  return value;
 };
 let lane=open[0],best=-Infinity;for(const i of open){if(i===0&&open.length>1&&(policy==='aggressive3'||policy==='balanced'&&board[0].length===2))continue;const value=utility(i);if(value>best){best=value;lane=i;}}
 if(passes>0&&open.length===1&&best<0)return {pass:true};
 return {lane};
}
export function simulateRound(seed,version,policy){const random=rng(seed),deck=Array.from({length:52},(_,i)=>i);
 for(let i=51;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
 const board=[[],[],[]];let passes=3,cursor=0,placed=0;
 while(placed<12){const card=deck[cursor++],action=decision({board,card,passes,version,policy});if(action.pass){passes--;continue;}board[action.lane].push(card);placed++;}
 assert.equal(new Set(board.flat()).size,12);assert.ok(cursor<=15);
 const out=resolve(board,version),all=out.values.every(v=>v.score>0)?500:0,base=out.values.reduce((n,v)=>n+v.score,all);
 // Explicit fixed motor-time scenario, identical across rules and policies:
 // 2s/card or pass, 2s/carry, plus two preserved 4s row celebration beats.
 const elapsed=cursor*2000+4000+8000,remaining=120000-elapsed,time=Math.round(base*.2*remaining/120000);
 return {...out,score:base+time,all,time,passesUsed:3-passes,elapsed};
}
export function exhaustive(){let count=0,pairMax=0,tripsMin=Infinity,totals={5:0,6:0},freq={0:0,1:0,3:0};const examples=[];
 for(let a=0;a<52;a++)for(let b=a+1;b<52;b++)for(let c=b+1;c<52;c++){const cards=[a,b,c],x=evaluate(cards,3,6);count++;freq[x.category]++;totals[6]+=x.score;totals[5]+=evaluate(cards,3,5).score;if(x.category===1)pairMax=Math.max(pairMax,x.score);if(x.category===3)tripsMin=Math.min(tripsMin,x.score);}
 assert.equal(count,22100);assert.ok(tripsMin>pairMax);
 for(const [cards,expected] of [[[5,18,12],246],[[12,25,5],761],[[5,18,31],1404],[[11,24,37],2460],[[12,25,38],2688],[[1,12,25],2240]]){const actual=evaluate(cards,3,6).score;assert.equal(actual,expected);examples.push({cards,expected,actual});}
 return {count,pairMax,tripsMin,freq,averages:{5:totals[5]/count,6:totals[6]/count},examples};
}
if(process.argv[1]?.endsWith('drop-simulation.mjs')){
 const n=Number(process.env.DROP_SIM_ROUNDS??100000),only=process.argv.includes('--aggressive-only')?'aggressive3':process.argv.includes('--balanced-only')?'balanced':null,policies=only?[only]:['sequential','balanced','aggressive3'],reports=only?JSON.parse(readFileSync('qualification.local/coordinated/drop-simulation.json')).reports.map(r=>({...r,policy:r.policy===only?(only==='balanced'?'greedyBalanced':'weighted3'):r.policy})):[];
 for(const policy of policies)for(const version of [5,6]){let sums=[0,0,0],allCount=0,allValue=0,time=0,passes=0,sevenZero=0,nat7=0,carryWild7=0,sum=0,sumSq=0,freq={0:0,1:0,3:0},sevenCategories={};const scores=[];
  for(let i=0;i<n;i++){const r=simulateRound((0x35700000+i*2654435761)>>>0,version,policy);r.values.forEach((v,j)=>sums[j]+=v.score);freq[r.values[0].category]++;const s=r.values[2];sevenCategories[s.category]=(sevenCategories[s.category]??0)+1;if(s.score===0)sevenZero++;if(s.natural)nat7++;if(r.carry[1].some(c=>rank(c)===7))carryWild7++;allCount+=r.all>0?1:0;allValue+=r.all;time+=r.time;passes+=r.passesUsed;sum+=r.score;sumSq+=r.score*r.score;scores.push(r.score);}
  scores.sort((a,b)=>a-b);const mean=sum/n;const report={policy,version,n,averageRows:sums.map(x=>x/n),rowSharesPct:sums.map(x=>100*x/sum),mean,allFilledPct:100*allCount/n,allFilledAverage:allValue/n,timeAverage:time/n,pairTripsNoQualPct:{pair:100*freq[1]/n,trips:100*freq[3]/n,none:100*freq[0]/n},passesAverage:passes/n,seven:{noQualPct:100*sevenZero/n,naturalPct:100*nat7/n,carryWildPct:100*carryWild7/n,categories:sevenCategories},distribution:{min:scores[0],p10:scores[Math.floor(n*.1)],median:scores[Math.floor(n*.5)],p90:scores[Math.floor(n*.9)],p99:scores[Math.floor(n*.99)],max:scores[n-1],sd:Math.sqrt(sumSq/n-mean**2)}};reports.push(report);console.log(JSON.stringify(report));
 }
 const result={seed:'(0x35700000 + i*2654435761) uint32; Fisher-Yates / LCG1664525,1013904223',exhaustive:exhaustive(),reports,inflation:['sequential','balanced','aggressive3'].map(policy=>{const a=reports.find(r=>r.policy===policy&&r.version===5),b=reports.find(r=>r.policy===policy&&r.version===6);return {policy,pct:100*(b.mean/a.mean-1)};})};mkdirSync('qualification.local/coordinated',{recursive:true});writeFileSync('qualification.local/coordinated/drop-simulation.json',JSON.stringify(result,null,2));
}
