import {connect,context,path} from './real-money-local.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
const {database,differences}=context();assert.match(database,/^ptown_words_real_\d+$/);const db=await connect(database);
const pre=JSON.parse(read('dev/ptown-words/real-money-preimage.json','utf8'));
const checks=[];
try{
 // Bring only the disposable clone's Words functions to inspected production
 // definitions. Canonical settlement/journal/pause/liveness owners must match.
 for(const diff of differences){if(/ptown_words|delayed_words/.test(diff.signature)){await db.query(pre.functions.find(f=>f.signature===diff.signature).definition);}else if(!/set_game_paused\(uuid,boolean\)|pause_due_real_money_yahtzee/.test(diff.signature))throw Error('Unqualified canonical clone difference '+diff.signature);}
 for(const signature of ['settle_gameplay_chip_transfers(uuid,jsonb,text)','finalize_gameplay_transfer_batch()','record_session_results()','set_game_paused(uuid,boolean,uuid,bigint)','private.evaluate_real_money_liveness(uuid)'])assert.equal((await db.query('SELECT md5(pg_get_functiondef($1::regprocedure)) hash',[signature])).rows[0].hash,pre.functions.find(f=>f.signature===signature).md5);
 checks.push('Inspected canonical financial, pause and liveness authorities match the isolated clone');
 const candidate=read(path+'/candidate.sql','utf8');
 await db.query('BEGIN');await db.query(candidate);assert.equal((await db.query('SELECT real_qualified FROM private.ptown_words_release')).rows[0].real_qualified,false);await db.query('ROLLBACK');
 await db.query('BEGIN');await db.query(candidate);await db.query('COMMIT');checks.push('Candidate installs closed; fake admission and bot flags preserved');
 await db.query('BEGIN');
 // Local clone has no scheduled dispatcher. Refresh its isolated heartbeat only;
 // hosted qualification must rely on actual production health, never this line.
 await db.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 await db.query('UPDATE private.ptown_words_release SET real_qualified=true');
 await db.query(read(path+'/financial-proof.sql','utf8'));await db.query('ROLLBACK');
 checks.push('12 fake/real 2/3/4-player winner/tie proofs, signed chip deltas, canonical ledger and real account postings','Post-transfer failure rollback; duplicate/conflicting/stale/late commands; continuation and terminal state','Real /2 bank, pause/request/cancel, ownership, reload snapshot, legacy preservation and timeout proof');
 write(path+'/proof.json',JSON.stringify({passed:true,localOnly:true,database,checks,differences},null,2));console.log(JSON.stringify({passed:true,checks}));
}catch(e){console.error(e.message,e.where,e.internalQuery);process.exitCode=1;}finally{await db.query('ROLLBACK');await db.end();}
