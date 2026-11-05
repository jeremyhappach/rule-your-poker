import {connect} from '../async-words/local.mjs';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
const out='qualification.local/async-tri-step';mkdirSync(out,{recursive:true});
let database;
if(existsSync(out+'/context.json'))database=JSON.parse(readFileSync(out+'/context.json')).database;
else{const root=await connect('postgres');database='async_tri_step_'+Date.now();await root.query('CREATE DATABASE '+database+' TEMPLATE async_take_two_1793840079313');await root.end();writeFileSync(out+'/context.json',JSON.stringify({database}));}
const db=await connect(database);
try{
 await db.query('BEGIN');await db.query(readFileSync('supabase/delayed/tri-step.sql','utf8'));
 await db.query("UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp();UPDATE private.delayed_release SET admission_enabled=true,real_qualified=true");
 const results=await db.query(readFileSync('supabase/delayed/tri-step-proof.sql','utf8'));
 console.log(JSON.stringify({database,checks:results.at(-1).rows}));
 writeFileSync(out+'/rollback.json',JSON.stringify({database,checks:results.at(-1).rows},null,2));
 await db.query('ROLLBACK');
 await db.query(readFileSync('supabase/delayed/tri-step.sql','utf8'));
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
