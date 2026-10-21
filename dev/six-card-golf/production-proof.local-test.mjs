// Negative service gate and positive containment checks on the existing local
// PostgreSQL reference only. Never seeds health, installs authority or commits.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {buildProofs,migrationPath} from './production-proof.mjs';
const names=['core-proof','proof','financial-proof','recovery-proof','mixed-proof','qualification-proof'];
const {database}=JSON.parse(readFileSync('qualification.local/six-card-golf/context.json','utf8'));
if(!/^golf_\d+$/.test(database))throw Error('Unexpected local reference database');
const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});
const [unit]=buildProofs({migration:readFileSync(migrationPath,'utf8'),fixtures:Object.fromEntries(names.map(n=>[n,readFileSync(`supabase/six-card-golf/${n}.sql`,'utf8')]))});
await c.connect();
try{
 assert.equal((await c.query("SELECT to_regclass('private.golf_release') v")).rows[0].v,null);
 await assert.rejects(c.query(unit.sql),/live_services_required/);await c.query('ROLLBACK');
 assert.equal((await c.query("SELECT to_regclass('private.golf_release') v")).rows[0].v,null);
 await c.query('BEGIN');
 const start=unit.sql.indexOf('CREATE TEMP TABLE golf_existing');
 const end=unit.sql.indexOf('DO $requirements$',start);
 assert.ok(start>0&&end>start);
 await c.query(unit.sql.slice(start,end));
 const evidenceStart=unit.sql.indexOf("SELECT jsonb_build_object('unit'");
 const evidenceEnd=unit.sql.indexOf('\nROLLBACK;',evidenceStart);
 const parsed=(await c.query(unit.sql.slice(evidenceStart,evidenceEnd))).rows[0].candidate_evidence;
 assert.match(parsed.catalog_fingerprint,/^[a-f0-9]{32}$/);
 await c.query('INSERT INTO auth.users(id) VALUES(pg_temp.golf_fixture_uuid())');
 await c.query('SELECT pg_temp.golf_unchanged()');
 await c.query("INSERT INTO pg_temp.golf_existing SELECT 'auth.users',md5(to_jsonb(x)::text) FROM auth.users x WHERE id::text LIKE $1",[unit.namespace+'%']);
 await c.query('SAVEPOINT changed_record');
 await c.query('DELETE FROM auth.users WHERE id::text LIKE $1',[unit.namespace+'%']);
 await assert.rejects(c.query('SELECT pg_temp.golf_unchanged()'),/existing_or_unscoped_records_changed/);
 await c.query('ROLLBACK TO SAVEPOINT changed_record');
 await c.query('SAVEPOINT bad_scope');
 await c.query('INSERT INTO auth.users(id) VALUES(gen_random_uuid())');
 await assert.rejects(c.query('SELECT pg_temp.golf_unchanged()'),/existing_or_unscoped_records_changed/);
 await c.query('ROLLBACK TO SAVEPOINT bad_scope');
 await c.query('SELECT pg_temp.golf_unchanged()');
 await c.query('ROLLBACK');
 const rows=(await c.query('SELECT count(*)::int n FROM auth.users WHERE id::text LIKE $1',[unit.namespace+'%'])).rows[0];
 assert.equal(rows.n,0);
 console.log('PASS local negative live-service gate, real SQL containment, recorded-row deletion rejection, out-of-scope rejection and rollback. No scheduler health fabricated; positive production qualification remains unexecuted.');
}finally{await c.query('ROLLBACK');await c.end();}
