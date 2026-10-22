import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {connect} from './database.mjs';
const {database}=JSON.parse(read('qualification.local/six-card-golf/ui-context.json','utf8'));const c=await connect(database),install=process.argv.includes('--install'),proofs=[];
const patch=read('supabase/six-card-golf/presentation.candidate.sql','utf8');
try{
 if(install){await c.query('BEGIN');await c.query(patch);await c.query('COMMIT');}
 await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='180s'");if(!install)await c.query(patch);
 await c.query("UPDATE private.golf_release SET enabled=true,admission_enabled=true");
 for(const name of ['core-proof','proof','financial-proof','recovery-proof','presentation-proof']){
  await c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
  if(name==='proof')await c.query("UPDATE public.game_defaults SET golf_scoring_delay_ms=200,golf_results_duration_ms=1000 WHERE game_type='six-card-golf'");
  let sql=read('supabase/six-card-golf/'+name+'.sql','utf8');
  if(name==='proof')sql=sql.replace('   PERFORM pg_temp.golf_login(users[4]);',`   PERFORM pg_temp.golf_assert((m.state#>>'{terminal,startedAt}')::bigint>=(m.state#>>'{presentation,endsAt}')::bigint,'winner after results');
   UPDATE public.games SET is_paused=true WHERE id=game;UPDATE private.golf_matches SET paused_at=paused_at-1000 WHERE dealer_game_id=dealer;
   PERFORM private.golf_finish_postgame(dealer);PERFORM pg_temp.golf_assert((SELECT NOT finished FROM private.golf_matches WHERE dealer_game_id=dealer),'paused terminal held');
   BEGIN UPDATE private.golf_matches SET state=private.golf_shift_presentation(state,NULL),paused_at=NULL WHERE dealer_game_id=dealer;RAISE EXCEPTION 'invalid resume admitted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'golf:immutable_match' THEN RAISE;END IF;END;
   BEGIN UPDATE private.golf_matches SET state=jsonb_set(state,'{scores}','{}'),paused_at=NULL WHERE dealer_game_id=dealer;RAISE EXCEPTION 'score change admitted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'golf:immutable_match' THEN RAISE;END IF;END;
   UPDATE public.games SET is_paused=false WHERE id=game;SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=dealer;
   PERFORM private.golf_finish_postgame(dealer);PERFORM pg_temp.golf_assert((SELECT NOT finished FROM private.golf_matches WHERE dealer_game_id=dealer),'early close held');
   PERFORM pg_sleep(greatest(0,((m.state#>>'{terminal,deadline}')::bigint-floor(extract(epoch FROM clock_timestamp())*1000))/1000.0)+0.01);
   PERFORM private.golf_finish_postgame(dealer);PERFORM private.golf_finish_postgame(dealer);
   PERFORM pg_temp.golf_assert((SELECT finished FROM private.golf_matches WHERE dealer_game_id=dealer),'continuation once');
   PERFORM pg_temp.golf_assert(public.golf_action(dealer,round_i,req,rev,action,items)->'receipt'=v->'receipt','receipt after continuation');
   PERFORM pg_temp.golf_login(users[4]);`);
  const result=await c.query(sql);proofs.push(name);console.log('PASS',name);if(name==='proof')await c.query("UPDATE public.game_defaults SET golf_scoring_delay_ms=1200,golf_results_duration_ms=5000 WHERE game_type='six-card-golf'");
 }
 await c.query('SET CONSTRAINTS ALL IMMEDIATE');await c.query('ROLLBACK');
 write('qualification.local/six-card-golf/presentation-'+(install?'installed':'candidate')+'-proof.json',JSON.stringify({database,passed:true,proofs,rollback:true,production:false},null,2));
}catch(e){await c.query('ROLLBACK');console.error(e.message,e.where);process.exitCode=1;}finally{await c.end();}
