import {c,dir} from './helpers.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const read=f=>JSON.parse(readFileSync(dir+f+'.json'));
try {
 const source=[...new Map(['deployed-functions','deployed-shared-0','deployed-shared-1','deployed-deps-1','deployed-deps-2','deployed-deps-3'].flatMap(read).map(f=>[f.signature,f])).values()];
 const production=read('fresh-production-hashes'),patches=read('candidate-patches');
 const baselineDrift=source.filter(f=>production.find(x=>x.signature===f.signature)?.hash!==f.hash);
 assert.deepEqual(baselineDrift,[]);
 const functionChanges=[];
 for(const f of source){const now=(await c.query('select md5(pg_get_functiondef($1::regprocedure)) hash,proacl::text acl from pg_proc where oid=$1::regprocedure',[f.signature])).rows[0];
  if(now.hash!==f.hash)functionChanges.push({signature:f.signature,original:f.hash,candidate:now.hash});
  for(const role of ['anon','authenticated','service_role']){const expected=(f.acl??'').includes(role+'=X/')||!f.acl||f.acl.includes('{=X/')||f.acl.includes(',=X/');assert.equal((await c.query('select has_function_privilege($1,$2,\'execute\') ok',[role,f.signature])).rows[0].ok,expected,f.signature+' '+role);}
 }
 assert.deepEqual(functionChanges.map(f=>f.signature).sort(),patches.map(f=>f.signature).sort());
 const cat=read('deployed-catalog');
 const checks={constraints:['select conrelid::regclass::text as table,conname name,pg_get_constraintdef(oid) definition,convalidated validated from pg_constraint where connamespace in (\'public\'::regnamespace,\'private\'::regnamespace)',x=>x.table+'|'+x.name+'|'+x.definition+'|'+x.validated],triggers:['select tgrelid::regclass::text as table,tgname name,pg_get_triggerdef(oid) definition,tgenabled enabled from pg_trigger where not tgisinternal',x=>x.table+'|'+x.name+'|'+x.definition+'|'+x.enabled],indexes:["select * from pg_indexes where schemaname in ('public','private')",x=>x.schemaname+'|'+x.indexname+'|'+x.indexdef]};
 const schema={};for(const [name,[sql,key]] of Object.entries(checks)){const rows=(await c.query(sql)).rows;assert.deepEqual(cat[name].filter(x=>!rows.some(y=>key(x)===key(y))),[]);schema[name]=cat[name].length;}
 for(const g of read('column-grants').filter(g=>['anon','authenticated','service_role'].includes(g.role)))assert.equal((await c.query('select has_column_privilege($1,$2,$3,$4) ok',[g.role,g.schema+'.'+g.table,g.column,g.privilege])).rows[0].ok,true);
 const evidence={baselineFunctions:source.length,productionDefinitionDrift:0,functionChanges,schema,columnGrants:read('column-grants').length,existingRoutinePrivilegesUnchanged:true};
 writeFileSync(dir+'candidate-metadata-proof.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await c.end();}
