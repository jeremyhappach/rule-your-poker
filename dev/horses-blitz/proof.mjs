import {readFileSync,writeFileSync} from 'node:fs';
import {connect} from '../quintzee/database.mjs';
const {database}=JSON.parse(readFileSync('qualification.local/horses-blitz/context.json'));
if(!/^horses_blitz_v1_\d+$/.test(database))throw Error('Disposable database required');
const candidate=readFileSync('supabase/horses-blitz/rules.sql','utf8')+'\n'+readFileSync('supabase/horses-blitz/arcade.sql','utf8');
writeFileSync('qualification.local/horses-blitz/candidate.sql',candidate);
const c=await connect(database);
try{
 const sql=readFileSync('supabase/tests/horses_blitz_proof.sql','utf8').replace('-- CANDIDATE_DDL',()=>process.argv.includes('--installed')?'':candidate);
 console.log((await c.query(sql)).flatMap(x=>x.rows??[]));
 if(process.argv.includes('--install'))await c.query(candidate);
}finally{await c.end();}
