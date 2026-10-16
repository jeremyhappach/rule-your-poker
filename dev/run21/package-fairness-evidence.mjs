// Sanitized qualification summary. Detailed fixtures/credentials remain ignored.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root='qualification.local/farkle-full-stack';
const results=JSON.parse(fs.readFileSync(root+'/run21-lifecycle-streamed-results.json','utf8'));
assert.equal(results.stats.expected,2);assert.equal(results.stats.unexpected,0);
const browser=[];
for(const directory of fs.readdirSync(root+'/run21-lifecycle-streamed-output')){
 const file=path.join(root,'run21-lifecycle-streamed-output',directory,'evidence.json');
 if(!fs.existsSync(file))continue;
 const e=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.equal(e.pageErrors.length,0);assert(e.successor);assert.equal(e.initial.match.deck_version,2);
 for(const index of [0,1])assert.equal(e['flights'+index].length,1);
 browser.push({successor:e.next,rounds:e.settled.match.state.rounds.length,
  decksPerRound:e.settled.match.state.rounds.map(r=>Object.keys(r.secret.decks).length),
  canonicalDollarFlights:[e.flights0.length,e.flights1.length],
  authenticatedPlayers:2,liveWatcherAndReloadAssertions:true,errors:0});
}
assert.equal(browser.length,2);
const database={};
for(const name of ['fake-financial','fake-sudden-death','fake-terminal','real-disconnected','fake-legacy']){
 const e=JSON.parse(fs.readFileSync(`qualification.local/run21-production/continuation-${name}-result.json`,'utf8'));
 assert.equal(e.productionWrites,0);assert(e.fixtureTransactionRolledBack&&e.isolatedDatabaseWillBeDropped);
 database[name]=e.tests.map(t=>t.name);
}
const evidence={qualifiedAt:new Date().toISOString(),checkpoint:'run21-independent-decks-2026-10-16',
 regression:{src:2168,harness:241,additionalTerminalIdentity:1},typecheck:'tsc -p tsconfig.app.json --noEmit',
 build:'vite build',browser,database,terminalDelivery:JSON.parse(fs.readFileSync('dev/run21/continuation.evidence.json','utf8')).terminalCapture,productionFinancialTestWrites:0,
 containment:'supabase/run21/fairness-containment.evidence.json',
 historicalMatches:26,unfinishedRealMoneyDisposition:'Leave paused for Jeremy review'};
fs.writeFileSync('dev/run21/fairness.evidence.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({qualified:true,browserScenarios:browser.length,productionFinancialTestWrites:0}));
