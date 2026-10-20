import {connect,localContext} from './database.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
const c=await connect(localContext().database);
try{
 await c.query('BEGIN');await c.query(read('supabase/trip-flip/rules.sql','utf8'));
 const r=await c.query(read('supabase/trip-flip/core-proof.sql','utf8'));
 console.log(r.filter(x=>x.rows.length).flatMap(x=>x.rows));await c.query('ROLLBACK');
 write('qualification.local/trip-flip/core.json',JSON.stringify({passed:true,at:new Date().toISOString()}));
}catch(e){console.error(e.message,e.where,e.position,e.internalQuery);await c.query('ROLLBACK');process.exitCode=1;}finally{await c.end();}
