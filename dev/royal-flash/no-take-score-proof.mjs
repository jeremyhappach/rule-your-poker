import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {connect,localContext} from './database.mjs';
const proof=['proof','core-proof','acceptance-proof','presentation-proof','full-grid-proof','no-take-score-proof'].map(n=>read('supabase/royal-flash/'+n+'.sql','utf8')).join('\n');
const body=read('supabase/royal-flash/no-take-score.sql','utf8');
write('qualification.local/royal-flash/no-take-candidate-proof.sql','BEGIN;\n'+read('qualification.local/royal-flash/no-take-migration.sql','utf8')+proof+'\nROLLBACK;');
write('qualification.local/royal-flash/no-take-installed-proof.sql','BEGIN;\n'+proof+'\nROLLBACK;');
const c=await connect(localContext().database);
try{await c.query('BEGIN');await c.query(body);const results=await c.query(proof);console.log(results.filter(r=>r.rows?.length).map(r=>r.rows));await c.query('ROLLBACK');await c.query(body);console.log('PASS: installed in disposable local database');}
catch(e){await c.query('ROLLBACK');console.error(e.message,e.where);process.exitCode=1;}finally{await c.end();}
