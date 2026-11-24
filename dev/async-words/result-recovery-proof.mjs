import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8').replaceAll('\r\n','\n');
const candidate=process.argv.includes('--installed')?'':read('supabase/delayed/result-recovery.sql');
const before=`CASE WHEN j=jsonb_array_length(r->'guesses')-1 AND guess->>'word'=r->>'answer' THEN guess ELSE '{"word":"","feedback":[]}'::jsonb END`;
const after=`jsonb_build_object('word',CASE WHEN j=jsonb_array_length(r->'guesses')-1 AND guess->>'word'=r->>'answer' THEN guess->>'word' ELSE '' END,'feedback',guess->'feedback')`;
const proof=read('dev/five-alive/privacy.rollback.proof.sql').replace('-- CANDIDATE_SQL',()=>candidate)
 .replace('-- IDEMPOTENCE_SQL',()=>candidate).replace(before,()=>after)
 .replace('ROLLBACK;',()=>read('supabase/delayed/result-recovery-proof.sql')+'\nROLLBACK;');
mkdirSync('qualification.local',{recursive:true});
writeFileSync('qualification.local/async-result-recovery-proof.sql',proof);
