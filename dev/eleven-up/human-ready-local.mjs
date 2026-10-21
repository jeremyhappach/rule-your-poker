// Local-only qualification. Never reads credentials or accepts a remote host.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync as read,writeFileSync as write,mkdirSync,existsSync} from 'node:fs';
const require=createRequire(import.meta.url);
const pg=require('C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg');
const root='C:/Users/jerem/source/repos/rule-your-poker/';
export const connect=async(database)=>{if(database!=='postgres'&&!/^eleven_up_timeout_\d+$/.test(database))throw Error('Isolated local database only');const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await c.connect();return c;};
export const context=()=>JSON.parse(read('qualification.local/eleven-up-timeout/context.json','utf8'));
export const body=s=>s.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
if(process.argv[2]==='prepare'){
 const database=existsSync('qualification.local/eleven-up-timeout/context.json')?context().database:'eleven_up_timeout_'+Date.now(),c=await connect('postgres');
 if(!existsSync('qualification.local/eleven-up-timeout/context.json'))await c.query(`CREATE DATABASE "${database}" TEMPLATE "eleven_up_bots_1792536250433"`);await c.end();
 mkdirSync('qualification.local/eleven-up-timeout',{recursive:true});write('qualification.local/eleven-up-timeout/context.json',JSON.stringify({database}));
 const d=await connect(database);
 try{
  const full=JSON.parse(read(root+'qualification.local/farkle-full-stack/full-schema.json','utf8'));
  const current=read('supabase/migrations/20261015212154_farkle_active_account_and_recovery_lock_order.sql','utf8');
  for(const name of ['farkle_require_active_actor_v1','set_game_paused']){
   const schema=name.startsWith('farkle')?'private':'public';
   const start=current.indexOf('CREATE OR REPLACE FUNCTION '+schema+'.'+name+'('),end=current.indexOf('END $function$;',start);
   if(start<0||end<start)throw Error('Canonical source boundary missing');
   full.functions=full.functions.filter(f=>!f.signature.match(new RegExp('(?:^|\\.)'+name+'\\(')));
   full.functions.push({signature:schema+'.'+name+'(source)',definition:current.slice(start,end+15)});
  }
  const names=['set_game_paused','capture_recovery_context','restore_recovery_context','pause_all_humans_auto_fold','farkle_require_active_actor_v1','three_five_seven_hidden_round','shift_pause_timestamp'];
  await d.query('BEGIN');
  // Restore only the two candidate-patched owners from the preserved LOCAL
  // template before requalification, so iterative proofs exercise current SQL.
  const baseline=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database:'eleven_up_bots_1792536250433'});await baseline.connect();
  try{const definitions=(await baseline.query("select p.proname,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('eleven_up_action','eleven_up_snapshot')")).rows;write('qualification.local/eleven-up-timeout/baseline.json',JSON.stringify(definitions));for(const f of definitions)await d.query(f.definition);}finally{await baseline.end();}
  for(const name of names){
   const fs=full.functions.filter(f=>f.signature.match(new RegExp('(?:^|\\.)'+name+'\\(')));
   if(!fs.length)throw Error('Missing retained canonical definition: '+name);
   for(const f of fs){await d.query(f.definition);console.log('Restored exact retained definition',f.signature);}
  }
  const original=read('supabase/migrations/20261021002901_eleven_up_bots.sql');
  assert.equal(createHash('sha256').update(original).digest('hex'),'dcea1133d1df64b755b5c492ea8923d74bdea38ba050184f1463e5c9da22387d');
  const forward=read('supabase/migrations/20261021181947_eleven_up_human_ready.sql','utf8');
  assert.equal(forward,read('supabase/eleven-up/human-ready.sql','utf8'));
  const guardSql="select pg_get_functiondef('private.pause_all_humans_auto_fold(uuid)'::regprocedure) v";
  const defaultsSql='select to_jsonb(d) v from public.game_defaults d order by game_type';
  const guard=(await d.query(guardSql)).rows[0].v,defaults=(await d.query(defaultsSql)).rows;
  await d.query(body(original.toString()));
  await d.query(body(forward));
  const patched=(await d.query(guardSql)).rows[0].v;
  const boundary=/IF g.game_type='eleven-up' THEN\n -- eleven_up_ready_all_humans_v1\n[\s\S]*?ELSE\n (IF NOT enabled OR action<>'auto_fold' THEN RETURN false; END IF;)\nEND IF;/g;
  assert.equal([...patched.matchAll(boundary)].length,2);
  assert.equal(patched.replace(boundary,'$1'),guard,'Other-game gates, canonical count, locks and pause flow unchanged');
  assert.deepEqual((await d.query(defaultsSql)).rows,defaults,'No global/default policy changes');
  write('qualification.local/eleven-up-timeout/ordered-migrations.json',JSON.stringify({order:['20261021002901_eleven_up_bots.sql','20261021181947_eleven_up_human_ready.sql'],canonicalGuardPreservedExceptReadyPredicate:true,defaultsUnchanged:true,forwardSha256:createHash('sha256').update(forward).digest('hex')},null,2));
  await d.query('COMMIT');console.log({database});
 }catch(e){await d.query('ROLLBACK');throw e;}finally{await d.end();}
}
