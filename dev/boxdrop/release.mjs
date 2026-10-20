import {readFileSync as read,writeFileSync as write} from 'node:fs';import {build} from 'esbuild';import {connect,localContext,candidate} from './database.mjs';
const expected={
 'public.arcade_start(uuid,uuid,text)':'91aab45213510ff9ac5c55c0a360fc02',
 'public.arcade_commit(uuid,uuid,bigint,jsonb,bigint,uuid,text,uuid)':'826b88c8580357de001cad837bc8eec9',
 'private.megatouch_begin(uuid,uuid)':'ef09a94c4e4c756b9c962e44071b98a9',
 'private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)':'7dfa0d3a9005af1ca39e4e105c6e64a4',
 'private.megatouch_frozen_stake()':'8ead1c0aefbb731719dd19b165c52c76',
};
// Verify that the reference definitions inspected in source really are the
// currently deployed definitions, before extending them for the new game.
const c=await connect(localContext().database);
const deployed=JSON.parse(read('qualification.local/boxdrop/deployed-reference.json','utf8').replace(/^\uFEFF/,''));
try{
 await c.query('BEGIN');await c.query(read('supabase/trip-flip/registration.sql','utf8'));
 for(const [signature,hash] of Object.entries(expected)){
  const actual=(await c.query('SELECT pg_get_functiondef(to_regprocedure($1)) definition',[signature])).rows[0].definition;
  const baseline=deployed.find(row=>row.definition.includes('FUNCTION '+signature.split('(')[0]+'('));
  if(baseline?.hash!==hash||actual.replaceAll('\r\n','\n')!==baseline.definition.replaceAll('\r\n','\n'))throw Error('Reference/deployed definition mismatch: '+signature);
 }
 await c.query('ROLLBACK');
 for(const [name,hash] of Object.entries({settle_gameplay_chip_transfers:'de14ab5df0a703cfd8c1ed43aa5a819c',submit_ante_decision:'c633a318c7f2605104c92e03d3b3b09a'})){
  const actual=(await c.query("SELECT md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname=$1",[name])).rows[0]?.hash;
  if(actual!==hash)throw Error('Canonical finance/consent mismatch: '+name);
 }
}finally{await c.end();}
const guard=`DO $guard$ DECLARE f record;BEGIN FOR f IN SELECT * FROM (VALUES ${Object.entries(expected).map(([signature,hash])=>`('${signature}','${hash}')`).join(',')}) expected(signature,hash) LOOP
 IF md5(pg_get_functiondef(to_regprocedure(f.signature))) IS DISTINCT FROM f.hash THEN RAISE EXCEPTION 'boxdrop:shared_authority_changed:%',f.signature;END IF;END LOOP;END $guard$;\n`;
const migration=guard+candidate()+"\nALTER PUBLICATION supabase_realtime ADD TABLE public.boxdrop_revisions;\nSELECT cron.schedule('boxdrop-recovery','1 second',$job$SET statement_timeout='3s'; SELECT private.boxdrop_recover()$job$);\n";
write('qualification.local/boxdrop/migration.sql',migration);
write('qualification.local/boxdrop/installed-proof.sql',"BEGIN;\n"+['core-proof','proof','mode-proof','pause-proof'].map(n=>read('supabase/boxdrop/'+n+'.sql','utf8')).join('\n')+"\nROLLBACK;\nSELECT jsonb_build_object('admissionClosed',(SELECT NOT enabled AND NOT admission_enabled FROM private.boxdrop_release WHERE singleton),'noSyntheticMatches',NOT EXISTS(SELECT 1 FROM private.boxdrop_matches),'noSyntheticRuns',NOT EXISTS(SELECT 1 FROM private.arcade_runs WHERE game='boxdrop')) proof;\n");
await build({entryPoints:['supabase/functions/arcade-recovery/index.ts'],bundle:true,platform:'neutral',format:'esm',target:'es2022',outfile:'qualification.local/boxdrop/arcade-recovery.js'});
console.log('Release artifacts prepared; five reference definitions match deployed authority hashes');
