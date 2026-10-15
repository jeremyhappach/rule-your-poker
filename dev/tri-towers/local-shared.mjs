// Metadata-only production clone, applied exclusively to the isolated loopback DB.
import {readFile,writeFile} from 'node:fs/promises';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database:'postgres'});
await c.connect();
const q=s=>'"'+s.replaceAll('"','""')+'"';
try {
 const source=JSON.parse(await readFile('qualification.local/tri-towers/shared-source.json','utf8'));
 const inventory=JSON.parse(await readFile('qualification.local/tri-towers/activation-inventory.json','utf8'));
 await c.query('BEGIN; SET LOCAL check_function_bodies=off');
 await c.query("CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$; GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated");
 for(const t of source.tables){
  if((await c.query('SELECT to_regclass($1) r',[t.schema+'.'+t.name])).rows[0].r)continue;
  let ddl='';
  const cols=t.columns.map(col=>{
   let def=col.default;
   if(def?.includes('nextval(')){const seq=q(t.schema)+'.'+q(t.name+'_'+col.name+'_clone');ddl+='CREATE SEQUENCE '+seq+';';def="nextval('"+seq+"')";}
   return q(col.name)+' '+col.type+(col.nullable?'':' NOT NULL')+(def?' DEFAULT '+def:'');
  });
  ddl+='CREATE TABLE '+q(t.schema)+'.'+q(t.name)+' ('+[...cols,...(t.constraints||[])].join(',')+');';
  await c.query(ddl);
  for(const index of t.indexes||[])await c.query(index);
 }
 for(const f of source.functions)await c.query(f.definition);
 // Replace the three initial finance-trigger aliases with their real definitions.
 await c.query('DROP TRIGGER IF EXISTS tri_journal ON public.players; DROP TRIGGER IF EXISTS tri_stage ON public.players; DROP TRIGGER IF EXISTS tri_finalize ON public.gameplay_transfer_pending_changes');
 for(const t of inventory.triggers){
  await c.query('DROP TRIGGER IF EXISTS '+q(t.name)+' ON '+q(t.schema)+'.'+q(t.table));
  await c.query(t.ddl);
 }
 // The deferred ledger finalizer is on its own table, outside the catalog inventory.
 await c.query('CREATE CONSTRAINT TRIGGER tri_finalize AFTER INSERT ON public.gameplay_transfer_pending_changes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.finalize_gameplay_transfer_batch()');
 await c.query('COMMIT');
 const result={tables:source.tables.length,functions:source.functions.length,triggers:inventory.triggers.length};
 await writeFile('qualification.local/tri-towers/shared-clone-result.json',JSON.stringify(result));
 console.log(result);
}finally{await c.end();}
