import {connect} from './bots-fixture.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const base=JSON.parse(readFileSync('qualification.local/tri-towers/solo-context.json','utf8')).database;
const database='tri_cartoon_'+Date.now(),root=await connect('postgres');
await root.query('CREATE DATABASE '+database+' TEMPLATE '+base);await root.end();
writeFileSync('qualification.local/tri-towers/cartoon-context.json',JSON.stringify({database}));
const db=await connect(database),sql=readFileSync('supabase/tri-towers/presentation.sql','utf8');
try{
 await db.query(readFileSync('supabase/migrations/20261017001447_solo_tri_towers.sql','utf8'));
 await db.query('UPDATE private.tri_towers_release SET enabled=true,admission_enabled=true');
 const hashes=async()=>(await db.query("SELECT oid::regprocedure::text signature,md5(pg_get_functiondef(oid)) hash FROM pg_proc WHERE pronamespace IN ('private'::regnamespace,'public'::regnamespace) AND prokind='f' ORDER BY 1")).rows;
 const before=await hashes();await db.query('BEGIN');await db.query(sql);
 await db.query(readFileSync('dev/tri-towers/cartoon.proof.sql','utf8'));await db.query(readFileSync('dev/arcade/tri.proof.sql','utf8'));await db.query('ROLLBACK');
 assert.deepEqual(await hashes(),before);console.log('PASS complete Arcade candidate rollback proof, zero persisted changes');
 await db.query(sql);
 const after=await hashes();const changes=before.filter(f=>after.find(x=>x.signature===f.signature)?.hash!==f.hash);
 assert.deepEqual(changes.map(x=>x.signature),['private.arcade_tri_projection(private.arcade_runs,bigint)']);
 await db.query('BEGIN');await db.query(readFileSync('dev/tri-towers/cartoon.proof.sql','utf8'));await db.query(readFileSync('dev/arcade/tri.proof.sql','utf8'));await db.query('ROLLBACK');
 console.log('PASS unchanged gameplay/financial functions and installed Arcade proof');
}finally{await db.end();}
const source=readFileSync('dev/tri-towers/v2.proof.mjs','utf8').replaceAll("'./bots-fixture.mjs'","'./dev/tri-towers/bots-fixture.mjs'").replaceAll('qualification.local/tri-towers/v2-context.json','qualification.local/tri-towers/cartoon-context.json').replaceAll('qualification.local/tri-towers/v2-proof.json','qualification.local/tri-towers/cartoon-finance-proof.json');
const result=spawnSync(process.execPath,['--input-type=module','-'],{input:source,encoding:'utf8',stdio:['pipe','pipe','pipe']});
process.stdout.write(result.stdout);process.stderr.write(result.stderr);assert.equal(result.status,0);
