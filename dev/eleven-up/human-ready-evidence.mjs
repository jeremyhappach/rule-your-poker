import assert from 'node:assert/strict';
import {readFileSync as read, writeFileSync as write} from 'node:fs';
import {createHash} from 'node:crypto';
const hash=p=>createHash('sha256').update(read(p)).digest('hex');
const json=p=>JSON.parse(read(p,'utf8'));
const original='supabase/migrations/20261021002901_eleven_up_bots.sql';
const forward='supabase/migrations/20261021181947_eleven_up_human_ready.sql';
assert.equal(hash(original),'dcea1133d1df64b755b5c492ea8923d74bdea38ba050184f1463e5c9da22387d');
assert.equal(hash(forward),hash('supabase/eleven-up/human-ready.sql'));
const ordered=json('qualification.local/eleven-up-timeout/ordered-migrations.json');
assert.equal(ordered.forwardSha256,hash(forward));
const evidence={base:'0ecd5ab0cb604331605615cb2487dd4096deb4a7',
 branch:'codex/eleven-up-human-timeout',status:'Locally qualified ordered forward package; production release separately gated',
 originalMigrationSha256:hash(original),candidateSqlSha256:hash(forward),forwardMigration:forward,
 orderedMigrations:ordered,sql:json('qualification.local/eleven-up-timeout/proof.json'),
 browser:json('qualification.local/eleven-up-timeout/browser/results.json'),
 focusedRegression:{files:8,tests:49,result:'passed'},
 build:{commit:'e1aaf3975bf562fceb9f1917cb61974cf5720d4a',clientUnchanged:true,command:'npm run build',
 typecheck:'passed',applicationTests:2587,harnessTests:241,bundle:'passed'},
 productionWrites:[],migrationRegisteredLocally:true,
 limitations:['Retained local schema requires production parity recheck during authorized release',
 'Phone emulation is not physical iPhone acceptance','Serialized admission/database/client rollout and exact deployed SHA verification remain outstanding']};
write('supabase/eleven-up/human-ready-evidence.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({original:hash(original),forward:hash(forward)}));
