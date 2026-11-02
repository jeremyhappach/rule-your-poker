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
 // Legacy Horses proofs predate secure randomness / the current dealer FK.
 // Their captured failures are disclosed in FOCUSED_RESULTS.md, not waived.
 const files=['seven_game_pause_rollback_proof','yahtzee_authority_rollback_proof'];
 if(process.argv.includes('--legacy'))files.push('horses_scc_connected_authority_rollback_proof','horses_scc_disconnect_settlement_proof');
 for(const file of files){
  const path=`supabase/tests/${file}.sql`;let sql;
  try{sql=readFileSync(path,'utf8');}catch{reports.push({file,status:'unavailable'});continue;}
  const body=sql.replace(/^BEGIN;\s*/m,'').replace(/ROLLBACK;\s*$/,'');
  const counts=async()=> (await c.query('SELECT (SELECT count(*) FROM public.games)::int games,(SELECT count(*) FROM public.players)::int players,(SELECT count(*) FROM public.game_results)::int results,(SELECT count(*) FROM public.gameplay_transfer_batches)::int batches,(SELECT count(*) FROM public.session_player_snapshots)::int snapshots')).rows[0];
  const report={file,sha256:createHash('sha256').update(sql).digest('hex'),status:'failed',before:await counts()};
  try{
   await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='90s'");
   for(let i=0;i<2;i++){const id=randomUUID();await c.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id,`focused-pause-${id}@local.invalid`]);await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true)',[id,'Pause proof '+i]);}
   await c.query(body);await c.query('SET CONSTRAINTS ALL IMMEDIATE');report.inside=await counts();report.status='passed';
  }catch(e){report.error={message:e.message,code:e.code};process.exitCode=1;}
  finally{await c.query('ROLLBACK');report.after=await counts();report.rollbackVerified=JSON.stringify(report.before)===JSON.stringify(report.after);if(!report.rollbackVerified)throw Error('Local proof rollback mismatch');}
  reports.push(report);console.log(JSON.stringify(report));
 }
 const authority=(await c.query("SELECT p.proname,md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('set_game_paused','yahtzee_settle_game','horses_scc_advance_completed_round')")).rows;
 writeFileSync('e2e/pauseAudit/evidence/focused-sql.json',JSON.stringify({database,template,localOnly:true,authority,reports},null,2));
}finally{await c.end();const admin=await connect('postgres');try{await admin.query(`DROP DATABASE "${database}"`);}finally{await admin.end();}}
