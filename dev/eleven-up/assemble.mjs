// Bounded adaptation of the accepted TriTowers ownership paths. Generated sources
// are checked in for review; no accepted game source is changed by this script.
import {readFile,writeFile} from 'node:fs/promises';
const source=await readFile('supabase/tri-towers/authority.sql','utf8');
const v2=await readFile('supabase/tri-towers/v2.sql','utf8');
const rename=s=>s.replaceAll('tri_towers','eleven_up').replaceAll('tri-towers','eleven-up').replaceAll('TriTowers','11 Up');
function fn(s,name){const start=s.search(new RegExp('CREATE (?:OR REPLACE )?FUNCTION '+name.replaceAll('.','\\.')+'\\('));if(start<0)throw Error(name);const end=s.indexOf('$$;',s.indexOf('AS $$',start))+3;return s.slice(start,end);}
let schema=rename(source.slice(0,source.indexOf('CREATE FUNCTION private.tri_towers_rules')));
schema=schema.replace('bot_due_at bigint,','').replace(/CREATE INDEX eleven_up_matches_due[^;]+;/,'').replace(/^[ \t]+$/gm,'');
let orchestration=rename(fn(v2,'private.tri_towers_deal')+'\n'+fn(v2,'private.tri_towers_reduce'))
 .replaceAll('eleven_up_board_deal_v2','eleven_up_board_deal').replaceAll('eleven_up_board_reduce_v2','eleven_up_board_reduce').replaceAll('eleven_up_bonus_qualified_v2','eleven_up_bonus_qualified')
 .replace(/ IF s#>>'\{rules,version\}'<>[^\n]+\n/g,'').replaceAll('idx integer','items integer[]').replaceAll(',action,idx,',',action,items,');
// Progression uses the persisted due time, so delayed recovery cannot grant time.
orchestration=orchestration.replace("'stage',round_i),at_ms)","'stage',round_i),(s->>'deadline')::bigint)");
let owners=rename(['private.tri_towers_publish','public.tri_towers_snapshot','public.tri_towers_history','private.tri_towers_settle','public.tri_towers_action','public.tri_towers_configure','public.tri_towers_close','private.tri_towers_pause'].map(n=>fn(source,n)).join('\n\n'));
owners=owners.replaceAll('p_index integer DEFAULT NULL','p_items integer[] DEFAULT NULL').replaceAll("'index',p_index","'items',p_items").replaceAll(',p_action,p_index,',',p_action,p_items,')
 .replace("('start','remove','draw','continue','give_up','take_score')","('group','pass','continue','take_score')");
owners=owners.replace(" IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 7", " IF EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'eleven_up:bots_not_supported';END IF;\n IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 7");
owners=owners.replace("state=jsonb_set(state,'{deadline}',to_jsonb((state->>'deadline')::bigint+at_ms-paused_at))", "state=state||jsonb_build_object('deadline',(state->>'deadline')::bigint+at_ms-paused_at)||CASE WHEN state ? 'startedAt' THEN jsonb_build_object('startedAt',(state->>'startedAt')::bigint+at_ms-paused_at) ELSE '{}'::jsonb END");
owners=owners.replace('DECLARE m private.eleven_up_matches; viewer uuid; paused boolean;', 'DECLARE m private.eleven_up_matches; viewer uuid; paused boolean; balances jsonb; batch public.gameplay_transfer_batches; result_id uuid;')
 .replace(' SELECT is_paused INTO paused FROM public.games WHERE id=m.game_id;', ` SELECT is_paused INTO paused FROM public.games WHERE id=m.game_id;
 IF m.settlement IS NOT NULL THEN
  SELECT jsonb_object_agg(player_id::text,chips) INTO balances FROM public.session_player_snapshots WHERE dealer_game_id=p_dealer_game_id;
 ELSE SELECT jsonb_object_agg(id::text,chips) INTO balances FROM public.players WHERE game_id=m.game_id;END IF;
 SELECT * INTO batch FROM public.gameplay_transfer_batches WHERE dealer_game_id=p_dealer_game_id ORDER BY cursor DESC LIMIT 1;
 SELECT id INTO result_id FROM public.game_results WHERE dealer_game_id=p_dealer_game_id AND settlement_key='eleven_up_terminal';`)
 .replace("'finished',m.finished)","'finished',m.finished,'pausedAt',m.paused_at,'financial',jsonb_build_object('balances',coalesce(balances,'{}'::jsonb),'resultId',result_id,'batch',CASE WHEN batch.id IS NOT NULL THEN to_jsonb(batch) ELSE NULL END))");
let tail=rename(source.slice(source.indexOf('-- Explicit grants only.'))).replace('text,integer),','text,integer[]),');
tail+=`\nCREATE TRIGGER eleven_up_publish AFTER INSERT OR UPDATE ON private.eleven_up_matches FOR EACH ROW EXECUTE FUNCTION private.eleven_up_publish();\n`;
const recover=`CREATE FUNCTION private.eleven_up_recover() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate record;m private.eleven_up_matches;g public.games;at_ms bigint;count_i integer:=0;i integer;
BEGIN
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 FOR candidate IN SELECT dealer_game_id,game_id,round_id FROM private.eleven_up_matches WHERE NOT finished AND settlement IS NULL AND paused_at IS NULL AND (state->>'deadline')::bigint<=at_ms ORDER BY (state->>'deadline')::bigint LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=candidate.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO g FROM public.games WHERE id=candidate.game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR g.real_money IS DISTINCT FROM false OR g.is_paused OR g.status<>'in_progress' OR g.game_type IS DISTINCT FROM 'eleven-up' OR g.current_game_uuid IS DISTINCT FROM candidate.dealer_game_id THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=candidate.dealer_game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL THEN CONTINUE;END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  FOR i IN 1..64 LOOP
   EXIT WHEN m.state->>'phase'='complete' OR (m.state->>'deadline')::bigint>at_ms;
   m.state:=private.eleven_up_reduce(m.state,'tick',NULL,(m.state->>'deadline')::bigint);
  END LOOP;
  UPDATE private.eleven_up_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
  IF m.state->>'phase'='complete' THEN PERFORM private.eleven_up_settle(m.dealer_game_id);END IF;count_i:=count_i+1;
 END LOOP;RETURN count_i;
END $$;`;
await writeFile('supabase/eleven-up/multiplayer.sql',schema+'\n'+orchestration+'\n'+owners+'\n'+recover+'\n'+tail);
let arcade=rename(await readFile('supabase/arcade/tri-towers.sql','utf8')).replaceAll('arcade_tri','arcade_eleven').replace('accepted multiplayer v2 core','shared eleven-up/1 core')
 .replaceAll('eleven_up_board_deal_v2','eleven_up_board_deal').replaceAll('eleven_up_board_reduce_v2','eleven_up_board_reduce').replaceAll('eleven_up_bonus_qualified_v2','eleven_up_bonus_qualified')
 .replaceAll('p_index integer DEFAULT NULL','p_items integer[] DEFAULT NULL').replaceAll('p_action,p_index','p_action,p_items').replaceAll('text,integer,uuid','text,integer[],uuid')
 .replaceAll("('remove','draw','take_score','abandon')","('group','pass','take_score','abandon')").replace('1..6 LOOP','1..12 LOOP').replaceAll('eleven-up/2','eleven-up/1');
arcade=arcade.replace("ARRAY['rules','phase','cards','removed','waste','run','score','deadline','event','stockRemaining']", "ARRAY['rules','phase','slots','current','exposed','passSlot','canPass','groups','score','deadline','event','stockRemaining']");
arcade=arcade.replace("(b->>'deadline')::bigint-(run.config->>'holdMs')::bigint","(result->>'completedAt')::bigint");
await writeFile('supabase/eleven-up/arcade.sql',arcade);
const defs=JSON.parse(await readFile('qualification.local/eleven-up/arcade-definitions.json','utf8'));
const start=defs.find(x=>x.proname==='arcade_start').definition.replace("('run21','tri-towers')","('run21','tri-towers','eleven-up')");
const commit=defs.find(x=>x.proname==='arcade_commit').definition.replace(" IF run.game='tri-towers'", " IF run.game='eleven-up' AND status_i='completed' AND private.arcade_eleven_valid_completion(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;\n IF run.game='tri-towers'");
await writeFile('supabase/eleven-up/arcade-registration.sql','-- Existing owner definitions: only new game admission/validation branches added.\n'+start+';\n'+commit+';\n');
