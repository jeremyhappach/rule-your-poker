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
// The exact DDL/default contract already passed its short rollback rehearsal.
// Long candidate runs use a connection-local copy of defaults so ALTER TABLE
// never holds an AccessExclusiveLock over the production timer scan.
const firstGuard=patch.indexOf('DO $guard$');
let candidatePatch=patch.slice(firstGuard);
const admissionStart=candidatePatch.indexOf('CREATE OR REPLACE FUNCTION private.golf_admission_rules()',candidatePatch.indexOf('END $guard$;',candidatePatch.indexOf("'private.golf_admission_rules()'::regprocedure")));
const admissionEnd=candidatePatch.indexOf('$function$\n;',admissionStart)+'$function$\n;'.length;
if(admissionStart<0||admissionEnd<=admissionStart)throw Error('Default-reader boundary changed');
candidatePatch=candidatePatch.slice(0,admissionStart)+candidatePatch.slice(admissionStart,admissionEnd).replaceAll('public.game_defaults','pg_temp.game_defaults')+candidatePatch.slice(admissionEnd);
candidatePatch="CREATE TEMP TABLE game_defaults ON COMMIT DROP AS TABLE public.game_defaults; ALTER TABLE pg_temp.game_defaults ADD COLUMN golf_holes integer NOT NULL DEFAULT 9 CHECK(golf_holes IN (3,6,9,18));\n"+candidatePatch;
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
  if(money===0){
   let continuation=financial.replace('FOR n IN 2..4 LOOP','FOR n IN 2..2 LOOP').replace('FOR k IN 1..n LOOP','FOR k IN 1..1 LOOP')
    .replace('n integer;k integer;', 'old_round uuid;old_request uuid;old_revision bigint;old_receipt jsonb;next_d uuid;next_actor uuid;next_player uuid;new_state jsonb; n integer;k integer;')
    .replace('SELECT state INTO s FROM private.golf_matches WHERE dealer_game_id=d;',`PERFORM pg_temp.golf_login(users[1]);
    SELECT round_id,revision INTO old_round,old_revision FROM private.golf_matches WHERE dealer_game_id=d;
    old_request:=pg_temp.golf_fixture_uuid();v:=public.golf_action(d,old_round,old_request,old_revision,'open',ARRAY[0,3]);old_receipt:=v->'receipt';
    SELECT state INTO s FROM private.golf_matches WHERE dealer_game_id=d;`)
    .replace('UPDATE private.golf_matches SET state=s,',`s:=s||jsonb_build_object('presentation',private.golf_presentation(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint-60000));
    UPDATE private.golf_matches SET state=s,`)
    .replace('SET CONSTRAINTS ALL DEFERRED;',`PERFORM private.golf_finish_postgame(d);
    PERFORM pg_temp.golf_assert((SELECT NOT finished FROM private.golf_matches WHERE dealer_game_id=d),'early continuation denied');
    PERFORM pg_sleep(greatest(0,((SELECT (state#>>'{terminal,deadline}')::bigint FROM private.golf_matches WHERE dealer_game_id=d)-floor(extract(epoch FROM clock_timestamp())*1000))/1000.0)+0.02);
    PERFORM private.golf_finish_postgame(d);PERFORM private.golf_finish_postgame(d);
    PERFORM pg_temp.golf_assert((SELECT finished FROM private.golf_matches WHERE dealer_game_id=d),'continuation once');
    SELECT config_deadline INTO offer FROM public.games WHERE id=g;
    SELECT p0.id,p0.user_id INTO next_player,next_actor FROM public.players p0 JOIN public.games g0 ON g0.id=p0.game_id AND p0.position=g0.dealer_position WHERE g0.id=g;
    PERFORM pg_temp.golf_login(next_actor);
    v:=public.golf_configure(g,next_player,(SELECT dealer_position FROM public.games WHERE id=g),'six-card-golf','{"ante_amount":5,"holes":${holes}}',offer);next_d:=(v#>>'{dealer_game,id}')::uuid;
    PERFORM pg_temp.golf_assert(next_d<>d AND NOT EXISTS(SELECT FROM private.golf_matches WHERE dealer_game_id=next_d),'Run Back fresh identity and consent');
    FOR i IN 1..n LOOP IF users[i]<>next_actor THEN PERFORM pg_temp.golf_login(users[i]);PERFORM public.submit_ante_decision(g,next_d,ids[i],'ante_up');END IF;END LOOP;
    SELECT jsonb_build_object('state',state,'revision',revision,'round',round_id) INTO new_state FROM private.golf_matches WHERE dealer_game_id=next_d;
    PERFORM pg_temp.golf_assert((new_state#>>'{state,rules,holes}')::integer=${holes},'Run Back preserves duration');
    PERFORM pg_temp.golf_login(users[1]);
    PERFORM pg_temp.golf_assert(public.golf_action(d,old_round,old_request,old_revision,'open',ARRAY[0,3])->'receipt'=old_receipt,'late prior-match receipt');
    PERFORM private.golf_settle(d);
    PERFORM pg_temp.golf_assert((SELECT jsonb_build_object('state',state,'revision',revision,'round',round_id)=new_state FROM private.golf_matches WHERE dealer_game_id=next_d),'late replay preserves successor');
    SET CONSTRAINTS ALL DEFERRED;`);
   suites.push(['continuation-'+holes,continuation]);
  }
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
${installed?'':candidatePatch}
${scope}
${helpers}
${!installed&&name==='configuration'?fixture.replaceAll('public.game_defaults','pg_temp.game_defaults'):fixture}
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
