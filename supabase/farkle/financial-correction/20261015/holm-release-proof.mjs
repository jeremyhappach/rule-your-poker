import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID, createHash} from 'node:crypto';
import pg from '../../../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
const root='qualification.local/farkle-full-stack/';
const status=JSON.parse(fs.readFileSync(root+'status.json','utf8'));
const url=new URL(status.DB_URL);
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'57322');
const c=new pg.Client({connectionString:status.DB_URL});await c.connect();
const proof=execFileSync(process.execPath,['supabase/tests/build-holm-chucky-proof.mjs','--stdout'],{encoding:'utf8'});
assert.equal(proof.match(/^BEGIN;\s*$/gm)?.length,1);
assert.equal(proof.match(/^ROLLBACK;\s*$/gm)?.length,1);
const fingerprint=async()=>{
 const state={};
 for(const table of ['auth.users','public.profiles','public.user_roles','public.games','public.players','public.rounds','public.game_results','public.session_player_snapshots','public.gameplay_transfer_batches','public.player_transactions','public.system_settings','public.game_defaults']){
  state[table]=(await c.query(`SELECT count(*)::int count, md5(coalesce(string_agg(row_to_json(t)::text,E'\n' ORDER BY row_to_json(t)::text),'')) hash FROM ${table} t`)).rows[0];
 }
 return state;
};
const before=await fingerprint();
const ids=Array.from({length:4},randomUUID);
const seed=ids.map((id,i)=>`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('${id}','holm-release-${id}@example.invalid','{"username":"Holm qualification ${i}"}'); UPDATE public.profiles SET is_active=true WHERE id='${id}';`).join('\n')+
 `\nINSERT INTO public.user_roles(user_id,role) VALUES('${ids[3]}','admin');\nINSERT INTO public.system_settings(key,value) VALUES('harnesses_mode','{"enabled":false}'),('target_rule_branch_harness','{"requests":{}}') ON CONFLICT(key) DO NOTHING;`;
const evidence={at:new Date().toISOString(),productionWrites:0,proofSha256:createHash('sha256').update(proof).digest('hex')};
try{
 const results=await c.query(proof.replace(/^BEGIN;$/m,'BEGIN;\n'+seed));
 evidence.results=results.filter(r=>r.rows?.length).map(r=>r.rows);
 evidence.commands=results.map(r=>r.command);
 assert.equal(evidence.commands.at(-1),'ROLLBACK');
 evidence.rollbackExecuted=true;
}catch(e){
 evidence.error={message:e.message,code:e.code,where:e.where};
 await c.query('ROLLBACK');process.exitCode=1;
}finally{
 evidence.before=before;evidence.after=await fingerprint();
 evidence.rollbackRestoredAllTrackedState=JSON.stringify(evidence.after)===JSON.stringify(before);
 fs.writeFileSync(root+'release-holm-proof.json',JSON.stringify(evidence,null,2));
 await c.end();
 assert.ok(evidence.rollbackRestoredAllTrackedState);
 console.log(JSON.stringify({results:evidence.results,error:evidence.error,rollbackRestoredAllTrackedState:evidence.rollbackRestoredAllTrackedState}));
}
