import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {context,connect} from './database.mjs';
import {installCandidate} from './install-candidate.mjs';
import {installPolish} from './install-polish.mjs';
const c=await connect((await context()).database);
try {
 await c.query('BEGIN');
 await installCandidate(c);await installPolish(c);
 await c.query("UPDATE private.quintzee_release SET admission_enabled=false;UPDATE private.arcade_rulesets SET enabled=(id='quintzee/1') WHERE game='quintzee'");
 const sql=read('supabase/quintzee/installed-polish-proof.sql','utf8');
 if(!sql.startsWith('BEGIN;')||!sql.trimEnd().endsWith('ROLLBACK;')||/DISABLE TRIGGER/i.test(sql))throw Error('Proof containment or trigger invariant failed');
 const result=await c.query(sql.slice('BEGIN;'.length));
 const rows=(Array.isArray(result)?result:[result]).flatMap(r=>r.rows??[]);
 if(!rows.some(r=>r.proof==='Installed Quintzee /3 rollback and actual-role qualification PASS'))throw Error('Missing final qualification receipt');
 write('dev/quintzee/evidence/final-polish/prepared-installed-local.json',JSON.stringify({passed:true,local:true,hosted:false,rolledBack:true,allTriggersEnabled:true,at:new Date().toISOString(),rows},null,2));
 console.log(JSON.stringify(rows));
} catch(e){await c.query('ROLLBACK');console.error(e);process.exitCode=1;}finally{await c.end();}
