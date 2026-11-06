import {connect} from '../async-words/local.mjs';
import {readFileSync} from 'node:fs';
const db=await connect(process.argv[2]);
try{await db.query('BEGIN');await db.query("UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()");
 await db.query(readFileSync(process.argv[3],'utf8'));console.log('PASS',process.argv[3]);
}finally{await db.query('ROLLBACK');await db.end();}
