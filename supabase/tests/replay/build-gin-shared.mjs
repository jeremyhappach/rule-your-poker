// Exact deployed owners; no new locks and no externally callable wrapper owners.
import {readFileSync,writeFileSync} from 'node:fs';
const defs=JSON.parse(readFileSync('artifacts/replay-baseline/functions.json','utf8'));
const names=new Set(['request_session_end','session_leave','session_take_seat','create_session_bot','set_game_paused','set_session_player_intent','set_automatic_play','transfer_session_host','settle_gameplay_chip_transfers','stand_up_and_resolve_postgame','prepare_session_dealer_selection','complete_session_dealer_selection','reconcile_session_abandonment','finalize_settled_session_if_no_active_humans']);
names.add('begin_session_dealer_selection');
const out=[];
for(const def of defs.filter(d=>names.has(d.name))){
 let sql=def.definition;
 const lock=/SELECT\s+\*\s+INTO\s+(\w+)\s+FROM\s+public\.games[\s\S]*?FOR UPDATE[^;]*;/g;
 const matches=[...sql.matchAll(lock)];
 if(!matches.length && def.name==='set_game_paused') continue; // Delegating two-argument overload.
 if(matches.length!==1) throw Error(`Expected one existing game lock: ${def.schema}.${def.name}`);
 const game=matches[0][1]; const source=`${def.schema}.${def.name}`;
 const args=def.args.split(',').map(x=>x.trim().split(' ')[0]);
 const operands=`jsonb_build_object(${args.flatMap(x=>[`'${x}'`,x]).join(',')})`;
 const returns=sql.match(/RETURNS\s+(\w+)/i)[1];
 sql=sql.replace(/\bDECLARE\b/,`DECLARE v_replay_shared jsonb; v_replay_return ${returns};`);
 // Evaluate return expressions before capturing, including nested owner calls.
 sql=sql.replace(/\bRETURN\s+([^;]+);/g,(_,expression)=>`v_replay_return := ${expression};\n PERFORM private.replay_gin_shared_end_v1(v_replay_shared,${operands},to_jsonb(v_replay_return));\n RETURN v_replay_return;`);
 sql=sql.replace(matches[0][0],matches[0][0]+`\n IF FOUND THEN\n  IF ${game}.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(${game}.id,'${source}'); END IF;\n  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.\n END IF;`);
 if(def.name==='prepare_session_dealer_selection') {
  const anchor='    v_remaining := v_winners;';
  if(sql.split(anchor).length!==2) throw Error('Dealer compound anchor drift');
  sql=sql.replace(anchor,`    IF v_replay_shared IS NOT NULL THEN
      v_replay_shared:=jsonb_set(v_replay_shared,'{dealerDrawRounds}',coalesce(v_replay_shared->'dealerDrawRounds','[]')||jsonb_build_array(v_cards));
    END IF;\n`+anchor);
 }
 out.push(sql+';');
}
writeFileSync('supabase/tests/replay/gin-shared-writers-v1.draft.sql',out.join('\n'));
console.log(`Generated ${out.length} Gin-guarded shared owners.`);
