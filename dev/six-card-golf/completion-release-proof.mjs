// Offline only. Isolated namespaced fixtures, same-snapshot rollback verification.
import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';import {wrapUnit} from './hosted-unit.mjs';
let source=read('dev/six-card-golf/production-proof.mjs','utf8');source=source.slice(0,source.indexOf('\nif(process.argv[1]'))+'\nexport {containment,residualCheck};';
const {sanitizeFixture,containment,residualCheck}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const installed=process.argv.includes('--installed'),out='qualification.local/golf-completion-release/'+(installed?'installed':'candidate');mkdirSync(out,{recursive:true});
const get=p=>read(p,'utf8').replaceAll('\r\n','\n');const patch=get('supabase/six-card-golf/local-completion.candidate.sql');
const helpers=get('supabase/six-card-golf/core-proof.sql').split('\nDO $$')[0]+get('supabase/six-card-golf/proof.sql').split('\nDO $$')[0];
const functions="SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('hash',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text)) FROM pg_proc p WHERE p.oid IN ('private.pause_all_humans_auto_fold(uuid)'::regprocedure,'private.golf_recover()'::regprocedure,'public.admin_blast_fake_money_game(uuid)'::regprocedure)";
const suites=[];
for(const money of [0,1])for(const humans of [1,2,3]){
 let sql=sanitizeFixture('proof',get('supabase/six-card-golf/local-completion-proof.sql')).replace('UPDATE private.golf_release SET enabled=true,admission_enabled=true;','-- Admission is unchanged.').replace('FOR money IN 0..1 LOOP FOR humans IN 1..3 LOOP',`FOR money IN ${money}..${money} LOOP FOR humans IN ${humans}..${humans} LOOP`);
 suites.push(['completion-'+money+'-'+humans,sql]);
}
for(const money of [0,1]){
 let sql=sanitizeFixture('financial-proof',get('supabase/six-card-golf/financial-proof.sql')).replace('UPDATE private.golf_release SET enabled=true,admission_enabled=true;','-- Admission unchanged.').replace('FOR money_i IN 0..1 LOOP',`FOR money_i IN ${money}..${money} LOOP`);
 suites.push(['financial-'+money,sql]);
}
const units=[];
for(const [name,fixture] of suites){const prefix=randomUUID().slice(0,18);
 const scope=`DO $scope$ DECLARE d text;BEGIN d:=pg_get_functiondef('private.golf_recover()'::regprocedure); IF (length(d)-length(replace(d,'WHERE NOT x.finished','')))/length('WHERE NOT x.finished')<>1 THEN RAISE EXCEPTION 'golf:recovery_scope_shape';END IF;EXECUTE replace(d,'WHERE NOT x.finished','WHERE x.game_id::text LIKE ''${prefix}%'' AND NOT x.finished');END $scope$;`;
 const prepare=`${residualCheck(prefix)}\n${containment(prefix)}\nCREATE TEMP TABLE golf_release_before AS SELECT (${functions}) functions,(SELECT jsonb_agg(to_jsonb(r)) FROM private.golf_release r) admission,(SELECT jsonb_agg(to_jsonb(r) ORDER BY dealer_game_id) FROM private.golf_matches r) matches;`;
 const sql=`BEGIN ISOLATION LEVEL REPEATABLE READ;
${prepare}
-- golf-proof:rehearsal-start
${installed?'':patch}
CREATE TEMP TABLE golf_release_after AS SELECT (${functions}) functions;
${scope}
${helpers}
${fixture}
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.golf_unchanged();
SELECT jsonb_build_object('unit','${name}','functions',(SELECT functions FROM golf_release_after),'passed',true) candidate_evidence;
ROLLBACK;
${residualCheck(prefix)}
DO $verify$ BEGIN IF (SELECT functions FROM golf_release_before) IS DISTINCT FROM (${functions}) OR (SELECT admission FROM golf_release_before) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(r)) FROM private.golf_release r) OR (SELECT matches FROM golf_release_before) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(r) ORDER BY dealer_game_id) FROM private.golf_matches r) THEN RAISE EXCEPTION 'golf:rollback_changed_authority_or_history';END IF; END $verify$;
SELECT jsonb_build_object('unit','${name}','rollback_verified',true) rollback_evidence;`;
 // A full match preserves the actual configured terminal presentation clock.
 // Allow that clock to elapse; never shorten the rules to fit a test timeout.
 const wrapped=wrapUnit(sql).replaceAll("statement_timeout='15s'","statement_timeout='90s'").replaceAll("idle_in_transaction_session_timeout='20s'","idle_in_transaction_session_timeout='100s'");write(out+'/'+name+'.sql',wrapped);units.push({name,path:out+'/'+name+'.sql',sha256:createHash('sha256').update(wrapped).digest('hex')});}
write(out+'/manifest.json',JSON.stringify({installed,units},null,2));console.log('Prepared',units.length,'contained units',out);
