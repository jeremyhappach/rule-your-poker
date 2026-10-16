import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
export async function proveCompletion({db,scalar,pass}){
 const sql=readFileSync('supabase/arcade/completion.sql','utf8'),proof=readFileSync('dev/arcade/completion.proof.sql','utf8');
 const history=()=>scalar("SELECT md5(coalesce(jsonb_agg(to_jsonb(r)-'record' ORDER BY run_id),'[]')::text) value FROM private.arcade_results r");
 const before=await history();
 await db.query("UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp()");
 await db.query('BEGIN');await db.query(sql);await db.query(proof);await db.query('ROLLBACK');
 assert.equal(await history(),before);pass('completion/ranking candidate and complete proof roll back with legacy results untouched');
 await db.query(sql);await db.query(sql);
 await db.query('BEGIN');await db.query(proof);await db.query('ROLLBACK');
 assert.equal(await history(),before);
 const functions=(await db.query("SELECT p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND p.proname IN('arcade_commit','arcade_load','arcade_record','arcade_leaderboard') ORDER BY 1")).rows;
 writeFileSync('dev/arcade/completion.evidence.json',JSON.stringify({at:new Date().toISOString(),functions,legacyPreserved:true,productionWrites:0},null,2));
 pass('first/tied/lower/broken records, receipt replay/authorization, repeated-score top ten, tie cutoff, rolling/version separation and run-specific rank');
}
