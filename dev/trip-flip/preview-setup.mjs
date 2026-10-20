import {readFileSync as read} from 'node:fs';
import {connect,candidate,localContext} from './database.mjs';
const c=await connect(localContext().database);
try{
 await c.query('BEGIN');
 if(!(await c.query("SELECT to_regclass('private.take_two_matches') present")).rows[0].present)await c.query(['rules','multiplayer','arcade','bots','recovery','registration'].map(n=>read('supabase/take-two/'+n+'.sql','utf8')).join('\n'));
 if(!(await c.query("SELECT to_regclass('private.trip_flip_matches') present")).rows[0].present)await c.query(candidate());
 await c.query("UPDATE private.trip_flip_release SET enabled=true,admission_enabled=true;UPDATE private.arcade_rulesets SET enabled=true WHERE id='trip-flip/1';UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL");
 await c.query('COMMIT');console.log('Isolated local candidate installed for browser/concurrency qualification');
}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
