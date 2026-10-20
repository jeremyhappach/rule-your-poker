import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {connect,candidate,localContext} from './database.mjs';
const c=await connect(localContext().database);
try{
 await c.query('BEGIN');
 if(!(await c.query("SELECT to_regclass('private.take_two_matches') present")).rows[0].present)await c.query(['rules','multiplayer','arcade','bots','recovery','registration'].map(n=>read('supabase/take-two/'+n+'.sql','utf8')).join('\n'));
 // The isolated clone has no scheduler; refresh only its local health fixture.
 await c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 if(!(await c.query("SELECT to_regclass('private.trip_flip_matches') present")).rows[0].present)await c.query(candidate());
 const r=await c.query(['proof','core-proof','bot-pause-proof'].map(n=>read('supabase/trip-flip/'+n+'.sql','utf8')).join('\n'));
 console.log(r.filter(x=>x.rows.length).flatMap(x=>x.rows));await c.query('ROLLBACK');
 write('qualification.local/trip-flip/proof.json',JSON.stringify({passed:true,at:new Date().toISOString()}));
}catch(e){console.error(e.message,e.where,e.position,e.internalQuery);await c.query('ROLLBACK');process.exitCode=1;}finally{await c.end();}
