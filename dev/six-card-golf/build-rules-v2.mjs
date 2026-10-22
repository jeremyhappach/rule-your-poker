// Prepare a reviewable SQL candidate only. Does not connect to any database.
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
const source=name=>read('supabase/six-card-golf/'+name+'.sql','utf8').replaceAll('\r\n','\n');
const fn=(sql,name)=>{const start=sql.indexOf('CREATE OR REPLACE FUNCTION private.'+name+'(');assert(start>=0,name);const end=sql.indexOf('END $$;',start);assert(end>start,name);return sql.slice(start,end+7);};
const change=(s,from,to)=>{assert.equal(s.split(from).length,2,from);return s.replace(from,to);};
const presentation=source('presentation.candidate');
let supported=fn(presentation,'golf_supported_rules');
supported=change(supported,"IF r=private.golf_rules() THEN", "IF r IN (private.golf_rules(),private.golf_rules_v2()) THEN");
supported=change(supported,"r-'presentation'=private.golf_rules() AND", "r-'presentation' IN (private.golf_rules(),private.golf_rules_v2()) AND");
const admission=change(fn(presentation,'golf_admission_rules'),'RETURN private.golf_rules()','RETURN private.golf_rules_v2()');
const integrity=change(fn(source('rules'),'golf_integrity'),"s#>>'{rules,version}' IS DISTINCT FROM 'six-card-golf/1'", "NOT private.golf_supported_rules(s->'rules')");
let reducer=fn(presentation,'golf_reduce');
reducer=change(reducer,"PERFORM private.golf_integrity(s);RETURN s; -- Preserve the whole-turn deadline and progress counter.",`-- Latch on the draw, while its card is pending. The current turn still finishes normally.
  IF s#>>'{rules,version}'='six-card-golf/2' AND NOT already_final
    AND jsonb_array_length(s->'stock')=(SELECT count(*) FROM jsonb_each(s->'tableaus') t
      WHERE EXISTS(SELECT 1 FROM jsonb_array_elements_text(t.value->'exposed') e WHERE NOT e::boolean)) THEN
   s:=s||jsonb_build_object('stockFinalTrigger',actor);
  END IF;
  PERFORM private.golf_integrity(s);RETURN s; -- Preserve the whole-turn deadline.`);
reducer=change(reducer,"count_i:=CASE WHEN exposed_new THEN 0", "count_i:=CASE WHEN s#>>'{rules,version}'='six-card-golf/2' OR exposed_new THEN 0");
reducer=change(reducer,"ELSIF count_i>=5*n THEN",`ELSIF s#>>'{rules,version}'='six-card-golf/2' AND s->>'stockFinalTrigger'=actor THEN
  FOR i IN 1..n LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','stock_threshold');
 ELSIF s#>>'{rules,version}'='six-card-golf/1' AND count_i>=5*n THEN`);
reducer=change(reducer,"s:=s||jsonb_build_object('consecutiveNoRevealTurns',count_i", "s:=(s-'stockFinalTrigger')||jsonb_build_object('consecutiveNoRevealTurns',count_i");
const bots=change(fn(source('bots'),'golf_bot_choice'),"ELSIF (v->>'consecutiveNoRevealTurns')::integer>=", "ELSIF v#>>'{rules,version}'='six-card-golf/1' AND (v->>'consecutiveNoRevealTurns')::integer>=");
const rule=`CREATE OR REPLACE FUNCTION private.golf_rules_v2() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":"six-card-golf/2","holes":9,"turnSeconds":30,"openingCards":2,"finalTrigger":"stock_equals_concealed_players","holeResultSeconds":6}'::jsonb
$$;
REVOKE ALL ON FUNCTION private.golf_rules_v2() FROM PUBLIC,anon,authenticated;`;
write('supabase/six-card-golf/rules-v2.candidate.sql',`-- LOCAL REVIEW CANDIDATE ONLY. No migration applied or release flags changed.
-- /1 remains frozen. Only future admissions choose /2 after explicit publication.
-- Six exposed takes precedence if the triggering draw also completes the actor's tableau.
${[rule,supported,admission,integrity,reducer,bots].join('\n\n')}\n`);
console.log('Prepared rules-v2.candidate.sql; no database connection.');
