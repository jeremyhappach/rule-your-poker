// Local rollback rehearsal only: deliberately no install/apply option.
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {connect} from './database.mjs';
const {database}=JSON.parse(read('qualification.local/six-card-golf/ui-context.json','utf8'));
const c=await connect(database),proofs=[];
try{
 const before=(await c.query("SELECT md5(pg_get_functiondef('private.golf_reduce(jsonb,text,integer[],bigint)'::regprocedure)) digest")).rows[0].digest;
 await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='180s'");
 await c.query(read('supabase/six-card-golf/rules-v2.candidate.sql','utf8'));
 await c.query("UPDATE private.golf_release SET enabled=true,admission_enabled=true");
 for(const name of ['core-proof','rules-v2-proof','proof','rules-v2-rpc-proof','financial-proof','recovery-proof','mixed-proof','presentation-proof']){
  await c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
  if(name==='mixed-proof')await c.query("UPDATE public.game_defaults SET golf_scoring_delay_ms=200,golf_results_duration_ms=1000 WHERE game_type='six-card-golf'");
  // This regression deliberately admits a /1 offer; it asserts the old prolonged-play ending.
  if(name==='presentation-proof'){
   await c.query("UPDATE public.game_defaults SET golf_scoring_delay_ms=1200,golf_results_duration_ms=5000 WHERE game_type='six-card-golf'");
   const legacy=read('supabase/six-card-golf/presentation.candidate.sql','utf8');
   const start=legacy.indexOf('CREATE OR REPLACE FUNCTION private.golf_admission_rules()');
   await c.query(legacy.slice(start,legacy.indexOf('END $$;',start)+7));
  }
  await c.query(read('supabase/six-card-golf/'+name+'.sql','utf8'));proofs.push(name);console.log('PASS',name);
 }
 const frames=(await c.query('SELECT label,snapshot FROM golf_v2_review_frames')).rows;
 await c.query('SET CONSTRAINTS ALL IMMEDIATE');await c.query('ROLLBACK');
 const after=(await c.query("SELECT md5(pg_get_functiondef('private.golf_reduce(jsonb,text,integer[],bigint)'::regprocedure)) digest")).rows[0].digest;
 if(before!==after)throw Error('Local function rollback failed');
 write('qualification.local/six-card-golf/review-20261022-v2/database-proof.json',JSON.stringify({database,passed:true,proofs,rollbackVerified:true,production:false,before,after},null,2));
 write('qualification.local/six-card-golf/review-20261022-v2/threshold-public-frames.json',JSON.stringify(frames,null,2));
}catch(e){await c.query('ROLLBACK');console.error(e.message,e.where);process.exitCode=1;}finally{await c.end();}
