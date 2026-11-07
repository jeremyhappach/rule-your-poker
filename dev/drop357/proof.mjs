import {readFileSync} from 'node:fs';
import {connect} from '../quintzee/database.mjs';
const db=process.argv[2];if(!/^drop357_v1_\d+$/.test(db??''))throw Error('Disposable database required');
const c=await connect(db);
try {
 let sql=readFileSync('supabase/tests/drop357_proof.sql','utf8');
 if(!process.argv.includes('--installed'))sql=sql.replace('-- CANDIDATE_DDL',()=>readFileSync('supabase/migrations/20261107195319_drop357_arcade_v1.sql','utf8'));
 const result=await c.query(sql);console.log(result.flatMap(x=>x.rows??[]));
}finally{await c.end();}
