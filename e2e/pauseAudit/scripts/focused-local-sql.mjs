// Uses only a new copy of an existing local synthetic authority fixture.
import {execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
const sourceRoot=dirname(execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{encoding:'utf8'}).trim());
const {default:pg}=await import(pathToFileURL(join(sourceRoot,'qualification.local/tri-towers/tools/node_modules/pg/lib/index.js')).href);
const template='transition_assurance_current_1793324266197';
const database='focused_pause_'+Date.now();
const connect=async database=>{const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database,connectionTimeoutMillis:3000});await c.connect();return c;};
const root=await connect('postgres');
try{await root.query(`CREATE DATABASE "${database}" TEMPLATE "${template}"`);}finally{await root.end();}
const c=await connect(database),reports=[];
mkdirSync('e2e/pauseAudit/evidence',{recursive:true});
try{
 // The captured local stub predates claims-only JWT fixtures. Match Supabase's
 // subject lookup in this disposable copy; no product function is replaced.
 await c.query(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$`);
 // The schema-only capture omitted this sequence, although it contains the
 // replay tables and current recorder functions. Restore the exact migration
 // DDL only in our disposable database, without replacing any game authority.
 const fixtureRepairs=[];
 if(!(await c.query("SELECT 1 FROM public.system_settings WHERE key='harnesses_mode'")).rowCount){
  await c.query(`INSERT INTO public.system_settings(key,value) VALUES('harnesses_mode','{"enabled":false}')`);
  fixtureRepairs.push('missing harnesses_mode row: disabled before each proof opts in');
 }
 if(!(await c.query("SELECT to_regclass('private.replay_sequence_v1') object")).rows[0].object){
  await c.query('CREATE SEQUENCE private.replay_sequence_v1 AS bigint CACHE 1');
  await c.query('REVOKE ALL ON SEQUENCE private.replay_sequence_v1 FROM PUBLIC, anon, authenticated, service_role');
  await c.query("SELECT setval('private.replay_sequence_v1',greatest(1,coalesce((SELECT max(sequence) FROM private.replay_steps),0)+1),false)");
  fixtureRepairs.push('replay_sequence_v1: 20260914192806_gin_replay_v1.sql');
 }
 const files=['seven_game_pause_rollback_proof','yahtzee_authority_rollback_proof'];
 if(process.argv.includes('--legacy'))files.push('horses_scc_connected_authority_rollback_proof','horses_scc_disconnect_settlement_proof');
 if(process.argv.includes('--cards'))files.push('gin_rummy_authority_rollback_proof','gin_atomic_postgame_rollback_proof','cribbage_authority_rollback_proof','cribbage_atomic_postgame_rollback_proof','dealer_game_setup_handoff_rollback_proof','session_intent_and_setup_rollback_proof');
 for(const file of files){
  const path=`supabase/tests/${file}.sql`;let sql;
  try{sql=readFileSync(path,'utf8');}catch{reports.push({file,status:'unavailable'});process.exitCode=1;continue;}
  const body=sql.replace(/^BEGIN;\s*/m,'').replace(/ROLLBACK;\s*$/,'');
  const counts=async()=> (await c.query('SELECT (SELECT count(*) FROM public.games)::int games,(SELECT count(*) FROM public.players)::int players,(SELECT count(*) FROM public.game_results)::int results,(SELECT count(*) FROM public.gameplay_transfer_batches)::int batches,(SELECT count(*) FROM public.session_player_snapshots)::int snapshots')).rows[0];
  const report={file,sha256:createHash('sha256').update(sql).digest('hex'),status:'failed',before:await counts()};
  try{
   await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='90s'");
   for(let i=0;i<2;i++){const id=randomUUID();await c.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id,`focused-pause-${id}@local.invalid`]);await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true)',[id,'Pause proof '+i]);}
   await c.query(body);await c.query('SET CONSTRAINTS ALL IMMEDIATE');report.inside=await counts();report.status='passed';
  }catch(e){report.error={message:e.message,code:e.code,where:e.where};process.exitCode=1;}
  finally{await c.query('ROLLBACK');report.after=await counts();report.rollbackVerified=JSON.stringify(report.before)===JSON.stringify(report.after);if(!report.rollbackVerified)throw Error('Local proof rollback mismatch');}
  reports.push(report);console.log(JSON.stringify(report));
 }
 if(process.argv.includes('--legacy')){
  // Negative control: the repaired partial-roll assertion must reject the
  // original extra-roll regression, independent of random chance.
  const report={file:'horses_partial_roll_negative_control',status:'failed'};
  await c.query('BEGIN');
  try{
   await c.query("SET LOCAL statement_timeout='90s'");
   const original=(await c.query("SELECT pg_get_functiondef('private.advance_horses_scc_expired_turn(uuid,timestamptz)'::regprocedure) def")).rows[0].def;
   const mutant=original.replace('FOR v_roll IN 1..v_rolls_remaining LOOP','FOR v_roll IN 1..3 LOOP');
   if(mutant===original)throw Error('Negative control owner pattern changed');
   await c.query(mutant);
   await c.query(readFileSync('supabase/tests/horses_scc_disconnect_settlement_proof.sql','utf8').replace(/^BEGIN;\s*/m,'').replace(/ROLLBACK;\s*$/,''));
   throw Error('Extra-roll mutation escaped proof');
  }catch(e){
   if(e.message.startsWith('horses_scc_disconnect_proof:partial_turn_received_extra_roll:')){report.status='passed';report.rejectedMutation='three rolls instead of persisted rollsRemaining';}
   else{report.error=e.message;process.exitCode=1;}
  }finally{await c.query('ROLLBACK');}
  reports.push(report);console.log(JSON.stringify(report));
 }
 const authority=(await c.query("SELECT n.nspname schema,p.proname,pg_get_function_identity_arguments(p.oid) arguments,md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proname IN ('set_game_paused','yahtzee_settle_game','horses_scc_advance_completed_round','secure_random_int','advance_horses_scc_expired_turn','gin_rummy_apply_action','gin_rummy_settle_game','gin_rummy_settle_game_legacy','cribbage_apply_discard','cribbage_apply_play','cribbage_apply_go','cribbage_settle_game','advance_due_cribbage_state','configure_dealer_game') ORDER BY n.nspname,p.proname,p.oid")).rows;
 writeFileSync('e2e/pauseAudit/evidence/focused-sql.json',JSON.stringify({database,template,localOnly:true,fixtureRepairs,authority,reports},null,2));
}finally{await c.end();const admin=await connect('postgres');try{await admin.query(`DROP DATABASE "${database}"`);}finally{await admin.end();}}
