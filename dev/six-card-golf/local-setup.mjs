import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {connect,localContext,candidate} from './database.mjs';
const database='golf_ui_'+Date.now(),admin=await connect('postgres');
await admin.query('CREATE DATABASE '+database+' TEMPLATE '+localContext().database);await admin.end();
const c=await connect(database);
try {
 await c.query('BEGIN');await c.query(read('supabase/six-card-golf/local-reference.sql','utf8'));
 const pause=read('supabase/migrations/20261015212154_farkle_active_account_and_recovery_lock_order.sql','utf8');
 const begin=pause.indexOf('CREATE OR REPLACE FUNCTION public.set_game_paused(p_game_id uuid, p_paused boolean, p_expected_dealer_game_id uuid, p_expected_pause_version bigint)');
 await c.query(pause.slice(begin,pause.indexOf('$function$;',begin)+12));
 const auto=read('supabase/migrations/20261009231202_restore_all_human_auto_fold_pause.sql','utf8');
 await c.query(auto.slice(auto.indexOf('CREATE OR REPLACE FUNCTION private.pause_all_humans_auto_fold'),auto.indexOf('$guard$;')+8));
 await c.query(candidate());
 await c.query("UPDATE private.golf_release SET enabled=true,admission_enabled=true");
 await c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 await c.query('COMMIT');write('qualification.local/six-card-golf/ui-context.json',JSON.stringify({database}));
 console.log('Local Golf authority: '+database);
}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
