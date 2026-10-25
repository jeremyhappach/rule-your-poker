import {readFileSync as read,writeFileSync as write} from 'node:fs';import {connect} from './database.mjs';
const database='battle31_canonical_'+Date.now();let c=await connect('postgres');await c.query('CREATE DATABASE '+database+' TEMPLATE battle31_package_1792613350794');await c.end();c=await connect(database);
try{await c.query(read('dev/battle31/evidence/launch-pause-preimage.sql','utf8'));await c.query(read('supabase/migrations/20261025192500_battle31_play_money_launch.sql','utf8'));await c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
console.log((await c.query(read('qualification.local/battle31/canonical-candidate.sql','utf8'))).at(-1).rows);
await c.query(read('supabase/battle31/canonical-table.sql','utf8'));write('qualification.local/battle31/canonical-context.json',JSON.stringify({database}));console.log(database);
}finally{await c.end();}
