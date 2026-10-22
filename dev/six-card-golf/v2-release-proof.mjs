// Reuse the reviewed forward-release containment and real financial proofs.
import {readFileSync as read} from 'node:fs';
import assert from 'node:assert/strict';
let source=read('dev/six-card-golf/forward-proof.mjs','utf8').replaceAll('\r\n','\n');
const replace=(from,to)=>{assert.equal(source.split(from).length,2,from);source=source.replace(from,()=>to);};
replace("from './hosted-unit.mjs'",`from '${new URL('./hosted-unit.mjs',import.meta.url).href}'`);
replace("'qualification.local/six-card-golf/forward-'","'qualification.local/six-card-golf/v2-' ");
replace("read('supabase/six-card-golf/presentation.candidate.sql','utf8')","read('supabase/six-card-golf/rules-v2.candidate.sql','utf8')");
const prior=read('supabase/six-card-golf/presentation.candidate.sql','utf8');
const start=prior.indexOf('CREATE OR REPLACE FUNCTION private.golf_admission_rules()');
const legacy=prior.slice(start,prior.indexOf('END $$;',start)+7);
replace("suites.push(['presentation',timing]);",`suites.push(['presentation',${JSON.stringify(legacy)}+'\\n'+timing]);
suites.push(['v2-boundaries',sanitizeFixture('core-proof',read('supabase/six-card-golf/rules-v2-proof.sql','utf8'))]);
suites.push(['v2-rpc',sanitizeFixture('core-proof',read('supabase/six-card-golf/rules-v2-rpc-proof.sql','utf8'))]);
for(const money of [0,1])for(const n of [2,3,4]){
 let mixed=sanitizeFixture('mixed-proof',read('supabase/six-card-golf/mixed-proof.sql','utf8'));
 mixed=mixed.replace('FOR money IN 0..1 LOOP FOR n IN 2..4 LOOP','FOR money IN '+money+'..'+money+' LOOP FOR n IN '+n+'..'+n+' LOOP')
 .replace("proof_phase text:='combined';","proof_phase text:='full';")
 .replace("PERFORM pg_temp.golf_assert(bot_finishes>0,'earned zero-client bot final action and settlement');","INSERT INTO pg_temp.golf_metrics VALUES('bot_finishes',bot_finishes);");
 suites.push(['mixed-'+money+'-'+n,mixed]);
}`);
replace("'existing_matches_unchanged',true)","'existing_matches_unchanged',true,'metrics',(SELECT jsonb_object_agg(name,value) FROM pg_temp.golf_metrics))");
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
