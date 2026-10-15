// Run only against the task's loopback PostgreSQL, never a Supabase URL.
import {readFile,writeFile} from 'node:fs/promises';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
const client=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database:'postgres'});
await client.connect();
try {
 const source=JSON.parse(await readFile('qualification.local/tri-towers/schema-source.json','utf8'));
 const definitions=JSON.parse(await readFile('qualification.local/tri-towers/finance-source.json','utf8'));
 const q=s=>'"'+s.replaceAll('"','""')+'"';
 let ddl=`CREATE SCHEMA private; CREATE SCHEMA auth; CREATE SCHEMA extensions;
 CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth,public TO authenticated;`;
 for(const e of source.enums)ddl+=`CREATE TYPE ${q(e.schema)}.${q(e.name)} AS ENUM (${e.values.map(v=>"'"+v.replaceAll("'","''")+"'").join(',')});`;
 ddl+=`CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;`;
 for(const table of source.tables){
  const columns=table.columns.map(c=>{
   let def=c.default;
   if(def?.includes('nextval(')){const seq=q(table.schema)+'.'+q(table.name+'_'+c.name+'_local');ddl+=`CREATE SEQUENCE ${seq};`;def=`nextval('${seq}')`;}
   return `${q(c.name)} ${c.type}${c.nullable?'':' NOT NULL'}${def?' DEFAULT '+def:''}`;
  });
  ddl+=`CREATE TABLE ${q(table.schema)}.${q(table.name)} (${[...columns,...(table.constraints||[])].join(',')});`;
  for(const index of table.indexes||[])ddl+=index+';';
 }
 ddl+=`GRANT SELECT ON public.players TO authenticated;`;
 ddl+=`CREATE TABLE public.system_settings(key text PRIMARY KEY,value jsonb);`;
 for(const def of definitions)ddl+=def.definition+';';
 ddl+=`CREATE TRIGGER tri_journal AFTER UPDATE OF chips ON public.players FOR EACH ROW EXECUTE FUNCTION public.journal_gameplay_player_chip_change();
 CREATE TRIGGER tri_stage BEFORE UPDATE OF chips ON public.players FOR EACH ROW EXECUTE FUNCTION public.stage_gameplay_player_transfer_cursor();
 CREATE CONSTRAINT TRIGGER tri_finalize AFTER INSERT ON public.gameplay_transfer_pending_changes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.finalize_gameplay_transfer_batch();`;
 await client.query('BEGIN');await client.query(ddl);
 await client.query(await readFile('supabase/tri-towers/authority.sql','utf8'));await client.query('COMMIT');
 await writeFile('qualification.local/tri-towers/local-schema-result.json',JSON.stringify({source:source.version,local:(await client.query('select version()')).rows[0].version,proof:'Candidate DDL installed locally'}));
 console.log('Candidate schema installed on isolated PostgreSQL. Run local-integration.mjs next.');
} finally {await client.end();}
