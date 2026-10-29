import {connect} from '../async-words/local.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
const prior=JSON.parse(read('qualification.local/async-words/context.json'));
if(!/^ptown_words_real_\d+$/.test(prior.template))throw Error('Unexpected local template');
const shared=JSON.parse(read('dev/async-combined/shared-preimage.json'));
const root=await connect('postgres'),database='async_hosted_proof_'+Date.now();
await root.query('CREATE DATABASE '+database+' TEMPLATE '+prior.template);await root.end();
const db=await connect(database),evidence={database,candidate:null,installed:null};
const inventory=async()=>JSON.stringify((await db.query("SELECT (SELECT count(*) FROM auth.users) users,(SELECT count(*) FROM public.profiles) profiles,(SELECT count(*) FROM public.games) games,(SELECT count(*) FROM public.player_transactions) transactions")).rows);
const proofs=result=>(Array.isArray(result)?result:[result]).flatMap(r=>r.rows??[]).filter(r=>r.proof);
try{
 await db.query(read('supabase/delayed/polish-local.sql','utf8'));
 await db.query('CREATE TABLE IF NOT EXISTS private.gameplay_rulesets(id text PRIMARY KEY,game text NOT NULL,config jsonb NOT NULL)');
 await db.query("INSERT INTO private.gameplay_rulesets VALUES('run21/3','run21',$1) ON CONFLICT(id) DO NOTHING",[shared.run21]);
 for(const f of [...JSON.parse(read('dev/async-combined/quintzee-preimage.json')),...shared.functions])await db.query(f.definition);
 await db.query('ALTER TABLE public.game_defaults ADD COLUMN IF NOT EXISTS quintzee_round_seconds integer NOT NULL DEFAULT 240');
 await db.query("UPDATE public.game_defaults SET quintzee_round_seconds=$1 WHERE game_type='quintzee'",[shared.quintzee.durationMs/1000]);
 const before=await inventory();
 evidence.candidate=proofs(await db.query(read('qualification.local/async-combined/hosted-candidate.sql','utf8')));
 assert.equal(await inventory(),before);assert.equal((await db.query("SELECT to_regclass('private.delayed_recovery_state') x")).rows[0].x,null);
 await db.query(read('supabase/migrations/20261029002655_async_combined_five_games.sql','utf8'));
 evidence.installed=proofs(await db.query(read('qualification.local/async-combined/hosted-installed.sql','utf8')));
 assert.equal(await inventory(),before);assert.equal((await db.query('SELECT enabled FROM private.delayed_recovery_state')).rows[0].enabled,false);
 write('qualification.local/async-combined/hosted-proof-local.json',JSON.stringify(evidence,null,2));
 console.log('PASS local candidate/installed rollback composer',JSON.stringify(evidence));
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
