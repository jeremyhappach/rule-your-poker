import {readFileSync} from 'node:fs';
import {connect} from '../quintzee/database.mjs';
const db=process.argv[2];if(!/^drop357_v2_\d+$/.test(db??''))throw Error('Disposable v2 database required');
const c=await connect(db);
try{
 for(const file of ['supabase/tests/drop357_proof.sql','supabase/tests/drop357_v2_proof.sql']){
  let sql=readFileSync(file,'utf8');if(process.argv.includes('--candidate'))sql=sql.replace('-- CANDIDATE_DDL',()=>readFileSync('supabase/drop357/v2.sql','utf8')+'\n'+readFileSync('supabase/drop357/final-results.sql','utf8'));
  console.log((await c.query(sql)).flatMap(x=>x.rows??[]));
 }
}finally{await c.end();}
