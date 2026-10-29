import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {connect} from '../async-words/local.mjs';
const proof=read('supabase/delayed/reviews-proof.sql','utf8');
const head="BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';\n";
const migration=read('supabase/migrations/20261029184517_async_results_review.sql','utf8');
const candidate=head+migration+'\n'+proof+'\nROLLBACK;';
const installed=head+proof+'\nROLLBACK;';
write('qualification.local/async-combined/review-hosted-candidate.sql',candidate);
write('qualification.local/async-combined/review-hosted-installed.sql',installed);
const {database}=JSON.parse(read('qualification.local/async-combined/review-context.json'));
if(!/^async_reviews_\d+$/.test(database))throw Error('Synthetic local database only');
const db=await connect(database);
try {
 // Mirror the already-approved current production admission in the local fixture only.
 await db.query('UPDATE private.delayed_release SET admission_enabled=true;UPDATE private.delayed_recovery_state SET enabled=true;UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()');
 const exists=(await db.query("SELECT to_regclass('private.delayed_review_events') IS NOT NULL present")).rows[0].present;
 const results=await db.query(exists?installed:candidate);console.log(JSON.stringify(results.flatMap(r=>r.rows??[])));
}finally{await db.query('ROLLBACK');await db.end();}
