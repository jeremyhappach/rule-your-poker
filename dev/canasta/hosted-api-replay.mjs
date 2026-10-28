import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write,existsSync} from 'node:fs';
import {login,api,sleep} from './hosted-support.mjs';
assert(process.argv.includes('--run-approved-fixture'));
const f=JSON.parse(read('qualification.local/canasta/final-fixture.json','utf8'));
const a=await login(),e={game:f.game,match:f.dealer,passed:false};
try{
 const c=a.byUser[f.users[f.players.indexOf(f.command.playerId)]];assert(c);
 const prior=await api(c,f.dealer,'state');assert.equal(prior.status,200);assert(prior.body.finished);e.authenticatedRead=true;
 const unauth=await fetch(`https://holm357.com/__canasta/${f.dealer}/state`);assert.equal(unauth.status,401);e.unauthenticatedDenied=true;
 write('qualification.local/canasta/api-replay-ready','ready');console.log('API replay ready');
 const until=Date.now()+90000;while(!existsSync('qualification.local/canasta/api-replay-go')&&Date.now()<until)await sleep(100);assert(existsSync('qualification.local/canasta/api-replay-go'));
 const when=Number(read('qualification.local/canasta/api-replay-go','utf8'));await sleep(Math.max(0,when-Date.now()));
 const start=Date.now(),r=await Promise.all([api(c,f.dealer,'action',f.command),api(c,f.dealer,'action',f.command)]);e.elapsedMs=Date.now()-start;
 assert(r.every(x=>x.status===200));assert(e.elapsedMs>2500,'Held-lock overlap required');
 for(const x of r){assert.equal(x.body.state.id,f.dealer);assert.deepEqual(x.body.settlement,prior.body.settlement);assert.equal(x.body.state.revision,prior.body.state.revision);}
 e.replays=2;e.passed=true;
}catch(error){e.failure=error.message;process.exitCode=1;}
finally{await a.close();write('dev/canasta/evidence/hosted-api-replay.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));}
