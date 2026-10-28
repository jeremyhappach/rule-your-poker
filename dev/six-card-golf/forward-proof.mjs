// Offline builder for the reviewed presentation-only forward migration.
// Reuse the established hosted same-snapshot containment wrapper; never execute SQL here.
import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {wrapUnit} from './hosted-unit.mjs';
let source=read('dev/six-card-golf/production-proof.mjs','utf8');
source=source.slice(0,source.indexOf('\nif(process.argv[1]'))+'\nexport {containment,residualCheck,functionSnapshot,catalogSnapshot};';
const {sanitizeFixture,containment,residualCheck,functionSnapshot,catalogSnapshot}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const installed=process.argv.includes('--installed'),out='qualification.local/six-card-golf/forward-'+(installed?'installed':'candidate');
mkdirSync(out,{recursive:true});
const patch=read('supabase/six-card-golf/presentation.candidate.sql','utf8');
const core=read('supabase/six-card-golf/core-proof.sql','utf8').replaceAll('\r\n','\n');
const proof=read('supabase/six-card-golf/proof.sql','utf8').replaceAll('\r\n','\n');
const helpers=core.slice(0,core.indexOf('\nDO $$'))+proof.slice(0,proof.indexOf('\nDO $$'));
const suites=[['core',sanitizeFixture('core-proof',core)],['recovery',sanitizeFixture('recovery-proof',read('supabase/six-card-golf/recovery-proof.sql','utf8'))]];
for(const money of [0,1])for(const n of [2,3,4]){
 for(const name of ['proof','financial-proof']){
  let sql=sanitizeFixture(name,read('supabase/six-card-golf/'+name+'.sql','utf8'));
  sql=sql.replace('FOR money_i IN 0..1 LOOP',`FOR money_i IN ${money}..${money} LOOP`).replace('FOR n IN 2..4 LOOP',`FOR n IN ${n}..${n} LOOP`);
  suites.push([`${name}-${money}-${n}`,sql]);
 }
}
// Same Auth/profile sanitization, with no scheduler mutation in this fixture.
let timing=read('supabase/six-card-golf/presentation-proof.sql','utf8');
timing=sanitizeFixture('core-proof',timing);
suites.push(['presentation',timing]);
for(const money of [0,1]){
 let terminal=sanitizeFixture('financial-proof',read('supabase/six-card-golf/financial-proof.sql','utf8'))
  .replace('FOR money_i IN 0..1 LOOP',`FOR money_i IN ${money}..${money} LOOP`).replace('FOR n IN 2..4 LOOP','FOR n IN 2..2 LOOP').replace('FOR k IN 1..n LOOP','FOR k IN 1..1 LOOP');
 terminal=terminal.replace('UPDATE private.golf_matches SET state=s,',`s:=s||jsonb_build_object('presentation',private.golf_presentation(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint-60000));
    UPDATE private.golf_matches SET state=s,`);
 terminal=terminal.replace('SET CONSTRAINTS ALL DEFERRED;',`PERFORM private.golf_finish_postgame(d);
    PERFORM pg_temp.golf_assert((SELECT NOT finished FROM private.golf_matches WHERE dealer_game_id=d),'terminal early close denied');
    UPDATE public.games SET is_paused=true WHERE id=g;
    PERFORM private.golf_finish_postgame(d);
    PERFORM pg_temp.golf_assert((SELECT NOT finished AND paused_at IS NOT NULL FROM private.golf_matches WHERE dealer_game_id=d),'settled presentation pause retained');
    BEGIN UPDATE private.golf_matches SET state=private.golf_shift_presentation(state,NULL),paused_at=NULL WHERE dealer_game_id=d;RAISE EXCEPTION 'invalid resume admitted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'golf:immutable_match' THEN RAISE;END IF;END;
    BEGIN UPDATE private.golf_matches SET state=jsonb_set(state,'{scores}','{}'),paused_at=NULL WHERE dealer_game_id=d;RAISE EXCEPTION 'score mutation admitted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'golf:immutable_match' THEN RAISE;END IF;END;
    UPDATE public.games SET is_paused=false WHERE id=g;
    PERFORM pg_sleep(greatest(0,((SELECT (state#>>'{terminal,deadline}')::bigint FROM private.golf_matches WHERE dealer_game_id=d)-floor(extract(epoch FROM clock_timestamp())*1000))/1000.0)+0.02);
    PERFORM private.golf_finish_postgame(d);PERFORM private.golf_finish_postgame(d);
    PERFORM pg_temp.golf_assert((SELECT finished FROM private.golf_matches WHERE dealer_game_id=d),'zero-client continuation once');
    PERFORM pg_temp.golf_assert((SELECT current_game_uuid IS NULL FROM public.games WHERE id=g),'terminal successor identity retired');
    SET CONSTRAINTS ALL DEFERRED;`);
 suites.push(['terminal-'+money,terminal]);
}
const units=[];
for(const [name,fixture] of suites){
 const prefix=randomUUID().slice(0,18);
 const setup=`${residualCheck(prefix)}\n${containment(prefix)}
CREATE TEMP TABLE golf_preserved AS SELECT 'matches' kind,md5(to_jsonb(m)::text) digest FROM private.golf_matches m UNION ALL SELECT 'release',md5(to_jsonb(r)::text) FROM private.golf_release r UNION ALL SELECT 'canasta',md5(to_jsonb(r)::text) FROM private.canasta_release r;
CREATE FUNCTION pg_temp.golf_preserved_check() RETURNS void LANGUAGE plpgsql AS $p$ BEGIN
 IF EXISTS((SELECT * FROM pg_temp.golf_preserved EXCEPT ALL SELECT 'matches',md5(to_jsonb(m)::text) FROM private.golf_matches m WHERE game_id::text NOT LIKE '${prefix}%') UNION ALL (SELECT 'matches',md5(to_jsonb(m)::text) FROM private.golf_matches m WHERE game_id::text NOT LIKE '${prefix}%' EXCEPT ALL SELECT * FROM pg_temp.golf_preserved WHERE kind='matches')) THEN RAISE EXCEPTION 'golf_proof:existing_match_changed';END IF;
 IF NOT EXISTS(SELECT FROM pg_temp.golf_preserved WHERE kind='release' AND digest=(SELECT md5(to_jsonb(r)::text) FROM private.golf_release r)) OR NOT EXISTS(SELECT FROM pg_temp.golf_preserved WHERE kind='canasta' AND digest=(SELECT md5(to_jsonb(r)::text) FROM private.canasta_release r)) THEN RAISE EXCEPTION 'golf_proof:admission_changed';END IF;
END $p$;`;
 // First EXCEPT above must only compare match rows, not the separately checked release flags.
 const prepared=setup.replace('SELECT * FROM pg_temp.golf_preserved EXCEPT ALL','SELECT * FROM pg_temp.golf_preserved WHERE kind=\'matches\' EXCEPT ALL');
 const sql=`BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='100ms'; SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='20s'; SET LOCAL search_path=public;
${prepared}
-- golf-proof:rehearsal-start
${installed?'':patch}
${helpers}
${fixture}
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.golf_preserved_check();
SELECT pg_temp.golf_unchanged();
SELECT jsonb_build_object('unit','${name}','functions',(${functionSnapshot}),'catalog',(${catalogSnapshot}),'existing_matches_unchanged',true) candidate_evidence;
ROLLBACK;
${residualCheck(prefix)}
SELECT pg_temp.golf_preserved_check();
SELECT jsonb_build_object('unit','${name}','rollback_verified',true) rollback_evidence;
`;
 const wrapped=wrapUnit(sql);write(out+'/'+name+'.sql',wrapped);
 units.push({name,path:out+'/'+name+'.sql',sha256:createHash('sha256').update(wrapped).digest('hex')});
}
write(out+'/manifest.json',JSON.stringify({installed,patchHash:createHash('sha256').update(patch).digest('hex'),units},null,2));
console.log('Prepared',units.length,'rollback-only forward units:',out);
