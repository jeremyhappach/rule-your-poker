import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {createHash} from 'node:crypto';
import {connect,context} from './bots-database.mjs';
const prod=JSON.parse(read('qualification.local/eleven-up-bots/production-preflight.json','utf8'));
const baseline=JSON.parse(read('qualification.local/eleven-up-bots/baseline.json','utf8'));
const digest=s=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
const c=await connect(context().database),results=[];
try{
 await c.query('begin');
 await c.query(read('supabase/eleven-up/rollback-bot-admission.sql','utf8').replace('\nBEGIN;\n','\n').replace(/\nCOMMIT;\s*$/,'\n'));
 for(const f of prod.functions){
  const local=f.signature==='private.eleven_up_recover()'?baseline.find(x=>x.proname==='eleven_up_recover').definition:(await c.query('select pg_get_functiondef($1::regprocedure) v',[f.signature])).rows[0].v;
  results.push({signature:f.signature,production:digest(f.definition),qualified:digest(local),match:digest(f.definition)===digest(local)});
 }
 await c.query('rollback');
 write('qualification.local/eleven-up-bots/production-comparison.json',JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify(results,null,2));
 if(results.some(x=>!x.match))throw Error('Production definition drift; release stopped before mutation');
}finally{await c.query('rollback').catch(()=>{});await c.end();}
