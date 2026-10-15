import {readFile} from 'node:fs/promises';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database:'postgres'});await c.connect();
try{
 const source=JSON.parse(await readFile('qualification.local/tri-towers/access-source-final.json','utf8'));
 const keys=JSON.parse(await readFile('qualification.local/tri-towers/foreign-source.json','utf8'));
 await c.query('BEGIN; SET LOCAL check_function_bodies=off');
 for(const index of source.indexes)if(!(await c.query('SELECT to_regclass($1) r',['public.'+index.name])).rows[0].r)await c.query(index.definition);
 for(const [i,key]of keys.entries()){
  // Synthetic loopback accounts substitute auth.users; all gameplay FKs are real.
  if(key.definition.includes('auth.users'))continue;
  if(!(await c.query('SELECT 1 FROM pg_constraint WHERE conname=$1',['tri_fixture_fk_'+i])).rowCount)await c.query('ALTER TABLE public.'+key.table+' ADD CONSTRAINT tri_fixture_fk_'+i+' '+key.definition);
 }
 for(const f of source.functions)await c.query(f.definition);
 await c.query('ALTER TABLE public.players ENABLE ROW LEVEL SECURITY');
 for(const p of source.policies){
  const name='"'+p.policyname.replaceAll('"','""')+'"';
  await c.query('DROP POLICY IF EXISTS '+name+' ON public.players');
  await c.query('CREATE POLICY '+name+' ON public.players AS '+p.permissive+' FOR '+p.cmd+' TO '+p.roles.join(',')+(p.qual?' USING('+p.qual+')':'')+(p.with_check?' WITH CHECK('+p.with_check+')':''));
 }
 await c.query('COMMIT');console.log('PASS cloned unique indexes, gameplay foreign keys and deployed player RLS');
}finally{await c.end();}
