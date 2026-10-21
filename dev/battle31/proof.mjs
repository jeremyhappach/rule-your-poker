// Local-only driver; the shared proof defaults to actual scheduler health.
import {writeFileSync as write} from 'node:fs';
import {connect,localContext,candidate} from './database.mjs';
import {runFinancialProof} from './financial-cases.mjs';
const c=await connect(localContext().database);
try {
 const exists=(await c.query("SELECT to_regclass('private.battle31_release') present")).rows[0].present;
 if(!exists)await c.query(candidate());
 const evidence=await runFinancialProof(c,{seedLocalHealth:true});
 write('qualification.local/battle31/financial-proof.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
} finally {await c.end();}
