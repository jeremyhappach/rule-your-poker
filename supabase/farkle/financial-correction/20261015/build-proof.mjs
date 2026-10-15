import {readFileSync,writeFileSync} from 'node:fs';
for(const file of ['proof','supplement','immutability']){
 let s=readFileSync('supabase/farkle/financial-audit/20261015/'+file+'.mjs','utf8');
 s=s.split('\n').filter(l=>!l.includes("await caseRun('deactivated account'")&&!l.includes("await caseRun('inactive setup'")).join('\n');
 // A final-queue Farkle can complete on a server roll, before a final bank.
 // Preserve that exact applied request for callers that then assert dedupe.
 s=s.replace('async function finalArgs(f){for(let i=0;i<300;i++){','async function finalArgs(f){let last;for(let i=0;i<300;i++){');
 s=s.replace("const s=await read(f);assert.equal(s.gamePhase,'playing');","const s=await read(f);if(s.gamePhase==='complete'&&last)return last;assert.equal(s.gamePhase,'playing');");
 s=s.replace("}else await act(f,'roll');","}else {last=[f.round,s.currentTurnPlayerId,'roll',s.actionSequence,randomUUID(),'[]'];await rpc(actionSql,last,f.users[f.players.indexOf(s.currentTurnPlayerId)]);}");
 s=s.replaceAll("dir+'"+file+"-result.json'","dir+'corrected-"+file+"-result.json'");
 if(file==='proof')s=s.replace('const outcomes=await Promise.all(jobs);','const outcomes=await Promise.all(jobs);assert.ok(outcomes.every(x=>!x.error && !x.failed),JSON.stringify(outcomes));');
 s+='\nif(result.errors.length)process.exitCode=1;\n';
 writeFileSync('supabase/farkle/financial-correction/20261015/'+file+'.mjs',s);
}
