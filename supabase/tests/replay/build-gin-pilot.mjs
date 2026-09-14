// Generates a qualification patch from inspected deployed owner definitions.
// Exact anchors must match once. This script never connects to a database.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const definitions = JSON.parse(readFileSync('artifacts/replay-baseline/functions.json', 'utf8'));
function owner(schema, name) {
  const matches = definitions.filter(d => d.schema === schema && d.name === name);
  if (matches.length !== 1) throw new Error(`Expected one ${schema}.${name}`);
  return matches[0].definition;
}
function replace(sql, before, after) {
  if (sql.split(before).length !== 2) throw new Error(`Owner anchor drift: ${before.slice(0, 100)}`);
  return sql.replace(before, after);
}
const originals = [owner('public', 'start_gin_rummy_initial_hand'), owner('private', 'gin_apply_action_core')];
writeFileSync('artifacts/replay-baseline/gin-owner-hashes.json', JSON.stringify(originals.map(sql => ({
  name: sql.match(/FUNCTION ([^(]+)/)[1], md5: createHash('md5').update(sql).digest('hex'),
})), null, 2));
let opening = originals[0];
opening = replace(opening,
  "UPDATE public.games SET status='in_progress',current_round=1,total_hands=1,pot=0,is_first_hand=true WHERE id=_game_id;",
  "UPDATE public.games SET status='in_progress',current_round=1,total_hands=1,pot=0,is_first_hand=true WHERE id=_game_id RETURNING * INTO v_game;\n  IF v_game.replay_contract_version=1 THEN\n    PERFORM private.replay_gin_open_v1(v_game,v_round,v_state,v_dealer_config);\n  END IF;");
let action = originals[1];
action = replace(action, '  v_state jsonb;', '  v_state jsonb;\n  v_replay_before jsonb;\n  v_replay_middle jsonb;\n  v_replay_context jsonb;\n  v_replay_prior_root text := current_setting(\'app.replay_gin_action_root\',true);');
action = replace(action,
  'SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=_round_id FOR UPDATE;',
  'SELECT state,replay_context_v1 INTO v_state,v_replay_context FROM private.gin_rummy_round_states WHERE round_id=_round_id FOR UPDATE;');
action = replace(action, "  IF _action='take_first_draw' THEN", "  IF v_game.replay_contract_version=1 THEN v_replay_before := v_state; END IF;\n\n  IF _action='take_first_draw' THEN");
action = replace(action, '  PERFORM private.gin_publish_state(_round_id,v_state);',
 "  IF v_game.replay_contract_version=1 THEN\n    PERFORM set_config('app.replay_gin_edges','',true);\n    PERFORM set_config('app.replay_gin_action_root',_round_id::text,true);\n  END IF;\n  PERFORM private.gin_publish_state(_round_id,v_state);");
action = replace(action, "    ELSE\n      v_opponent := v_state->>'nonDealerPlayerId';",
  "    ELSE\n      IF v_game.replay_contract_version=1 THEN\n        v_replay_middle := jsonb_set(v_state,'{firstDrawPassed}',v_state->'firstDrawPassed'||jsonb_build_array(_player_id),true);\n        v_replay_middle := jsonb_set(v_replay_middle,'{lastAction}',jsonb_build_object('type','pass_first_draw','playerId',_player_id,'timestamp',v_now),true);\n      END IF;\n      v_opponent := v_state->>'nonDealerPlayerId';");
action = replace(action, "  RETURN jsonb_build_object('outcome','applied','state',v_state);",
  "  IF v_game.replay_contract_version=1 THEN\n    PERFORM private.replay_gin_transition_v1(v_replay_context,v_replay_before,v_state,_player_id,_action,coalesce(v_actual_card,_card),_meld_index,v_replay_middle);\n    PERFORM set_config('app.replay_gin_action_root',coalesce(v_replay_prior_root,''),true);\n  END IF;\n  RETURN jsonb_build_object('outcome','applied','state',v_state);");
let settlement = owner('public', 'gin_rummy_settle_game_legacy');
settlement = replace(settlement,'DECLARE','DECLARE\n v_replay_standalone_context jsonb; v_replay_standalone_state jsonb;');
// Ordered semantic boundaries are captured from the authority's own working
// state. They are serialized as deltas by one enclosing append, never replayed
// by running today's Gin logic.
action = replace(action,
 "    v_opponent := CASE WHEN _player_id::text=v_state->>'dealerPlayerId' THEN v_state->>'nonDealerPlayerId' ELSE v_state->>'dealerPlayerId' END;",
 "    IF v_game.replay_contract_version=1 THEN v_replay_middle:=jsonb_build_array(jsonb_build_object('type','card_discarded','state',v_state)); END IF;\n    v_opponent := CASE WHEN _player_id::text=v_state->>'dealerPlayerId' THEN v_state->>'nonDealerPlayerId' ELSE v_state->>'dealerPlayerId' END;");
action = replace(action,
 "    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'melds'],v_group->'melds',true);\n    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'deadwood'],v_group->'deadwood',true);",
 "    IF v_game.replay_contract_version=1 THEN v_replay_middle:=jsonb_build_array(jsonb_build_object('type','card_laid_off','state',v_state)); END IF;\n    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'melds'],v_group->'melds',true);\n    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'deadwood'],v_group->'deadwood',true);");
action = replace(action,"    v_state := private.gin_score_state(v_state,v_round.dealer_game_id);",
 "    IF v_game.replay_contract_version=1 THEN v_replay_middle:=jsonb_build_array(jsonb_build_object('type',_action,'state',v_state)); END IF;\n    v_state := private.gin_score_state(v_state,v_round.dealer_game_id);");
settlement = replace(settlement, '  GET DIAGNOSTICS v_updated_player_count = ROW_COUNT;',
  '  GET DIAGNOSTICS v_updated_player_count = ROW_COUNT;\n  PERFORM private.replay_gin_note_transfer_v1(v_game,v_loser_id,v_winner_id,v_payout_amount,v_result_id);');
settlement = replace(settlement,"  RETURN jsonb_build_object(\n    'status', 'settled',",
 "  IF v_game.replay_contract_version=1 AND coalesce(current_setting('app.replay_gin_action_root',true),'')<>p_round_id::text AND coalesce(current_setting('app.replay_gin_settlement_root',true),'')<>p_round_id::text THEN\n    SELECT state,replay_context_v1 INTO v_replay_standalone_state,v_replay_standalone_context FROM private.gin_rummy_round_states WHERE round_id=p_round_id;\n    PERFORM private.replay_gin_transition_v1(v_replay_standalone_context,v_replay_standalone_state,v_replay_standalone_state,NULL,'settlement',NULL,NULL);\n  END IF;\n  RETURN jsonb_build_object(\n    'status', 'settled',");
let continuation = owner('private', 'gin_start_next_hand_core');
continuation = replace(continuation,
  'UPDATE public.games SET current_round=1,total_hands=v_hand_number,is_first_hand=false WHERE id=v_previous.game_id;',
  "UPDATE public.games SET current_round=1,total_hands=v_hand_number,is_first_hand=false WHERE id=v_previous.game_id RETURNING * INTO v_game;\n  IF v_game.replay_contract_version=1 THEN\n    PERFORM private.replay_gin_open_v1(v_game,v_next,v_next_state,(SELECT config FROM public.dealer_games WHERE id=v_next.dealer_game_id));\n  END IF;");
let postgame = owner('public', 'gin_rummy_advance_postgame');
postgame = replace(postgame,
  "  RETURN jsonb_build_object('outcome','advanced','deduped',false,'status',v_target,",
  "  IF v_game.replay_contract_version=1 THEN\n    PERFORM private.replay_gin_postgame_v1(_game_id,_round_id,jsonb_build_object('status',v_target,'dealerPosition',v_next_dealer));\n  END IF;\n  RETURN jsonb_build_object('outcome','advanced','deduped',false,'status',v_target,");
let settlementWrapper = owner('public', 'gin_rummy_settle_game');
settlementWrapper = replace(settlementWrapper,'  v_state jsonb;','  v_state jsonb;\n  v_replay_context jsonb;\n  v_replay_prior_settlement text:=current_setting(\'app.replay_gin_settlement_root\',true);');
settlementWrapper = replace(settlementWrapper,'  v_result := public.gin_rummy_settle_game_legacy(p_game_id,p_round_id,p_dealer_game_id,p_hand_number);',
 "  IF v_replay_context IS NOT NULL THEN PERFORM set_config('app.replay_gin_settlement_root',p_round_id::text,true); END IF;\n  v_result := public.gin_rummy_settle_game_legacy(p_game_id,p_round_id,p_dealer_game_id,p_hand_number);\n  IF v_replay_context IS NOT NULL THEN PERFORM set_config('app.replay_gin_settlement_root',coalesce(v_replay_prior_settlement,''),true); END IF;");
settlementWrapper = replace(settlementWrapper,'SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=p_round_id FOR UPDATE;',
 'SELECT state,replay_context_v1 INTO v_state,v_replay_context FROM private.gin_rummy_round_states WHERE round_id=p_round_id FOR UPDATE;');
settlementWrapper = replace(settlementWrapper,'  RETURN v_result;',
 "  IF v_replay_context IS NOT NULL AND v_result->>'status'='settled' AND coalesce(current_setting('app.replay_gin_action_root',true),'')<>p_round_id::text THEN\n    PERFORM private.replay_gin_transition_v1(v_replay_context,v_state,v_state,NULL,'settlement',NULL,NULL);\n  END IF;\n  RETURN v_result;");
writeFileSync('supabase/tests/replay/gin-writers-v1.draft.sql', '-- Qualification only; enrollment is disabled outside synthetic fixtures.\n'+opening+';\n'+action+';\n'+settlement+';\n'+settlementWrapper+';\n'+continuation+';\n'+postgame+';\n');
console.log('Generated six guarded Gin writer definitions.');
