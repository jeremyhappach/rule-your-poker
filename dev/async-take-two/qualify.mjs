import {connect,database,dir} from './local.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
const db=await connect(database()),candidate=read('supabase/delayed/take-two.candidate.sql','utf8');
try{
 await db.query(read('supabase/take-two/rules.sql','utf8'));
 if(!(await db.query("SELECT to_regclass('private.mega_competition_release') present")).rows[0].present){
  await db.query('ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_app_meta_data jsonb');
  const golf=read('supabase/six-card-golf/rules.sql','utf8');
  await db.query(golf.slice(golf.indexOf('CREATE OR REPLACE FUNCTION private.golf_points'),golf.indexOf('CREATE OR REPLACE FUNCTION private.golf_integrity')));
  if(!(await db.query("SELECT to_regclass('private.arcade_mega_configs') present")).rows[0].present)await db.query(read('supabase/mega-card-golf/candidate.sql','utf8'));
  for(const f of [...JSON.parse(read('dev/mega-card-golf/competition/installed-functions.json')),...JSON.parse(read('dev/mega-card-golf/competition/installed-lifecycle.json'))])await db.query(f.definition);
  await db.query(read('supabase/mega-card-golf/competition.candidate.sql','utf8'));
 }
 const baseline=JSON.parse(read('dev/async-take-two/preimage.json'));
 for(const f of baseline.filter(f=>['delayed_create','delayed_respond','delayed_load','delayed_commit','delayed_capabilities','delayed_reviews','delayed_review_begin','delayed_review_ack','delayed_review_board','delayed_actor','take_two_board_deal','take_two_board_reduce','take_two_board_finish','take_two_visible','take_two_rules'].includes(f.name))){
  const current=(await db.query("SELECT md5(replace(pg_get_functiondef($1::regprocedure),chr(13),'')) hash",[f.signature])).rows[0].hash;
  if(current!==f.hash)await db.query(f.definition);
 }
 // The disposable local clone has no production scheduler.
 await db.query("UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp();UPDATE private.delayed_release SET admission_enabled=true,real_qualified=true;UPDATE private.delayed_recovery_state SET enabled=true;");
 await db.query('BEGIN');
 await db.query(candidate);
 await db.query('UPDATE private.delayed_take_two_release SET enabled=false');
 await db.query(read('supabase/delayed/take-two-parity-proof.sql','utf8'));
 await db.query(read('supabase/delayed/take-two-proof.sql','utf8'));
 const financial=read('supabase/delayed/take-two-financial-proof.sql','utf8');
 const result=await db.query(financial);
 await db.query('ROLLBACK');
 write(dir+'/local-financial.json',JSON.stringify({passed:true,results:(Array.isArray(result)?result:[result]).flatMap(r=>r.rows??[]),rollback:true},null,2));
 await db.query(candidate);
 console.log('PASS candidate rules/privacy and extended canonical financial rollback proof; installed in disposable clone only.');
}catch(e){await db.query('ROLLBACK');console.error(e.message,e.where??'',e.position??'',e.stack);process.exitCode=1;}finally{await db.end();}
