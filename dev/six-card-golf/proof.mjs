import {readFileSync as read} from 'node:fs';
import {candidate,connect,localContext} from './database.mjs';
const c=await connect(localContext().database);
try {
 await c.query('BEGIN');
 await c.query("SET LOCAL statement_timeout='60s'");
 await c.query(read('supabase/six-card-golf/local-reference.sql','utf8'));
 // Match the deployed pause owner (hash 1fa2220c33734d1cf14c11f3eaef432b).
 // The older isolated template predates this overload; never replace production.
 const pauseReference=read('supabase/migrations/20261015212154_farkle_active_account_and_recovery_lock_order.sql','utf8');
 const pauseStart=pauseReference.indexOf('CREATE OR REPLACE FUNCTION public.set_game_paused(p_game_id uuid, p_paused boolean, p_expected_dealer_game_id uuid, p_expected_pause_version bigint)');
 const pauseEnd=pauseReference.indexOf('$function$;',pauseStart)+'$function$;'.length;
 if(pauseStart<0||pauseEnd<pauseStart)throw Error('Missing exact canonical pause reference');
 await c.query(pauseReference.slice(pauseStart,pauseEnd));
 const autoPause=read('supabase/migrations/20261009231202_restore_all_human_auto_fold_pause.sql','utf8');
 await c.query(autoPause.slice(autoPause.indexOf('CREATE OR REPLACE FUNCTION private.pause_all_humans_auto_fold'),autoPause.indexOf('$guard$;')+'$guard$;'.length));
 await c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 await c.query(candidate());
 await c.query("SET LOCAL statement_timeout='60s'");
 const recoveryOnly=process.argv.includes('--recovery');
 if(recoveryOnly){const source=read('supabase/six-card-golf/proof.sql','utf8');await c.query(source.slice(0,source.indexOf('DO $')));await c.query('UPDATE private.golf_release SET enabled=true,admission_enabled=true');}
 for(const name of recoveryOnly?['core-proof','recovery-proof']:['core-proof','proof','financial-proof','recovery-proof']) {
  await c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
  const result=await c.query(read(`supabase/six-card-golf/${name}.sql`,'utf8'));
  console.log((Array.isArray(result)?result:[result]).flatMap(r=>r.rows));
 }
 await c.query('ROLLBACK');
} catch(e) {
 console.error(e.message,e.where,e.position,e.internalQuery);
 await c.query('ROLLBACK');process.exitCode=1;
} finally {await c.end();}
