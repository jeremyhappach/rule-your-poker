import {readFileSync,writeFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const proof=JSON.parse(readFileSync(process.argv[2]??'artifacts/replay-baseline/gin-predecessor-final-proof.json','utf8'));
const code=stripTypeScriptTypes(readFileSync('src/lib/replay/contractV1.ts','utf8')).replace(/^export /gm,'');
const groups=new Map();
for(const item of proof.exports.filter(x=>x.category.includes(':hand'))){
 const p=item.package,key=p.sessionId+':'+JSON.stringify(p.perspective);
 const list=groups.get(key)??[];
 if(!list.some(x=>x.steps[0].identity.roundId===p.steps[0].identity.roundId)) list.push(p);
 groups.set(key,list);
}
const checks=[];
for(const list of groups.values()){
 list.sort((a,b)=>a.steps[0].identity.handNumber-b.steps[0].identity.handNumber);
 assert.equal(list.length,2);
 const replay={...list[0],steps:list.flatMap(p=>p.steps),seal:{...list[1].seal,stepCount:list[0].steps.length+list[1].steps.length}};
 const result=JSON.parse(vm.runInNewContext(code+"\nif(typeof process!=='undefined'||typeof require!=='undefined'||typeof fetch!=='undefined')throw Error('live capability');JSON.stringify(reconstructReplayV1(JSON.parse(input)));",{input:JSON.stringify(replay),structuredClone},{timeout:5000,codeGeneration:{strings:false,wasm:false}}));
 assert.deepEqual(result,replay.steps.at(-1).closing.endingState);
 const boundary=list[0].steps.at(-1);
 assert.equal(boundary.substeps[0].type,'gin.predecessor_completed');
 assert.equal(boundary.closing.endingState.round.status,'completed');
 assert.equal(list[1].steps.at(-1).closing.endingState.round.status,'completed');
 assert(BigInt(boundary.sequence)<BigInt(list[1].steps[0].sequence));
 checks.push({session:replay.sessionId,perspective:replay.perspective,steps:replay.steps.length,offline:'PASS',predecessorStatus:'completed',successorStatus:'completed'});
}
writeFileSync('artifacts/replay-baseline/gin-predecessor-combined-proof.json',JSON.stringify(checks,null,2));
console.log(checks.length+' combined two-hand packages reconstruct in a sandbox without live access; both final round statuses completed.');
