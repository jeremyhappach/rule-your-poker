import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const read=f=>fs.readFileSync(root+f,'utf8');
const write=(f,s)=>fs.writeFileSync(root+f,s);
const lit=s=>`'${s.replaceAll("'","''")}'`;
const md5=s=>crypto.createHash('md5').update(s).digest('hex');
const capture=JSON.parse(read('capture.json'));
const f=capture.functions.find(f=>f.signature==='private.advance_due_canonical_game_timers(integer)');
const qualified=JSON.parse(read('../recovery/candidate.json')).functions.find(f=>f.name==='advance_due_canonical_game_timers');
if(md5(f.definition)!==f.md5 || f.md5!==qualified.md5 || f.owner!==qualified.owner
 || f.acl!==`{${qualified.acl.join(',')}}`) throw Error('Capture differs from qualified Wave 1');
const anchor="        WHEN 'farkle_turn' THEN";
const addition="        WHEN 'farkle_postgame' THEN\n          v_result:=public.farkle_advance_postgame(\n            v_timer.game_id,v_timer.round_id,v_timer.dealer_game_id,v_timer.hand_number\n          );\n";
if(f.definition.split(anchor).length!==2)throw Error('Dispatch anchor not unique');
const definition=f.definition.replace(anchor,addition+anchor);
if(definition.replace(addition,'')!==f.definition)throw Error('Existing paths changed');
const candidateHash=md5(definition);
const attrs=`pg_get_userbyid(p.proowner)=${lit(f.owner)} AND p.prosecdef=${f.security_definer} AND p.proconfig=ARRAY[${f.config.map(lit)}]::text[] AND p.proacl::text=${lit(f.acl)} AND p.provolatile=${lit(f.volatility)} AND p.proparallel=${lit(f.parallel)} AND p.proleakproof=${f.leakproof} AND p.proisstrict=${f.strict}`;
const condition=hashes=>`EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=${lit(f.signature)}::regprocedure AND md5(pg_get_functiondef(p.oid)) IN (${hashes.map(lit).join(',')}) AND ${attrs})`;
const guard=`DO $guard$ BEGIN IF NOT ${condition([f.md5,candidateHash])} THEN RAISE EXCEPTION 'farkle_wave2:shared_metadata_drift'; END IF; END $guard$;\n`;
const gate=`DO $gate$ BEGIN IF NOT EXISTS(SELECT 1 FROM private.farkle_release WHERE singleton AND NOT creation_enabled AND admin_only AND NOT production_defaults_approved) OR EXISTS(SELECT 1 FROM public.game_defaults WHERE game_type='farkle') THEN RAISE EXCEPTION 'farkle_wave2:release_gate_changed'; END IF; END $gate$;\n`;
const candidate=guard+gate+read('authority.sql')+'\n'+definition+';\n';
write('candidate.sql',candidate);
// Lock existing Farkle timer rows before the creation/continuation advisory lock:
// workers already hold timer rows when dispatching. No other game's rows are locked.
const quiesce=`SELECT id FROM private.game_timer_registry WHERE timer_kind='farkle_postgame' AND state IN ('scheduled','processing') ORDER BY due_at,id FOR UPDATE;\nSELECT pg_advisory_xact_lock(19092026,1);\nUPDATE private.farkle_release SET creation_enabled=false WHERE singleton;\nUPDATE private.farkle_postgame_control_v2 SET enabled=false WHERE singleton;\nDO $active$ BEGIN IF EXISTS(SELECT 1 FROM public.games WHERE game_type='farkle' AND status IN ('ante_decision','in_progress','game_over')) THEN RAISE EXCEPTION 'farkle_wave2:active_games_require_compatible_recovery'; END IF; END $active$;\nUPDATE private.game_timer_registry SET state='cancelled',completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE timer_kind='farkle_postgame' AND state IN ('scheduled','processing');\n`;
let grants=`ALTER FUNCTION ${f.signature} OWNER TO ${f.owner};\nREVOKE ALL ON FUNCTION ${f.signature} FROM PUBLIC,anon,authenticated,service_role;\n`;
for(const g of f.grants){
 if(!/^[a-z_]+$/.test(g.grantee) && g.grantee!=='PUBLIC')throw Error('Unsupported role');
 if(g.grantor!==f.owner || g.privilege!=='EXECUTE')throw Error('Unsupported grant');
 grants+=`GRANT EXECUTE ON FUNCTION ${f.signature} TO ${g.grantee}${g.grantable?' WITH GRANT OPTION':''};\n`;
}
const restore=guard+quiesce+f.definition+';\n'+grants+`DO $verify$ BEGIN IF NOT ${condition([f.md5])} THEN RAISE EXCEPTION 'farkle_wave2:restoration_metadata_mismatch'; END IF; END $verify$;\n`;
write('restore-body.sql',restore);
write('restore-shared.sql',`BEGIN ISOLATION LEVEL READ COMMITTED;\nSET LOCAL lock_timeout='5s';\n${restore}COMMIT;\n`);
write('manifest.json',JSON.stringify({qualifiedWave1Commit:capture.qualifiedWave1Commit,appliedWave1Migration:capture.appliedWave1Migration,sharedFunction:f.signature,baselineMd5:f.md5,candidateMd5:candidateHash,existingBranchesTextPreserved:true,owner:f.owner,securityDefiner:f.security_definer,config:f.config,grants:f.grants,migration:'20260921143129_farkle_wave2_postgame.sql'},null,2)+'\n');
write('../../migrations/20260921143129_farkle_wave2_postgame.sql',candidate);
const regressionFiles=['seven_game_pause_rollback_proof.sql','rule_configuration_authority_rollback_proof.sql','ante_decision_authority_boundary_rollback_proof.sql','final_player_authority_rollback_proof.sql','canonical_game_timer_rollback_proof.sql'];
const regression=phase=>regressionFiles.map(file=>`SAVEPOINT existing_games;\n${file.startsWith('ante_')?"SELECT set_config('app.three_five_seven_test_no_sweep','on',true);":''}\n${read('../../tests/'+file).replace(/^BEGIN;\s*/,'').replace(/ROLLBACK;\s*$/,'')}\nROLLBACK TO existing_games;\nRELEASE existing_games;\nSELECT pg_temp.farkle_assert(true,${lit(phase+': '+file)});\n`).join('\n');
const metadata=(hash,phase)=>`SELECT pg_temp.farkle_assert(${condition([hash])},${lit(phase+': definition owner security attributes grants')});\n`;
const handoffProof=fs.existsSync(root+'handoff-proof.sql')?read('handoff-proof.sql'):'';
const hardening=read('../hardening-proof.sql').replace('-- RECOVERY_ACTIVE_CASE',`denied:=false; BEGIN EXECUTE ${lit(restore)}; EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle_wave2:active_games_require_compatible_recovery'; END; PERFORM pg_temp.farkle_assert(denied AND (SELECT creation_enabled FROM private.farkle_release WHERE singleton),'Wave2 recovery blocks active game atomically');`);
const wave1metadata=JSON.parse(read('../recovery/candidate.json')).functions.filter(x=>x.name!=='advance_due_canonical_game_timers').map(x=>`SELECT pg_temp.farkle_assert((SELECT md5(pg_get_functiondef(p.oid))=${lit(x.md5)} AND pg_get_userbyid(p.proowner)=${lit(x.owner)} AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=ARRAY[${[...x.acl].sort().map(lit).join(',')}]::text[] FROM pg_proc p WHERE p.oid=${lit(x.signature)}::regprocedure),${lit('Wave1 unchanged: '+x.name)});`).join('\n');
if(fs.existsSync(root+'proof.sql')){
 const proof=`BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='90s';\n${candidate}\n${read('../proof.sql')}\n${hardening}\n${wave1metadata}\n${metadata(candidateHash,'candidate')}\n${regression('candidate')}\n${read('proof.sql')}\n${handoffProof}\n${restore}\n${metadata(f.md5,'recovery 1')}\n${regression('recovery')}\n${candidate}\n${metadata(candidateHash,'reinstalled candidate')}\n${restore}\n${metadata(f.md5,'recovery 2')}\nSELECT pg_temp.farkle_assert((SELECT count(*)=1 FROM private.farkle_postgame_receipts_v2 WHERE game_id=(SELECT game_id FROM farkle_postgame_history_fixture)),'recovery preserves additive receipt history');\n${candidate}\n${metadata(candidateHash,'final candidate')}\nSELECT pg_temp.farkle_postgame_cleanup();\n${gate}\nSELECT jsonb_build_object('passed',true,'assertions',(SELECT count(*) FROM farkle_proof_log),'cases',(SELECT jsonb_agg(case_name ORDER BY case_name) FROM farkle_proof_log)) AS proof;\nROLLBACK;\n`;
 write('rollback-proof.sql',proof);
 write('post-apply-proof.sql',proof.replace(candidate,gate));
}
console.log(JSON.stringify({baseline:f.md5,candidate:candidateHash,existingBranchesTextPreserved:true}));
