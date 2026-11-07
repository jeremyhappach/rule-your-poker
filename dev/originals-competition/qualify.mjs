import {connect} from '../quintzee/database.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
const {database}=JSON.parse(read('qualification.local/originals/context.json'));
const c=await connect(database),checks=[];
try{
 await c.query('BEGIN');
 await c.query("update private.arcade_rulesets set enabled=false where game in('crib-lab','chucky-showdown');update private.arcade_rulesets set enabled=true where id in('crib-lab/2','chucky-showdown/3')");
 for(const file of ['gameplay','async','live-foundation','live']){await c.query(read('supabase/originals-competition/'+file+'.sql','utf8'));checks.push(file+' compiles');}
 if(process.argv.includes('--compile'))console.log(checks);
 else{await c.query(read('supabase/originals-competition/live-proof.sql','utf8'));checks.push('live financial/lifecycle matrix');await c.query(read('supabase/originals-competition/async-financial-proof.sql','utf8'));checks.push('async financial matrix');await c.query(read('supabase/originals-competition/gameplay-proof.sql','utf8'));checks.push('earned live completion, pause and zero-client recovery');}
 await c.query('ROLLBACK');
 if((await c.query("select to_regclass('private.originals_release') value")).rows[0].value!==null)throw Error('Candidate survived rollback');
 write('qualification.local/originals/proof.json',JSON.stringify({passed:true,checks,rollback:true},null,2));console.log('PASS',checks);
}catch(e){await c.query('ROLLBACK');console.error(e.message,e.where,e.position);write('qualification.local/originals/proof.json',JSON.stringify({passed:false,checks,error:e.message,where:e.where},null,2));process.exitCode=1;}finally{await c.end();}
