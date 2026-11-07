import {connect} from '../quintzee/database.mjs';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const database='originals_competition_'+Date.now();
const admin=await connect('postgres');
await admin.query('CREATE DATABASE '+database+' TEMPLATE chucky_showdown_v3_1794054002');await admin.end();
const db=await connect(database);
try{
 await db.query(readFileSync('supabase/migrations/20261106232247_crib_lab_polish_v2.sql','utf8'));
 for(const f of JSON.parse(readFileSync('dev/originals-competition/installed-current.json','utf8')))await db.query(f.definition);
 await db.query("update private.arcade_rulesets set enabled=false where game in ('crib-lab','chucky-showdown'); update private.arcade_rulesets set enabled=true where id in ('crib-lab/2','chucky-showdown/3')");
 mkdirSync('qualification.local/originals',{recursive:true});writeFileSync('qualification.local/originals/context.json',JSON.stringify({database}));console.log(database);
}finally{await db.end();}
