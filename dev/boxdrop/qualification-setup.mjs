import {readFileSync as read} from 'node:fs';
import {connect,candidate,localContext} from './database.mjs';
const c=await connect(localContext().database);
try{
 await c.query('BEGIN');
 for(const [game,table] of [['take-two','take_two'],['trip-flip','trip_flip']]){
  if(!(await c.query(`SELECT to_regclass('private.${table}_matches') present`)).rows[0].present)
   await c.query(['rules','multiplayer','arcade','bots','recovery','registration'].map(n=>read(`supabase/${game}/${n}.sql`,'utf8')).join('\n'));
 }
 if(!(await c.query("SELECT to_regclass('private.boxdrop_matches') present")).rows[0].present)await c.query(candidate());
 await c.query("UPDATE private.boxdrop_release SET enabled=true,admission_enabled=true;UPDATE private.arcade_rulesets SET enabled=true WHERE id='boxdrop/1';UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL");
 await c.query('COMMIT');console.log('Candidate installed only in isolated qualification database');
}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
