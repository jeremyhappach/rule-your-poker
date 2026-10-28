import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const referenceRoot=process.env.GOLF_LOCAL_REFERENCE_ROOT??'C:/Users/jerem/.codex/worktrees/golf-timing-release/rule-your-poker';
const {default:pg}=await import(pathToFileURL(resolve(referenceRoot,'qualification.local/tri-towers/tools/node_modules/pg/lib/index.js')).href);
const template=()=>JSON.parse(read(resolve(referenceRoot,'qualification.local/six-card-golf/ui-context.json'),'utf8')).database;
const out='qualification.local/golf-local-completion';mkdirSync(out,{recursive:true});
const connect=async database=>{const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await c.connect();return c;};
if(process.argv.includes('--inspect')){
 const source=template();
 if(!/^golf_ui_\d+$/.test(source))throw Error('Unexpected local template');
 const c=await connect(source);
 try{console.log(JSON.stringify((await c.query("select p.oid::regprocedure::text identity,md5(pg_get_functiondef(p.oid)) hash from pg_proc p where p.oid in ('private.golf_recover()'::regprocedure,'private.pause_all_humans_auto_fold(uuid)'::regprocedure,to_regprocedure('public.admin_blast_fake_money_game(uuid)'),'public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)'::regprocedure);select state#>>'{rules,version}' version,count(*) matches from private.golf_matches group by 1;select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='private.golf_matches'::regclass;")).map(r=>r.rows),null,2));}finally{await c.end();}
}else{
 const source=template();
 if(!/^golf_ui_\d+$/.test(source))throw Error('Unexpected local template');
 const database='golf_completion_'+Date.now(),admin=await connect('postgres');
 await admin.query('CREATE DATABASE '+database+' TEMPLATE '+source);await admin.end();
 write(out+'/context.json',JSON.stringify({database,host:'127.0.0.1',port:55439}));
 const c=await connect(database);
 try{
  const inventory="SELECT (SELECT count(*) FROM public.games) games,(SELECT count(*) FROM public.players) players,(SELECT count(*) FROM public.game_results) results,(SELECT count(*) FROM private.golf_matches) matches,md5(pg_get_functiondef('private.golf_recover()'::regprocedure)) recovery,to_regprocedure('public.admin_blast_fake_money_game(uuid)')::text blast";
  const before=(await c.query(inventory)).rows[0];
  await c.query('BEGIN');
  // The source is an isolated local fixture database, never a hosted binding.
  // Freeze inherited fixtures so only the new fixtures enter recovery.
  await c.query('UPDATE public.games SET is_paused=true WHERE NOT is_paused');
  await c.query(read('supabase/six-card-golf/local-completion.reference.sql','utf8'));
  if(process.argv.includes('--v2'))await c.query(read('supabase/six-card-golf/rules-v2.candidate.sql','utf8'));
  if(process.argv.includes('--v2')){
   const expected={'golf_admission_rules':'0526b942eaedc95371b799f121dff3f3','golf_integrity':'b796b43bdb263df0e3f24cb035ba8dfe','golf_reduce':'b7f09aa2932bb8ec1fb3cd6cafac4012','golf_rules_v2':'cccbf8bac99a8ddbf5d2b5e288708cb9','golf_supported_rules':'35ace2b760d56ae758d021194c8c53f9'};
   const rows=(await c.query("SELECT p.proname,md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname=ANY($1)",[Object.keys(expected)])).rows;
   if(rows.length!==5||rows.some(r=>r.hash!==expected[r.proname]))throw Error('Local v2 authority differs from inspected deployment');
  }
  await c.query('REVOKE ALL ON FUNCTION public.admin_blast_fake_money_game(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.admin_blast_fake_money_game(uuid) TO authenticated');
  await c.query(read('supabase/six-card-golf/core-proof.sql','utf8').split('\nDO $$')[0]);
  await c.query(read('supabase/six-card-golf/proof.sql','utf8').split('\nDO $$')[0]);
  const patch=read('supabase/six-card-golf/local-completion.candidate.sql','utf8');
  await c.query(patch);await c.query(patch);
  await c.query(read('supabase/six-card-golf/local-completion-proof.sql','utf8'));
  if(process.argv.includes('--v2'))await c.query(read('supabase/six-card-golf/financial-proof.sql','utf8'));
  await c.query('SET CONSTRAINTS ALL IMMEDIATE');
  const checks=(await c.query('SELECT * FROM pg_temp.golf_completion_checks ORDER BY label')).rows,cases=(await c.query('SELECT * FROM pg_temp.golf_completion_cases')).rows;
  await c.query('ROLLBACK');
  const after=(await c.query(inventory)).rows[0];if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Local rollback inventory changed');
  const patchHash=createHash('sha256').update(patch).digest('hex');
  write(out+(process.argv.includes('--v2')?'/evidence-v2.json':'/evidence-v1.json'),JSON.stringify({database,rollback:true,passed:true,patchHash,checks,cases,before,after,financialRegression:process.argv.includes('--v2')},null,2));console.log('Local completion proof passed; rolled back:',database,JSON.stringify(cases));
 }catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
}
