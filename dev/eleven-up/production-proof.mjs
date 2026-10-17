import {connect,context} from './database.mjs';
import {readFile} from 'node:fs/promises';
const {database}=await context(),c=await connect(database);
try{
 await c.query('BEGIN');
 if(!(await c.query("SELECT to_regprocedure('private.eleven_up_admission_rules()') AS owner")).rows[0].owner)
  await c.query(await readFile('supabase/migrations/20261017220602_eleven_up_three_minute.sql','utf8'));
 await c.query("UPDATE private.arcade_rulesets SET enabled=true WHERE id='eleven-up/2'");
 await c.query(await readFile('supabase/eleven-up/production-proof.sql','utf8'));
 await c.query(await readFile('supabase/eleven-up/timing-v2-proof.sql','utf8'));
 console.log('Production-shaped settlement, recovery and v1/v2 timing proofs passed locally');
}finally{await c.query('ROLLBACK');await c.end();}
