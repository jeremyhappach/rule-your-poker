import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {context,connect} from './database.mjs';
const ctx=await context(),c=await connect(ctx.database);
try{
 await c.query('BEGIN');
 // The local financial template predates Yahtzee's cutover. Install only its
 // unchanged pure scorer from checked-out main into this disposable clone.
 const source=readFileSync('supabase/migrations/20260817012426_yahtzee_authority_cutover.sql','utf8');
 const scorer=source.slice(source.indexOf('CREATE OR REPLACE FUNCTION private.yahtzee_category_score('),source.indexOf('CREATE OR REPLACE FUNCTION private.yahtzee_guard_round_mutation('));
 if(!scorer.trim().endsWith('$$;'))throw Error('Unexpected Yahtzee source boundary');
 await c.query(scorer);
 const dependencies=(await c.query("SELECT to_regprocedure('private.yahtzee_category_score(jsonb,jsonb,text)')::text scorer,to_regprocedure('extensions.gen_random_bytes(integer)')::text randomness")).rows[0];
 if(!dependencies.scorer||!dependencies.randomness)throw Error('Local reference database lacks Yahtzee authority or CSPRNG');
 await c.query(readFileSync('supabase/quintzee/rules.sql','utf8'));
 await c.query(readFileSync('dev/quintzee/authority.sql','utf8'));
 await c.query('COMMIT');
 mkdirSync('dev/quintzee/evidence',{recursive:true});writeFileSync('dev/quintzee/evidence/setup.json',JSON.stringify({local:true,database:ctx.database,dependencies,admission:false},null,2));
 console.log({database:ctx.database,dependencies,admission:false});
}catch(e){await c.query('ROLLBACK');console.error(e.message,e.where);process.exitCode=1;}finally{await c.end();}
