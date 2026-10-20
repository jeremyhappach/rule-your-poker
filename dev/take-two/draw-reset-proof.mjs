import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {connect,localContext} from './database.mjs';
const migration=read('supabase/take-two/draw-reset.sql','utf8');
const proof=['proof','core-proof','bot-pause-proof','draw-reset-proof'].map(n=>read('supabase/take-two/'+n+'.sql','utf8')).join('\n');
const preservation=`CREATE TEMP TABLE take_preserved_records AS SELECT 'arcade' source,to_jsonb(r) row FROM private.arcade_results r WHERE game='take-two' UNION ALL SELECT 'multiplayer',to_jsonb(r) FROM private.multiplayer_score_results r WHERE game='take-two';`;
const check=`DO $$ BEGIN IF EXISTS(SELECT source,row FROM take_preserved_records EXCEPT SELECT 'arcade',to_jsonb(r) FROM private.arcade_results r WHERE game='take-two' EXCEPT SELECT 'multiplayer',to_jsonb(r) FROM private.multiplayer_score_results r WHERE game='take-two') THEN RAISE EXCEPTION 'Historical records changed';END IF;END $$;`;
write('qualification.local/take-two/draw-reset-candidate-proof.sql','BEGIN;\nSET LOCAL statement_timeout=\'25s\';\n'+preservation+'\n'+migration+'\n'+proof+'\n'+check+'\nROLLBACK;');
write('qualification.local/take-two/draw-reset-installed-proof.sql','BEGIN;\nSET LOCAL statement_timeout=\'25s\';\n'+preservation+'\n'+proof+'\n'+check+'\nROLLBACK;');
const c=await connect(localContext().database);
try {
 await c.query('BEGIN');
 await c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 await c.query(migration);
 const result=await c.query(proof);
 console.log(result.filter(r=>r.rows.length).flatMap(r=>r.rows));
 await c.query('ROLLBACK');
 // Install only into the isolated local harness after its rollback proof passes.
 await c.query('BEGIN');await c.query(migration);await c.query('COMMIT');
}catch(e){await c.query('ROLLBACK');console.error(e.message,e.where);process.exitCode=1;}finally{await c.end();}
