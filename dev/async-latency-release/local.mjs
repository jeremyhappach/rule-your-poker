import {connect} from '../async-words/local.mjs';
import {readFileSync,readdirSync} from 'node:fs';
const root=await connect('postgres');
const database='async_latency_'+Date.now();
try {await root.query('CREATE DATABASE '+database+' TEMPLATE async_tri_step_1793921264326');} finally {await root.end();}
const db=await connect(database);
try{
 for(const suffix of ['async_words_read_only_inspection','delayed_board_action','async_words_play_clock']){
  const file=readdirSync('supabase/migrations').find(name=>name.endsWith('_'+suffix+'.sql'));
  await db.query(readFileSync(file?'supabase/migrations/'+file:'supabase/delayed/words-play-clock.sql','utf8'));
 }
 await db.query("UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()");
 console.log(database);
} finally {await db.end();}
