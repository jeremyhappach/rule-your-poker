import {connect} from '../async-words/local.mjs';
const db=await connect('async_reviews_1793308358890');
try{
 console.log(JSON.stringify((await db.query(`SELECT n.nspname,p.proname,md5(pg_get_functiondef(p.oid)) hash
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public') AND p.proname IN
 ('run21_actor_allowed','three_five_seven_row_visible','create_session','session_take_seat','delayed_human');`)).rows));
 console.log(JSON.stringify((await db.query(`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN('games','players');`)).rows));
}finally{await db.end();}
