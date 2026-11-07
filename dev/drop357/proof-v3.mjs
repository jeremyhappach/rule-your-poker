import {readFileSync} from 'node:fs';
import {connect} from '../quintzee/database.mjs';
const db=process.argv[2];if(!/^drop357_v2_\d+$/.test(db??''))throw Error('Disposable database required');
const c=await connect(db);try{
 for(const f of ['drop357_proof','drop357_v2_proof','drop357_v3_proof']){
  let sql=readFileSync('supabase/tests/'+f+'.sql','utf8');
  if(!process.argv.includes('--installed'))sql=sql.replace('-- CANDIDATE_DDL',()=>readFileSync('supabase/drop357/v3.sql','utf8'));
  console.log((await c.query(sql)).flatMap(x=>x.rows??[]));
 }
 if(process.argv.includes('--install'))await c.query(readFileSync('supabase/drop357/v3.sql','utf8'));
}finally{await c.end();}
