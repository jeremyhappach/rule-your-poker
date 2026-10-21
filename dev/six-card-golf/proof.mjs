import {readFileSync as read} from 'node:fs';
import {candidate,connect,localContext,installLocalReference} from './database.mjs';
const c=await connect(localContext().database);
try {
 await c.query('BEGIN');
 await c.query("SET LOCAL statement_timeout='60s'");
 await installLocalReference(c);
 await c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 await c.query(candidate());
 await c.query("SET LOCAL statement_timeout='60s'");
 const recoveryOnly=process.argv.includes('--recovery'),mixedOnly=process.argv.includes('--mixed'),qualificationOnly=process.argv.includes('--qualification');
 if(recoveryOnly){const source=read('supabase/six-card-golf/proof.sql','utf8');await c.query(source.slice(0,source.indexOf('DO $')));await c.query('UPDATE private.golf_release SET enabled=true,admission_enabled=true');}
 if(mixedOnly){const source=read('supabase/six-card-golf/proof.sql','utf8');await c.query(source.slice(0,source.indexOf('DO $')));await c.query('UPDATE private.golf_release SET enabled=true,admission_enabled=true');}
 if(qualificationOnly){const source=read('supabase/six-card-golf/proof.sql','utf8');await c.query(source.slice(0,source.indexOf('DO $')));}
 console.log('Canonical automatic-play reference', (await c.query("SELECT md5(replace(pg_get_functiondef('public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)'::regprocedure),chr(13)||chr(10),chr(10))) hash")).rows[0]);
 for(const name of qualificationOnly?['core-proof','qualification-proof']:mixedOnly?['core-proof','mixed-proof']:recoveryOnly?['core-proof','recovery-proof']:['core-proof','proof','financial-proof','recovery-proof','mixed-proof','qualification-proof']) {
  await c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
  const result=await c.query(read(`supabase/six-card-golf/${name}.sql`,'utf8'));
  console.log((Array.isArray(result)?result:[result]).flatMap(r=>r.rows));
 }
 await c.query('ROLLBACK');
} catch(e) {
 console.error(e.message,e.where,e.position,e.internalQuery);
 await c.query('ROLLBACK');process.exitCode=1;
} finally {await c.end();}
