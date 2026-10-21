import {readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
import {connect,context} from './bots-database.mjs';
import {registeredSql as migrationSql,hash} from './bots-release-package.mjs';
const proof=JSON.parse(read('qualification.local/eleven-up-bots/release-proof.json','utf8'));
assert.equal(proof.migrationSha256,hash(migrationSql()));
const c=await connect(context().database);
// The release bundle deliberately canonicalizes Windows CRLF to LF.
const definitions=async()=>(await c.query("select jsonb_object_agg(p.oid::regprocedure::text,md5(replace(pg_get_functiondef(p.oid),chr(13),''))) v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.prokind='f'")).rows[0].v;
try{
 const before=await definitions();
 await c.query(migrationSql());
 const verify=(await c.query(read('supabase/eleven-up/release-verify.sql','utf8'))).rows[0].eleven_up_bot_release_verification;assert(Object.values(verify).every(v=>v===true));
 const installed=await definitions();assert.deepEqual(installed,before);
 await c.query(migrationSql());assert.deepEqual(await definitions(),installed);
 await c.query(read('supabase/eleven-up/rollback-bot-admission.sql','utf8'));
 const closed=(await c.query("select pg_get_functiondef('public.eleven_up_configure(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure) config,pg_get_functiondef('private.megatouch_begin(uuid,uuid)'::regprocedure) consent")).rows[0];
 assert(closed.config.includes('eleven_up:bots_not_supported'));assert(closed.consent.includes('eleven_up:bots_not_supported'));assert(!closed.consent.includes('eleven_up:bots_fake_money_only'));
 const rolled=await definitions();
 // All changes are limited to the two admission functions; active-game authority stays installed.
 const changed=Object.keys(rolled).filter(k=>rolled[k]!==installed[k]);assert.equal(changed.length,2);
 await c.query(read('supabase/eleven-up/rollback-bot-admission.sql','utf8'));assert.deepEqual(await definitions(),rolled);
 await c.query(migrationSql());assert.deepEqual(await definitions(),installed);
 await c.query('begin');
 const shared=(await c.query("select pg_get_functiondef('private.megatouch_begin(uuid,uuid)'::regprocedure) v")).rows[0].v;
 await c.query(shared.replace('BEGIN','BEGIN\n -- unrelated adapter sentinel preserved by rollback\n'));
 await c.query(read('supabase/eleven-up/rollback-bot-admission.sql','utf8').replace('\nBEGIN;\n','\n').replace(/\nCOMMIT;\s*$/,'\n'));
 assert((await c.query("select pg_get_functiondef('private.megatouch_begin(uuid,uuid)'::regprocedure) v")).rows[0].v.includes('unrelated adapter sentinel preserved by rollback'));
 await c.query('rollback');assert.deepEqual(await definitions(),installed);
 const result={database:context().database,migrationSha256:hash(migrationSql()),verify,installation:'passed',idempotentInstall:'passed',idempotentAdmissionRollback:'passed',reapply:'passed',unrelatedDefinitions:'unchanged',laterSharedAdapterChange:'preserved by surgical rollback'};
 write('qualification.local/eleven-up-bots/release-install.json',JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{await c.end();}
