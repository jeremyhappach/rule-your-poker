import pg from '../../../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {readFileSync,writeFileSync} from 'node:fs';
const dir='qualification.local/farkle-audit-20261015/';
const read=f=>JSON.parse(readFileSync(dir+f+'.json'));
const cat=read('deployed-catalog'),s=read('deployed-structure');
const opts={host:'127.0.0.1',port:55439,user:'tri_test',database:'postgres'};
const admin=new pg.Client(opts);await admin.connect();
const database='farkle_audit_empty_'+Date.now();await admin.query('CREATE DATABASE '+database+' TEMPLATE template0');await admin.end();
writeFileSync(dir+'local-db.json',JSON.stringify({...opts,database}));
const c=new pg.Client({...opts,database});await c.connect();
const qi=x=>'"'+x.replaceAll('"','""')+'"',lit=x=>"'"+x.replaceAll("'","''")+"'";
const result={database,errors:[]};
const run=async(label,sql)=>{try{await c.query(sql);}catch(e){result.errors.push({label,error:e.message});}};
await c.query('CREATE SCHEMA private; CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; SET check_function_bodies=off');
for(const e of s.enums)await c.query('CREATE TYPE '+qi(e.schema)+'.'+qi(e.name)+' AS ENUM ('+e.labels.map(lit).join(',')+')');
for(const seq of s.sequences??[])await c.query('CREATE SEQUENCE '+qi(seq.schema)+'.'+qi(seq.name));
const tables=[...new Set(s.columns.map(x=>x.schema+'.'+x.table))];
for(const t of tables){const cols=s.columns.filter(x=>x.schema+'.'+x.table===t);await run(t,'CREATE TABLE '+t+' ('+cols.map(x=>qi(x.name)+' '+x.type+(x.generated?' GENERATED ALWAYS AS ('+x.default+') STORED':x.default?' DEFAULT '+x.default:'')+(x.notnull?' NOT NULL':'')).join(',')+')');}
await c.query('ALTER TABLE auth.users ADD PRIMARY KEY (id)');
for(const x of cat.constraints.filter(x=>!x.definition.startsWith('FOREIGN')&&x.definition!=='TRIGGER DEFERRABLE INITIALLY DEFERRED'))await run(x.name,'ALTER TABLE '+x.table+' ADD CONSTRAINT '+qi(x.name)+' '+x.definition);
for(const x of cat.indexes)if(!(await c.query('select to_regclass($1) r',[x.schemaname+'.'+x.indexname])).rows[0].r)await run(x.indexname,x.indexdef);
for(const x of cat.constraints.filter(x=>x.definition.startsWith('FOREIGN')))await run(x.name,'ALTER TABLE '+x.table+' ADD CONSTRAINT '+qi(x.name)+' '+x.definition);
const files=['deployed-functions','deployed-shared-0','deployed-shared-1','deployed-deps-1','deployed-deps-2','deployed-deps-3'];
const funcs=[...new Map(files.flatMap(read).map(f=>[f.signature,f])).values()];
for(const f of funcs)await run(f.signature,f.definition);
for(const f of funcs){
 const object=f.definition.startsWith('CREATE OR REPLACE PROCEDURE')?'PROCEDURE':'FUNCTION';
 await run('acl '+f.signature,'REVOKE ALL ON '+object+' '+f.signature+' FROM PUBLIC,anon,authenticated,service_role');
 for(const role of ['anon','authenticated','service_role'])if((f.acl??'').includes(role+'=X/'))await run('grant '+f.signature,'GRANT EXECUTE ON '+object+' '+f.signature+' TO '+role);
 if(!f.acl||f.acl.includes('{=X/')||f.acl.includes(',=X/'))await run('public '+f.signature,'GRANT EXECUTE ON '+object+' '+f.signature+' TO PUBLIC');
}
for(const t of cat.triggers)await run('trigger '+t.name,t.definition);
for(const t of cat.tables){
 const table=t.schema+'.'+t.name;
 if(t.rls)await c.query('ALTER TABLE '+table+' ENABLE ROW LEVEL SECURITY');
 for(const role of ['anon','authenticated','service_role']){
  const acl=t.acl?.match(new RegExp('(?:[,{])'+role+'=([^/]+)'))?.[1]??'';
  const priv={r:'SELECT',a:'INSERT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER'};
  const grants=[...acl].filter(x=>priv[x]).map(x=>priv[x]);if(grants.length)await c.query('GRANT '+grants.join(',')+' ON '+table+' TO '+role);
 }
 for(const p of cat.policies.filter(p=>p.schemaname===t.schema&&p.tablename===t.name))await run('policy '+p.policyname,'CREATE POLICY '+qi(p.policyname)+' ON '+table+' AS '+p.permissive+' FOR '+p.cmd+' TO '+p.roles.join(',')+(p.qual?' USING ('+p.qual+')':'')+(p.with_check?' WITH CHECK ('+p.with_check+')':''));
}
await c.query('GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role');
await c.query('GRANT USAGE ON SCHEMA private TO service_role');
async function insert(table,obj){if(!obj)return;const keys=Object.keys(obj);await c.query('INSERT INTO '+table+'('+keys.map(qi).join(',')+') VALUES('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',keys.map(k=>obj[k]));}
await insert('private.farkle_release',cat.release);await insert('private.farkle_postgame_control_v2',cat.postgame_control);await insert('public.game_defaults',cat.defaults);await insert('private.game_timer_cutover',s.cutover);
await c.query("INSERT INTO private.game_recovery_dispatch_state(singleton,last_completed_at,last_outcome) VALUES(true,clock_timestamp(),'completed')");
result.counts=(await c.query("select (select count(*) from pg_trigger where not tgisinternal) triggers,(select count(*) from pg_constraint where connamespace in ('public'::regnamespace,'private'::regnamespace)) constraints")).rows;
writeFileSync(dir+'empty-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await c.end();
