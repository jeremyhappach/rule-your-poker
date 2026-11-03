// Generate server-policy parity fixtures from the established, retired browser policy.
// Uses only installed tooling; no database or network access.
import {build} from 'esbuild';
import {writeFileSync} from 'node:fs';
const bundled=await build({entryPoints:['src/lib/botHandStrength.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {getBotFoldProbability}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const specimens=[
 [1,'A K 9'],[1,'Q Q 2'],[1,'8 8 K'],[1,'2 2 K'],[1,'3 Q 9'],[1,'A A A'],
 [2,'A J 9 4 2'],[2,'8 8 8 A 2'],[2,'Q Q Q A 2'],[2,'A A 8 8 2'],
 [2,'5 Q Q 2 9'],[2,'6 7 8 9 10'],[2,'A A A K K'],[2,'5 5 A K 2'],
 [3,'A K J 9 8 4 2'],[3,'8 8 8 A K 4 2'],[3,'Q Q Q A 9 4 2'],
 [3,'7 Q Q A 9 4 2'],[3,'6 8 9 10 J 2 4'],[3,'A A A K K 4 2'],
];
const suits=['♠','♥','♦','♣'];
const cases=[];const log=console.log;console.log=()=>{};
for(const [round,ranks] of specimens){
 const cards=ranks.split(' ').map((rank,i)=>({rank,suit:suits[i%4]}));
 for(const aggression of ['very_conservative','conservative','normal','aggressive','very_aggressive']){
  const expected=Number(getBotFoldProbability(cards,[],'357',round,aggression).toFixed(6));
  cases.push({round,cards,aggression,expected});
 }
}
console.log=log;
writeFileSync('supabase/tests/three_five_seven_bot_policy_cases.json','[\n'+cases.map(c=>JSON.stringify(c)).join(',\n')+'\n]\n');
console.log('Saved '+cases.length+' policy parity cases');
