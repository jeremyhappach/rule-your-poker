import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {connect,context,candidate} from './database.mjs';
const c=await connect(context().database);
try{
 await c.query('BEGIN');
 await c.query(read('dev/ptown-words/reference-pause.sql','utf8'));
 // Local reference database is an isolated historical clone. Install the exact
 // inspected shared owners here only; production uses guarded registration.
 const evidence=JSON.parse(read('dev/ptown-words/deployed-contract.json','utf8'));
 if(!(await c.query("SELECT to_regclass('private.ptown_words_matches') present")).rows[0].present){for(const f of evidence.functions.filter(f=>['megatouch_begin','advance_ante_phase_exact','megatouch_frozen_stake'].includes(f.name)))await c.query(f.definition);await c.query(candidate());}
 for(const name of ['core-proof','proof']){const result=await c.query(read('supabase/ptown-words/'+name+'.sql','utf8'));console.log(result.filter(x=>x.rows?.length).flatMap(x=>x.rows));}
 await c.query('ROLLBACK');write('qualification.local/ptown-words/database-proof.json',JSON.stringify({passed:true,at:new Date().toISOString()}));
}catch(e){console.error(e.message,e.where,e.position,e.internalQuery);await c.query('ROLLBACK');process.exitCode=1;}finally{await c.end();}
