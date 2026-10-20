import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {connect,candidate,localContext} from './database.mjs';
const c=await connect(localContext().database);
try {
 await c.query('BEGIN');
 if(!(await c.query("SELECT to_regclass('private.race_poker_matches') present")).rows[0].present)await c.query(candidate());
 const proofs=['core-proof'];
 if(process.argv.includes('--financial'))proofs.push('financial-proof');
 for(const name of proofs){
  const result=await c.query(read(`supabase/race-poker/${name}.sql`,'utf8'));
  console.log(result.filter(r=>r.rows.length).flatMap(r=>r.rows));
 }
 await c.query('ROLLBACK');
 write('qualification.local/race-poker/proof.json',JSON.stringify({at:new Date().toISOString(),passed:true,proofs}));
}catch(e){console.error(e.message,e.where,e.position,e.internalQuery);await c.query('ROLLBACK');process.exitCode=1;}
finally{await c.end();}
