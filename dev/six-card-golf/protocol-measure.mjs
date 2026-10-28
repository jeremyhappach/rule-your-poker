import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {connect} from './database.mjs';
const {database}=JSON.parse(read('qualification.local/six-card-golf/installed-local.json','utf8'));
if(!/^golf_installed_\d+$/.test(database))throw Error('Local installed database required');
const c=await connect(database),results=[];
c.on('notice',m=>{if(m.message.startsWith('MEASURE'))console.log(m.message);});
try{
 for(const n of [3,4]){
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await c.query(read('dev/six-card-golf/local-dealer-reference.sql','utf8'));
  await c.query("SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='100ms'; SET LOCAL idle_in_transaction_session_timeout='20s'");
  await c.query(read('supabase/six-card-golf/core-proof.sql','utf8').split('\nDO $$')[0]);
  await c.query(read('supabase/six-card-golf/proof.sql','utf8').split('\nDO $$')[0]);
  await c.query("UPDATE private.golf_release SET enabled=true,admission_enabled=true; INSERT INTO public.system_settings(key,value) VALUES('make_it_take_it','{\"enabled\":true}') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value");
  let sql=read('supabase/six-card-golf/mixed-proof.sql','utf8').replaceAll('\r\n','\n')
   .replace("proof_phase text:='combined';","proof_phase text:='continuation';")
   .replaceAll("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';",'')
   .replace('FOR money IN 0..1 LOOP FOR n IN 2..4 LOOP',`FOR money IN 0..0 LOOP FOR n IN ${n}..${n} LOOP`)
   .replace("PERFORM pg_temp.golf_assert(bot_finishes>0,'earned zero-client bot final action and settlement');","RAISE NOTICE 'MEASURE finishes=% dealerDraws=%',bot_finishes,dealer_draws;");
  for(const marker of ['  FOR t IN 1..2500 LOOP','  -- Wait for the real terminal hold','  SELECT config_deadline INTO offer FROM public.games WHERE id=g;']){
   sql=sql.replace(marker,"  RAISE NOTICE 'MEASURE "+marker.trim().replaceAll("'","''")+" %',clock_timestamp();\n"+marker);
  }
  const start=performance.now();await c.query(sql);results.push({n,elapsedMs:Math.round(performance.now()-start)});
  await c.query('ROLLBACK');
 }
 console.log(JSON.stringify(results));write('qualification.local/six-card-golf/protocol-measure.json',JSON.stringify(results,null,2));
}finally{await c.query('ROLLBACK');await c.end();}
