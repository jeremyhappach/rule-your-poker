import {readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
import {candidate,connect,localContext,installLocalReference} from './database.mjs';
import {guard,publication} from './release.mjs';
const database='golf_installed_'+Date.now(),admin=await connect('postgres');
await admin.query('CREATE DATABASE '+database+' TEMPLATE '+localContext().database);await admin.end();
const c=await connect(database);
try{
 // The deployable script fails closed in this deliberately incomplete host.
 await c.query('BEGIN');
 await assert.rejects(c.query(read('qualification.local/six-card-golf/migration.sql','utf8')),/pg_cron_required/);
 await c.query('ROLLBACK');
 assert.equal((await c.query("SELECT to_regclass('private.golf_matches') v")).rows[0].v,null);
 // Install actual game authority and publication membership locally. No fake
 // cron extension, scheduler receipt, or logical replication claim is created.
 await c.query('BEGIN');await installLocalReference(c);await c.query(guard);
 await c.query(candidate());await c.query('CREATE PUBLICATION supabase_realtime');await c.query(publication);await c.query('COMMIT');
 assert.deepEqual((await c.query('SELECT enabled,admission_enabled FROM private.golf_release')).rows[0],{enabled:false,admission_enabled:false});
 await c.query(read('qualification.local/six-card-golf/installed-proof.sql','utf8'));
 const proof=(await c.query("SELECT (SELECT NOT enabled AND NOT admission_enabled FROM private.golf_release) closed,(SELECT count(*)::int FROM private.golf_matches) matches,(SELECT count(*)::int FROM public.golf_revisions) revisions,EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='golf_revisions') published,NOT has_table_privilege('authenticated','private.golf_matches','SELECT') private_hidden")).rows[0];
 assert.deepEqual(proof,{closed:true,matches:0,revisions:0,published:true,private_hidden:true});
 write('qualification.local/six-card-golf/installed-local.json',JSON.stringify({database,passed:true,proof,productionOnly:['pg_cron execution','logical Realtime delivery','deployed authority/privilege comparison','matching application publication'],productionApplied:false},null,2));
 console.log('PASS locally installed authority: full rollback suite, closed admission, zero synthetic matches/revisions, real publication membership and private-state denial. Cron and logical replication remain unproved.');
}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
