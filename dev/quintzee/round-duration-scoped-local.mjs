import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {context,connect} from './database.mjs';
import {installCandidate} from './install-candidate.mjs';
import {installPolish} from './install-polish.mjs';
const c=await connect((await context()).database);
try {
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 await installCandidate(c);await installPolish(c);
 // Use the exact read-only hosted configure definition for the migration's drift guard.
 await c.query(read('dev/quintzee/evidence/round-duration/installed-configure.sql','utf8'));
 await c.query(read('supabase/migrations/20261028003718_quintzee_configurable_round_duration.sql','utf8'));
 await c.query("UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL");
 const sql=read('supabase/quintzee/round-duration-scoped-proof.sql','utf8');
 if(!sql.startsWith('BEGIN ISOLATION LEVEL REPEATABLE READ;')||!sql.trimEnd().endsWith('ROLLBACK;')||/DISABLE TRIGGER/i.test(sql))throw Error('Proof containment or trigger invariant failed');
 const result=await c.query(sql.slice('BEGIN ISOLATION LEVEL REPEATABLE READ;'.length));
 const rows=(Array.isArray(result)?result:[result]).flatMap(r=>r.rows??[]);
 if(!rows.some(r=>r.proof==='Scoped installed Quintzee /3 qualification PASS'))throw Error('Missing final qualification receipt');
 write('dev/quintzee/evidence/round-duration/scoped-installed-local.json',JSON.stringify({passed:true,local:true,hosted:false,rolledBack:true,allTriggersEnabled:true,at:new Date().toISOString(),rows},null,2));
 console.log(JSON.stringify(rows));
} catch(e){await c.query('ROLLBACK');console.error(e);process.exitCode=1;}finally{await c.end();}
