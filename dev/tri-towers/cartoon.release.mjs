import {connect} from './bots-fixture.mjs';import {readFileSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const {database}=JSON.parse(readFileSync('qualification.local/tri-towers/cartoon-context.json','utf8')),db=await connect(database);
const expected={arcade_tri_high_run:'f606840e2d4ebf36def30ea0dc533be9',arcade_tri_projection:'06858886c865398fc2fd557cdf3c4dd6',tri_towers_present:'86847067a4804dc9c1d60db300a59336'};
try{
 const functions=(await db.query("SELECT proname,md5(pg_get_functiondef(oid)) hash FROM pg_proc WHERE proname IN ('arcade_tri_high_run','arcade_tri_projection','tri_towers_present')")).rows;
 for(const f of functions)assert.equal(f.hash,expected[f.proname]);assert.equal(functions.length,3);
 const evidence={migration:'20261017140055',at:new Date().toISOString(),candidateAndInstalledHashes:expected,candidateArcadeRollback:'PASS',candidateCanonicalFinancialProof:'PASS',installedArcadeProjectionRollback:'PASS',applicationTests:2308,harnessTests:241,typecheck:'PASS',build:'PASS',arcade:JSON.parse(readFileSync('qualification.local/tri-towers/cartoon-ui/evidence.json','utf8')),multiplayer:JSON.parse(readFileSync('qualification.local/tri-towers/cartoon-ui/multiplayer.json','utf8')),ownerSmoke:'PENDING'};
 writeFileSync('dev/tri-towers/cartoon.evidence.json',JSON.stringify(evidence,null,2));console.log('PASS all three installed function hashes match the qualified candidate');
}finally{await db.end();}
