import {readFileSync,writeFileSync} from 'node:fs';
import {connect,localContext} from './database.mjs';
const c=await connect(localContext().database);
const sql=['proof','core-proof','acceptance-proof','presentation-proof'].map(n=>readFileSync('supabase/royal-flash/'+n+'.sql','utf8')).join('\n');
try{await c.query('BEGIN');const results=await c.query(sql);console.log(results.filter(r=>r.rows?.length).map(r=>r.rows));await c.query('ROLLBACK');writeFileSync('qualification.local/royal-flash/acceptance-proof.json',JSON.stringify({passed:true,at:new Date().toISOString()}));}
catch(e){await c.query('ROLLBACK');console.error(e.message,e.where);process.exitCode=1;}finally{await c.end();}
