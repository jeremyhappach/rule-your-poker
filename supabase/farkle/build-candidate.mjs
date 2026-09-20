import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const baseline=JSON.parse(fs.readFileSync(path.join(root,'recovery/baseline.json'),'utf8'));
const hash=s=>crypto.createHash('md5').update(s).digest('hex');
const lit=s=>`'${s.replaceAll("'","''")}'`;
const patches={
 configure_dealer_game:[
  ["  INSERT INTO public.dealer_games(session_id,game_type,dealer_user_id,config)", "  IF p_game_type='farkle' OR v_game.game_type='farkle' THEN PERFORM private.farkle_claim_v1(p_game_id,v_game.current_game_uuid,NULL,'configure'); END IF;\n  INSERT INTO public.dealer_games(session_id,game_type,dealer_user_id,config)"],
  ["'horses','ship-captain-crew','yahtzee'", "'horses','ship-captain-crew','yahtzee','farkle'"],
  ["  ELSE\n    v_config := jsonb_build_object('ante_amount',v_ante);", "  ELSIF p_game_type='farkle' THEN\n    v_config := private.farkle_resolve_config_v1(v_game,p_config);\n  ELSE\n    v_config := jsonb_build_object('ante_amount',v_ante);"],
  ["pot=CASE WHEN p_game_type='cribbage' THEN 0", "pot=CASE WHEN p_game_type IN ('cribbage','farkle') THEN 0"],
 ],
 advance_ante_phase_exact:[["    WHEN v_game.game_type='yahtzee' THEN", "    WHEN v_game.game_type='farkle' THEN\n      SELECT private.farkle_begin_v1(p_game_id,p_expected_dealer_game_id) INTO v_start;\n    WHEN v_game.game_type='yahtzee' THEN"]],
 read_session_frame:[["       'yahtzee_state',CASE", "       'farkle_state',CASE WHEN r.farkle_state IS NULL THEN NULL ELSE r.farkle_state||jsonb_build_object('_authorityRevision',r.authority_revision,'_authorityScope',r.id) END,\n       'yahtzee_state',CASE"]],
 advance_due_canonical_game_timers:[["        WHEN 'horses_scc_turn' THEN", "        WHEN 'farkle_turn' THEN\n          v_result:=private.farkle_advance_due_v1(v_timer.round_id,clock_timestamp());\n        WHEN 'horses_scc_turn' THEN"]],
 set_automatic_play:[["deferred:=NOT p_enabled AND coalesce(p.auto_fold,false) AND g.game_type IN ('horses','ship-captain-crew')\n AND r.horses_state->>'currentTurnPlayerId'=p.id::text AND r.horses_state->>'gamePhase'='playing';", "deferred:=NOT p_enabled AND coalesce(p.auto_fold,false) AND ((g.game_type IN ('horses','ship-captain-crew')\n AND r.horses_state->>'currentTurnPlayerId'=p.id::text AND r.horses_state->>'gamePhase'='playing')\n OR (g.game_type='farkle' AND r.farkle_state->>'currentTurnPlayerId'=p.id::text AND r.farkle_state->>'gamePhase'='playing'));"]],
 consume_automatic_play_stop:[["AND (NEW.status='completed' OR NEW.horses_state->>'gamePhase' IS DISTINCT FROM 'playing'\n OR NEW.horses_state->>'currentTurnPlayerId' IS DISTINCT FROM id::text);", "AND (NEW.status='completed' OR CASE WHEN g.game_type='farkle' THEN\n (NEW.farkle_state->>'gamePhase' IS DISTINCT FROM 'playing' OR NEW.farkle_state->>'currentTurnPlayerId' IS DISTINCT FROM id::text)\n ELSE (NEW.horses_state->>'gamePhase' IS DISTINCT FROM 'playing' OR NEW.horses_state->>'currentTurnPlayerId' IS DISTINCT FROM id::text) END);"]],
 set_game_paused:[["   horses_state=private.shift_pause_timestamp", "   farkle_state=private.shift_pause_timestamp(farkle_state,ARRAY['turnDeadline'],duration),\n   horses_state=private.shift_pause_timestamp"]],
};
for(const name of ['configure_dealer_game','advance_ante_phase_exact','set_automatic_play','set_game_paused']) {
 patches[name].push(['DECLARE ',"DECLARE v_prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); "]);
 patches[name].push(['RETURN v_replay_return;',"PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;",true]);
}
patches.advance_ante_phase_exact.push(["  UPDATE public.players player\n     SET ante_decision=", "  IF v_game.game_type='farkle' THEN PERFORM private.farkle_claim_v1(v_game.id,v_game.current_game_uuid,NULL,'start'); END IF;\n  UPDATE public.players player\n     SET ante_decision="]);
patches.set_automatic_play.push([" deferred:=NOT p_enabled", " IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,r.dealer_game_id,r.id,'control'); END IF;\n deferred:=NOT p_enabled"]);
patches.set_game_paused.push([" FOREACH ctx IN ARRAY ARRAY['app.session_pause_write'", " IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'pause'); END IF;\n FOREACH ctx IN ARRAY ARRAY['app.session_pause_write'"]);
// Only patch the first (pre-write) loop; the second loop restores prior context.
patches.set_game_paused[patches.set_game_paused.length-1][0]+=',\'app.three_five_seven_authoritative_write\',\'app.cribbage_authoritative_write\',\'app.gin_rummy_authoritative_write\',\'app.yahtzee_authoritative_write\'] LOOP\n  prior:=';
patches.set_game_paused[patches.set_game_paused.length-1][1]+=',\'app.three_five_seven_authoritative_write\',\'app.cribbage_authoritative_write\',\'app.gin_rummy_authoritative_write\',\'app.yahtzee_authoritative_write\'] LOOP\n  prior:=';
const candidate=[];let apply='',restore=`-- Atomic recovery: exclusive ownership waits for all in-flight creators.\nSELECT pg_advisory_xact_lock(19092026,1);\nUPDATE private.farkle_release SET creation_enabled=false WHERE singleton;\nDO $gate$ BEGIN\n IF EXISTS(SELECT 1 FROM public.games WHERE game_type='farkle' AND status IN ('ante_decision','in_progress')) THEN RAISE EXCEPTION 'farkle:active_games_require_compatible_recovery'; END IF;\nEND $gate$;\n`;
for(const f of baseline.functions){
 if(hash(f.definition)!==f.md5)throw new Error(`Baseline fingerprint mismatch: ${f.name}`);
 let definition=f.definition;
 const applied=[];
 for(let [before,after,multiple] of patches[f.name]){
  if(!definition.includes(before) && definition.includes(before.replaceAll('\n','\r\n'))) { before=before.replaceAll('\n','\r\n');after=after.replaceAll('\n','\r\n'); }
  if(multiple ? definition.split(before).length<2 : definition.split(before).length!==2)throw new Error(`Patch anchor not unique: ${f.name}`);
  definition=definition.replaceAll(before,()=>after);
  applied.push([before,after]);
 }
 let restored=definition;
 for(const [before,after] of [...applied].reverse())restored=restored.replaceAll(after,()=>before);
 if(restored!==f.definition)throw new Error(`Existing path changed: ${f.name}`);
 const md5=hash(definition);
 candidate.push({...f,definition,md5,baseline_md5:f.md5});
 apply+=`DO $guard$ BEGIN IF md5(pg_get_functiondef(${lit(f.signature)}::regprocedure)) NOT IN (${lit(f.md5)},${lit(md5)}) THEN RAISE EXCEPTION 'farkle:shared_definition_drift:${f.name}'; END IF; END $guard$;\n${definition};\n`;
 restore+=`DO $guard$ BEGIN IF md5(pg_get_functiondef(${lit(f.signature)}::regprocedure)) NOT IN (${lit(f.md5)},${lit(md5)}) THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:${f.name}'; END IF; END $guard$;\n${f.definition};\nALTER FUNCTION ${f.signature} OWNER TO ${f.owner};\nREVOKE ALL ON FUNCTION ${f.signature} FROM PUBLIC,anon,authenticated,service_role;\n`;
 for(const acl of f.acl??[]){const role=acl.split('=')[0]||'PUBLIC';if(!/^[a-z_]+$/.test(role)&&role!=='PUBLIC')throw new Error('Unexpected grant role');restore+=`GRANT EXECUTE ON FUNCTION ${f.signature} TO ${role};\n`;}
}
fs.writeFileSync(path.join(root,'shared-dispatch.sql'),apply);
fs.writeFileSync(path.join(root,'recovery/restore-body.sql'),restore);
fs.writeFileSync(path.join(root,'recovery/restore-shared.sql'),`BEGIN ISOLATION LEVEL READ COMMITTED;\n${restore}\nCOMMIT;\n`);
fs.writeFileSync(path.join(root,'recovery/candidate.json'),JSON.stringify({checkpoint:baseline.checkpoint,functions:candidate},null,2)+'\n');
const sql=['write-authority-v1.sql','authority-v1.sql','configuration-v1.sql','shared-dispatch.sql'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
fs.writeFileSync(path.join(root,'candidate.sql'),sql);
console.log(JSON.stringify({sharedFunctions:candidate.length,existingBranchesTextPreserved:true,bytes:sql.length}));
