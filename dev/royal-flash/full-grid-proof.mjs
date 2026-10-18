import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {connect,localContext} from './database.mjs';
const proof=['proof','core-proof','acceptance-proof','presentation-proof','full-grid-proof'].map(n=>read('supabase/royal-flash/'+n+'.sql','utf8')).join('\n');
const candidate=read('qualification.local/royal-flash/full-grid-migration.sql','utf8');
write('qualification.local/royal-flash/full-grid-candidate-proof.sql','BEGIN;\n'+candidate+proof+'\nROLLBACK;');
write('qualification.local/royal-flash/full-grid-installed-proof.sql','BEGIN;\n'+proof+'\nROLLBACK;');
const c=await connect(localContext().database);
try{await c.query('BEGIN');await c.query(read('supabase/royal-flash/full-grid.sql','utf8'));const results=await c.query(proof);console.log(results.filter(r=>r.rows?.length).map(r=>r.rows));await c.query('ROLLBACK');await c.query(read('supabase/royal-flash/full-grid.sql','utf8'));console.log('PASS: installed candidate in disposable database');}
catch(e){await c.query('ROLLBACK');console.error(e.message,e.where);process.exitCode=1;}finally{await c.end();}
