import {readFileSync as read} from 'node:fs';
import {connect} from './database.mjs';
const database='battle31_launch_'+Date.now();let c=await connect('postgres');await c.query('CREATE DATABASE '+database+' TEMPLATE battle31_package_1792613350794');await c.end();
c=await connect(database);try{
await c.query(read('dev/battle31/evidence/launch-pause-preimage.sql','utf8'));
await c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
console.log(JSON.stringify({database,result:(await c.query(read('qualification.local/battle31/launch-candidate.sql','utf8'))).at(-1).rows}));
}finally{await c.end();}
