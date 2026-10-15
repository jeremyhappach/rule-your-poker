import {c,dir} from './helpers.mjs';
import {readFileSync} from 'node:fs';
const q=s=>'"'+s.replaceAll('"','""')+'"';
try{const grants=JSON.parse(readFileSync(dir+'column-grants.json'));for(const g of grants){if(!['anon','authenticated','service_role','PUBLIC'].includes(g.role))continue;await c.query(`GRANT ${g.privilege} (${q(g.column)}) ON ${q(g.schema)}.${q(g.table)} TO ${g.role==='PUBLIC'?'PUBLIC':q(g.role)}${g.grantable?' WITH GRANT OPTION':''}`);}console.log('Restored captured production column grants');}finally{await c.end();}
