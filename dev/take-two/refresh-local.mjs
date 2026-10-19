import {readFileSync as read} from 'node:fs';import {connect,localContext} from './database.mjs';
const c=await connect(localContext().database);try{
 await c.query('BEGIN');
 for(const name of ['rules','multiplayer','arcade']){
  const text=read('supabase/take-two/'+name+'.sql','utf8');
  const functions=[...text.matchAll(/CREATE OR REPLACE FUNCTION[\s\S]*?(\$function\$|\$\$)[\s\S]*?\1\s*;/g)].map(x=>x[0]);
  for(const f of functions)await c.query(f);
 }
 await c.query('COMMIT');console.log('Refreshed local candidate functions.');
}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
