// Offline generation. Reuse the established isolated fixture/rollback protocol.
import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {wrapUnit} from './hosted-unit.mjs';
let source=read('dev/six-card-golf/production-proof.mjs','utf8');
source=source.slice(0,source.indexOf('\nif(process.argv[1]'))+'\nexport {containment,residualCheck};';
const {sanitizeFixture,containment,residualCheck}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const installed=process.argv.includes('--installed');
const out='qualification.local/golf-match-length/release/'+(installed?'installed':'candidate');mkdirSync(out,{recursive:true});
const get=p=>read(p,'utf8').replaceAll('\r\n','\n');
const patch=get('supabase/six-card-golf/match-length.candidate.sql');
const helpers=get('supabase/six-card-golf/core-proof.sql').split('\nDO $$')[0]+get('supabase/six-card-golf/proof.sql').split('\nDO $$')[0];
const suites=[['configuration',sanitizeFixture('core-proof',get('supabase/six-card-golf/match-length-proof.sql'))]];
for(const holes of [3,6,9,18]){
 let human=sanitizeFixture('proof',get('supabase/six-card-golf/proof.sql'))
 .replace('UPDATE private.golf_release SET enabled=true,admission_enabled=true;','-- Preserve admission.')
 .replace('FOR money_i IN 0..1 LOOP','FOR money_i IN 0..0 LOOP').replace('FOR n IN 2..4 LOOP','FOR n IN 2..2 LOOP')
 .replaceAll('{"ante_amount":5}',JSON.stringify({ante_amount:5,holes}))
 .replace("m.state->'rules'=private.golf_admission_rules()","m.state->'rules'=(private.golf_admission_rules()||jsonb_build_object('holes',"+holes+"))")
 .replace("jsonb_array_length(m.state->'holes')=9","jsonb_array_length(m.state->'holes')="+holes)
 .replace('count(*)=9 AND count(predecessor_round_id)=8','count(*)='+holes+' AND count(predecessor_round_id)='+(holes-1))
 .replace("IF v->>'phase'<>'complete' THEN","IF v->>'phase'<>'complete' AND action<>'open' THEN")
 .replace("SET state=jsonb_set(state,'{deadline}','0'),revision=revision+1","SET state=jsonb_set(jsonb_set(state,'{deadline}','0'),'{presentation,endsAt}','0'),revision=revision+1")
 .replaceAll('PERFORM private.golf_recover();','PERFORM pg_temp.golf_scoped_recover();');
 suites.push(['human-'+holes,human]);
 for(const money of [0,1]){
  let financial=sanitizeFixture('financial-proof',get('supabase/six-card-golf/financial-proof.sql'))
   .replace('FOR money_i IN 0..1 LOOP',`FOR money_i IN ${money}..${money} LOOP`)
   .replaceAll('{"ante_amount":5}',JSON.stringify({ante_amount:5,holes}))
   .replace("'hole',9","'hole',"+holes).replace('h=9','h='+holes).replace('generate_series(1,9)','generate_series(1,'+holes+')');
  suites.push(['financial-'+holes+'-'+money,financial]);
 }
}
const snapshot=`SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(pg_get_functiondef(p.oid)),p.proacl::text)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public') AND p.proname LIKE 'golf_%'`;
const units=[];
for(const [name,fixture] of suites){
 const prefix=randomUUID().slice(0,18);
 // Clone the installed recovery body into this connection's temporary schema;
 // production functions and unrelated games are never targeted by recovery.
 const scope=`DO $scope$ DECLARE d text;BEGIN d:=pg_get_functiondef('private.golf_recover()'::regprocedure);IF (length(d)-length(replace(d,'WHERE NOT x.finished','')))/length('WHERE NOT x.finished')<>1 THEN RAISE EXCEPTION 'golf:recovery_scope_shape';END IF;d:=replace(d,'private.golf_recover()','pg_temp.golf_scoped_recover()');EXECUTE replace(d,'WHERE NOT x.finished','WHERE x.game_id::text LIKE ''${prefix}%'' AND NOT x.finished');END $scope$;`;
 const sql=`BEGIN ISOLATION LEVEL REPEATABLE READ;
${residualCheck(prefix)}
${containment(prefix)}
CREATE TEMP TABLE golf_release_before AS SELECT (${snapshot}) functions,(SELECT to_jsonb(r) FROM private.golf_release r) admission,(SELECT jsonb_agg(to_jsonb(r)) FROM public.game_defaults r) defaults;
-- golf-proof:rehearsal-start
${installed?'':patch}
${scope}
${helpers}
${fixture}
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.golf_unchanged();
SELECT jsonb_build_object('unit','${name}','passed',true) candidate_evidence;
ROLLBACK;
${residualCheck(prefix)}
DO $verify$ BEGIN IF (SELECT functions FROM golf_release_before) IS DISTINCT FROM (${snapshot}) OR (SELECT admission FROM golf_release_before) IS DISTINCT FROM (SELECT to_jsonb(r) FROM private.golf_release r) OR (SELECT defaults FROM golf_release_before) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(r)) FROM public.game_defaults r) THEN RAISE EXCEPTION 'golf:rollback_changed_authority_or_defaults';END IF;END $verify$;
SELECT jsonb_build_object('unit','${name}','rollback_verified',true) rollback_evidence;`;
 const wrapped=wrapUnit(sql).replaceAll("statement_timeout='15s'","statement_timeout='30s'").replaceAll("idle_in_transaction_session_timeout='20s'","idle_in_transaction_session_timeout='35s'");
 write(out+'/'+name+'.sql',wrapped);units.push({name,path:out+'/'+name+'.sql',sha256:createHash('sha256').update(wrapped).digest('hex')});
}
write(out+'/manifest.json',JSON.stringify({installed,units},null,2));console.log('Prepared',units.length,'contained units',out);
