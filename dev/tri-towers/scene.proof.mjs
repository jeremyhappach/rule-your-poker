import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {connect} from './bots-fixture.mjs';
const {database}=JSON.parse(readFileSync('qualification.local/tri-towers/scene-context.json','utf8')),db=await connect(database);
try{
 await db.query('BEGIN');await db.query("UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL");await db.query(readFileSync('dev/tri-towers/scene.proof.sql','utf8'));
 await db.query(readFileSync('dev/tri-towers/scene.compatibility.sql','utf8'));
 await db.query('ROLLBACK');console.log('PASS authoritative intro boundaries, unchanged scoring/deal, v2/v3 combined ranks/PB and frozen results');
 await db.query(readFileSync('supabase/tri-towers/activate-scene.sql','utf8'));
}finally{await db.end();}
let source=readFileSync('dev/tri-towers/v2.proof.mjs','utf8');
source=source.slice(0,source.indexOf('try{'))+'try{\n'+source.slice(source.indexOf(' for(const [name,scores,deltas] of'));
source=source.replace('v2-context.json','scene-context.json').replace('v2-proof.json','scene-financial-proof.json');
const result=spawnSync(process.execPath,['--input-type=module','-'],{input:source.replace("'./bots-fixture.mjs'","'./dev/tri-towers/bots-fixture.mjs'"),encoding:'utf8',stdio:['pipe','inherit','inherit']});process.exitCode=result.status;
