import {readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
const baseline=JSON.parse(read('qualification.local/async-runback/release-baseline.json'));
for(const f of JSON.parse(read('dev/async-runback/preimage.json'))){
 const captured=baseline.find(r=>r.kind==='functions').value.find(r=>r.signature.split('(')[0].replace(/^public\./,'')===(f.schema==='public'?'':f.schema+'.')+f.name);
 assert.equal(captured?.definition.replace(/\r/g,''),f.definition.replace(/\r/g,''),'production preimage '+f.name);
}
const sql=path=>read(path,'utf8').replace(/\r/g,'');
const start="BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';\n";
const proof=sql('supabase/delayed/real-money-proof.sql')+'\n'+sql('supabase/delayed/runback-proof.sql');
const candidate=sql('supabase/delayed/runback.candidate.sql');
write('qualification.local/async-runback/hosted-candidate.sql',start+candidate+'\n'+proof+'\nROLLBACK;');
write('qualification.local/async-runback/hosted-installed.sql',start+proof+'\nROLLBACK;');
write('qualification.local/async-runback/migration.sql',"SET LOCAL lock_timeout='3s';\n"+candidate);
console.log('Seven production preimages match. Candidate/installed rollback proofs and guarded migration prepared.');
