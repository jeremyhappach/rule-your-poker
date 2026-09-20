import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const lit=s=>`'${s.replaceAll("'","''")}'`;
const baseline=JSON.parse(read('recovery/baseline.json'));
const candidate=JSON.parse(read('recovery/candidate.json'));
function metadata(manifest,phase){return manifest.functions.map(f=>`SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))=${lit(f.md5)} AND pg_get_userbyid(p.proowner)=${lit(f.owner)} AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY[${[...f.acl].sort().map(lit).join(',')}]::text[] FROM pg_proc p WHERE p.oid=${lit(f.signature)}::regprocedure),${lit(phase+': definition owner grants '+f.name)});`).join('\n');}
const regressionFiles=['seven_game_pause_rollback_proof.sql','rule_configuration_authority_rollback_proof.sql','ante_decision_authority_boundary_rollback_proof.sql','final_player_authority_rollback_proof.sql'];
const regression=phase=>regressionFiles.map(file=>{
 const sql=read('../tests/'+file).replace(/^BEGIN;\s*/,'').replace(/ROLLBACK;\s*$/,'');
 // The ante proof specifically tests entering an active first hand. Reuse the
 // existing 357 authority proof's fixture control to exclude a random instant
 // sweep; keep every original assertion. SAVEPOINT rollback removes the flag.
 const fixture=file==='ante_decision_authority_boundary_rollback_proof.sql'
  ? "SELECT set_config('app.three_five_seven_test_no_sweep','on',true);" : '';
 return `SAVEPOINT existing_games;\n${fixture}\n${sql}\nROLLBACK TO existing_games;\nRELEASE existing_games;\nSELECT pg_temp.farkle_assert(true,${lit(phase+': '+file)});\n`;
}).join('\n');
const restore=read('recovery/restore-body.sql');
const hardening=read('hardening-proof.sql').replace('-- RECOVERY_ACTIVE_CASE',()=>`denied:=false;
 BEGIN EXECUTE ${lit(restore)}; EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:active_games_require_compatible_recovery'; END;
 PERFORM pg_temp.farkle_assert(denied AND (SELECT creation_enabled FROM private.farkle_release WHERE singleton),'recovery aborts atomically while an active Farkle exists');`);
fs.writeFileSync(path.join(root,'rollback-proof.sql'),`BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='90s';
${read('candidate.sql')}
${read('proof.sql')}
${hardening}
${metadata(candidate,'candidate')}
${regression('candidate')}
${restore}
${metadata(baseline,'recovery 1')}
DO $disabled$ DECLARE denied boolean:=false; BEGIN
 BEGIN PERFORM private.farkle_resolve_config_v1(NULL::public.games,'{}'); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:creation_disabled'; END;
 PERFORM pg_temp.farkle_assert(denied,'creator after recovery sees disabled gate');
END $disabled$;
${restore}
${metadata(baseline,'recovery 2')}
${regression('restored')}
SELECT jsonb_build_object('passed',true,'cases',(SELECT jsonb_agg(case_name ORDER BY case_name) FROM farkle_proof_log),'recovery_restored_twice',true) AS proof;
ROLLBACK;
`);
// Verify the deployed candidate directly: do not reinstall it before exercising
// authority, recovery and existing-game proofs. All recovery DDL rolls back.
const rollback=read('rollback-proof.sql');
const candidateSql=read('candidate.sql');
if(rollback.split(candidateSql).length!==2)throw new Error('Candidate boundary must be unique');
const deployedGate=`DO $deployed_gate$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.farkle_release WHERE singleton AND admin_only
   AND NOT creation_enabled AND NOT production_defaults_approved)
 OR EXISTS(SELECT 1 FROM public.game_defaults WHERE game_type='farkle')
 THEN RAISE EXCEPTION 'farkle:unsafe_deployed_release_gate'; END IF;
END $deployed_gate$;`;
fs.writeFileSync(path.join(root,'post-apply-proof.sql'),rollback.replace(candidateSql,deployedGate));
