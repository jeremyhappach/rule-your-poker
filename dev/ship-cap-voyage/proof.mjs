import {readFileSync,writeFileSync} from 'node:fs';
import {connect} from '../quintzee/database.mjs';
const {database}=JSON.parse(readFileSync('qualification.local/ship-cap-voyage/context.json'));
if(!/^ship_cap_voyage_\d+$/.test(database))throw Error('Disposable loopback database required');
const candidate=['rules','arcade'].map(n=>readFileSync('supabase/ship-cap-voyage/'+n+'.sql','utf8')).join('\n');
const proof=readFileSync('supabase/ship-cap-voyage/proof.sql','utf8'),c=await connect(database);
try{
 const candidateProof=await c.query(proof.replace('-- CANDIDATE_DDL',()=>candidate));
 console.log(candidateProof.flatMap(x=>x.rows??[]));
 await c.query(candidate);
 const installed=await c.query(proof);
 console.log(installed.flatMap(x=>x.rows??[]));
 writeFileSync('qualification.local/ship-cap-voyage/sql-proof.json',JSON.stringify({database,candidate:true,installed:true,productionChanged:false}));
}finally{await c.end();}
