import {audit,proposed} from './horses-ev.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
const seedMatrix=[[500,525,550,575,600],[600,630,660,690,720],[810,850,895,935,975]];
const cfg=process.argv.includes('--refine')?JSON.parse(readFileSync('qualification.local/coordinated/horses-optimized.json')).config:structuredClone(proposed);if(!process.argv.includes('--refine'))cfg.matrix.splice(2,3,...seedMatrix);
const views=c=>[audit(c),audit(c,{rollMs:1500,remainingMs:30000}),audit(c,{rollMs:1500,remainingMs:30500})];
function metrics(c,full=false){
 let cost=0,low=100,high=-100,out=0,n=0,worst=[];
 for(const a of views(c))for(const r of [1,2])for(const x of a.details[r])if([3,4].includes(x.size)){
 const d=x.chase/x.bank-1;n++;low=Math.min(low,d);high=Math.max(high,d);if(Math.abs(d)>.10)out++;
 cost+=Math.max(0,Math.abs(d)-.098)**2*10000+Math.max(0,Math.abs(d)-.05)**2;
 if(full)worst.push({...x,roll:r,ms:a.rollMs,phase:a.remainingMs,dPct:100*d});
 }
 // Changes from the supplied values are secondary to satisfying neutrality.
 for(let s=2;s<5;s++)for(let r=0;r<5;r++)cost+=.00002*((c.matrix[s][r]/proposed.matrix[s][r])-1)**2;
 return {cost,low:100*low,high:100*high,out,n,...(full?{worst:worst.sort((a,b)=>Math.abs(b.dPct)-Math.abs(a.dPct)).slice(0,20)}:{})};
}
const valid=c=>c.matrix.slice(2).every(row=>row.every((x,i)=>x>0&&(!i||x>row[i-1])))&&c.matrix[2].every((x,i)=>x<c.matrix[3][i]&&c.matrix[3][i]<c.matrix[4][i])&&c.matrix[4][4]<c.ones;
let current=metrics(cfg);console.log('Seed',JSON.stringify({matrix:cfg.matrix,...current}));
for(const step of [40,20,10,5,2,1]){
 for(let pass=0;pass<10;pass++){let improvement=false;
 for(let s=2;s<5;s++)for(let rank=0;rank<5;rank++){
 const start=cfg.matrix[s][rank];let best=start,bestResult=current;
 for(const delta of [-step,step]){cfg.matrix[s][rank]=start+delta;if(!valid(cfg))continue;const m=metrics(cfg);if(m.cost<bestResult.cost-1e-10){bestResult=m;best=start+delta;}}
 cfg.matrix[s][rank]=best;if(best!==start){current=bestResult;improvement=true;}
 }if(!improvement)break;
 }
 console.log('Step',step,JSON.stringify({matrix:cfg.matrix,...current}));
}
const result={proposed:metrics(proposed,true),optimized:metrics(cfg,true),config:cfg};
writeFileSync('qualification.local/coordinated/horses-optimized.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
