import {connect,databaseName} from './local.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
const db=await connect(databaseName()),checks=[];
try{
 await db.query('BEGIN');
 await db.query('ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_app_meta_data jsonb');
 const golf=read('supabase/six-card-golf/rules.sql','utf8');
 await db.query(golf.slice(golf.indexOf('CREATE OR REPLACE FUNCTION private.golf_points'),golf.indexOf('CREATE OR REPLACE FUNCTION private.golf_integrity')));
 // Reconstruct only missing Mega authority in the disposable old async clone.
 if(!(await db.query("select to_regclass('private.arcade_mega_configs') present")).rows[0].present)await db.query(read('supabase/mega-card-golf/candidate.sql','utf8'));
 await db.query("INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('mega-card-golf/4','mega-card-golf','{\"engine\":\"mega-card-golf/4\",\"opening\":\"sequential\",\"finalDraw\":\"stand-pat-or-replace\",\"standPat\":\"playable-hole\",\"score\":\"canonical-golf\"}',true) ON CONFLICT(id) DO UPDATE SET enabled=true");
 // Exact read-only captured owner definitions; this changes no hosted state.
 for(const f of [...JSON.parse(read('dev/mega-card-golf/competition/installed-functions.json')),...JSON.parse(read('dev/mega-card-golf/competition/installed-lifecycle.json'))])await db.query(f.definition);
 try{await db.query(read('supabase/mega-card-golf/competition.candidate.sql','utf8'));}catch(e){const sql=read('supabase/mega-card-golf/competition.candidate.sql','utf8');console.error('candidate offset',e.position,sql.slice(Math.max(0,Number(e.position)-200),Number(e.position)+150));throw e;}
 checks.push('closed candidate compiles against captured owner definitions');
 const gates=(await db.query('select live_enabled,async_enabled from private.mega_competition_release')).rows[0];assert.deepEqual(gates,{live_enabled:false,async_enabled:false});
 checks.push('live and async admission default closed');
 const grants=(await db.query("select has_function_privilege('authenticated','public.mega_live_commit(uuid,uuid,bigint,jsonb,uuid,text,uuid)','execute') can_commit,has_table_privilege('authenticated','private.mega_live_matches','select') can_read")).rows[0];assert.deepEqual(grants,{can_commit:false,can_read:false});checks.push('browser cannot read private decks or submit state');
 await db.query(read('supabase/mega-card-golf/competition-proof.sql','utf8'));
 checks.push('configuration, immutable outcomes, winner/tie and canonical financial rollback matrix');
 await db.query('ROLLBACK');
 assert.equal((await db.query("select to_regclass('private.mega_live_matches') present")).rows[0].present,null);
 checks.push('candidate and synthetic data rolled back');
 write('qualification.local/mega-competition/proof.json',JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}catch(e){await db.query('ROLLBACK');console.error(e.message,e.where??'',e.detail??'');write('qualification.local/mega-competition/proof.json',JSON.stringify({passed:false,checks,error:e.message,where:e.where},null,2));process.exitCode=1;}finally{await db.end();}
