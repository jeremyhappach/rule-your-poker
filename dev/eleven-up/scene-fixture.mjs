// Explicit synthetic all-clear fixture for the loopback preview only.
import {connect,context} from './database.mjs';
const {database}=await context();if(!database.startsWith('eleven_up_'))throw Error('Disposable 11 Up clone required');
const dealer=process.argv[2];if(!/^[a-f0-9-]{36}$/.test(dealer??''))throw Error('Pass a synthetic preview dealer-game UUID');
const c=await connect(database);
try{await c.query('BEGIN');const m=(await c.query('SELECT * FROM private.eleven_up_matches WHERE dealer_game_id=$1 FOR UPDATE',[dealer])).rows[0];if(!m||m.settlement||m.finished)throw Error('Active synthetic preview required');
 const slots=Array(22).fill(null);slots[8]=16;slots[17]=20;slots[21]=32;
 await c.query("UPDATE private.eleven_up_matches SET state=state||$2::jsonb,revision=revision+1 WHERE dealer_game_id=$1",[dealer,{slots,current:48,cursor:52,groups:0,score:0,scoreBefore:0,phase:'playing',startedAt:Date.now(),deadline:Date.now()+120000}]);await c.query('COMMIT');console.log('Synthetic clear fixture ready: select 2, 3 and 6.');
}finally{await c.query('ROLLBACK');await c.end();}
