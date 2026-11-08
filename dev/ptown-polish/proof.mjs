import {readFileSync,writeFileSync} from 'node:fs';
import {connect} from '../quintzee/database.mjs';
const {database}=JSON.parse(readFileSync('qualification.local/ptown-polish/context.json'));
if(!/^ptown_polish_\d+$/.test(database))throw Error('Disposable local database required');
const candidate=['horses','drop'].map(n=>readFileSync('supabase/ptown-polish/'+n+'.sql','utf8')).join('\n');
const files=['supabase/ptown-polish/rules-proof.sql','supabase/ptown-polish/horses-proof.sql','supabase/ptown-polish/drop-proof.sql',
 'supabase/arcade-smoke-polish/horses-v3-proof.sql',...['','_v2','_v3','_v4'].map(v=>'supabase/tests/drop357'+v+'_proof.sql')];
const c=await connect(database),evidence=[];
try{
 for(const file of files){const sql=readFileSync(file,'utf8').replace('-- CANDIDATE_DDL',process.argv.includes('--installed')?'':()=>candidate);
  const answer=await c.query(sql);const rows=(Array.isArray(answer)?answer:[answer]).flatMap(r=>r.rows??[]);evidence.push({file,rows});console.log(file,rows);
 }
 if(process.argv.includes('--install'))await c.query(candidate);
 writeFileSync('qualification.local/ptown-polish/'+(process.argv.includes('--installed')?'installed':'candidate')+'-proof.json',JSON.stringify(evidence,null,2));
}finally{await c.end();}
