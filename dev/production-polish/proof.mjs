import {readFileSync as read} from 'node:fs';
import {connect} from './local.mjs';
const {database}=JSON.parse(read('.polish-authority/context.json','utf8'));
const db=await connect(database);
try{
 await db.query('BEGIN');
 // The disposable clone has no scheduler. Supply its ordinary healthy heartbeat;
 // all admission, settlement and accounting triggers remain enabled.
 await db.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 await db.query("UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()");
 for(const name of ['proof','async-proof']){const result=await db.query(read('supabase/optional-bonus/'+name+'.sql','utf8'));console.log(result.at(-1).rows);}
}finally{await db.query('ROLLBACK');await db.end();}
