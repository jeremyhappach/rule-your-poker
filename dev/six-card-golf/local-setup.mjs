import {writeFileSync as write} from 'node:fs';
import {connect,localContext,candidate,installLocalReference} from './database.mjs';
const database='golf_ui_'+Date.now(),admin=await connect('postgres');
await admin.query('CREATE DATABASE '+database+' TEMPLATE '+localContext().database);await admin.end();
const c=await connect(database);
try {
 await c.query('BEGIN');await installLocalReference(c);
 await c.query(candidate());
 await c.query("UPDATE private.golf_release SET enabled=true,admission_enabled=true");
 await c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 await c.query('COMMIT');write('qualification.local/six-card-golf/ui-context.json',JSON.stringify({database}));
 console.log('Local Golf authority: '+database);
}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
