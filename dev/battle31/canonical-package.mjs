import {execFileSync} from 'node:child_process';
import {writeFileSync as write} from 'node:fs';
const get=p=>execFileSync('git',['show','20e84efbc:'+p],{encoding:'utf8'}).replaceAll('\r\n','\n');
const replace=(s,a,b)=>{if(!s.includes(a))throw Error('Missing patch anchor '+a);return s.split(a).join(b);};
let rules=get('supabase/battle31/rules.sql');
rules=replace(rules,'"introMs":1200,"holdMs":4000','"introMs":1800,"holdMs":8000,"presentationVersion":2');
const scoring=`CREATE OR REPLACE FUNCTION private.battle31_scoring_cards(hand jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 WITH cards AS (SELECT value::int card,i FROM jsonb_array_elements_text(hand) WITH ORDINALITY x(value,i)),
 best AS (SELECT card/8 suit FROM cards GROUP BY card/8 ORDER BY sum(CASE WHEN card%8=7 THEN 11 WHEN card%8>=3 THEN 10 ELSE card%8+7 END) DESC,card/8 LIMIT 1)
 SELECT jsonb_agg(card ORDER BY i) FROM cards WHERE (SELECT count(DISTINCT card%8)=1 FROM cards) OR card/8=(SELECT suit FROM best)
$$;
`;
rules=replace(rules,'CREATE OR REPLACE FUNCTION private.battle31_resolve',scoring+'CREATE OR REPLACE FUNCTION private.battle31_resolve');
rules=replace(rules,'loser int;result jsonb;','loser int;result jsonb;prior_losses jsonb:=s->\'losses\';');
rules=replace(rules,"'reason',reason,'losses',s->'losses'","'reason',reason,'losses',s->'losses','previousLosses',prior_losses,'scoringCards',jsonb_build_array(private.battle31_scoring_cards(s->'hands'->0),private.battle31_scoring_cards(s->'hands'->1))");
rules=replace(rules," IF greatest((s->'losses'->>0)::int",` IF s#>>'{rules,presentationVersion}'='2' THEN
  s:=s||jsonb_build_object('presentation',jsonb_build_object('version',2,'startedAt',at_ms,'revealAt',at_ms+350,'announceAt',at_ms+700,'lifeAt',at_ms+5100,'clearAt',at_ms+6900,'finishAt',at_ms+8000));
 END IF;
 IF greatest((s->'losses'->>0)::int`);
rules=replace(rules,"'deadline',at_ms+4000","'deadline',at_ms+coalesce((s#>>'{rules,holdMs}')::bigint,4000)");
rules=replace(rules,"'deadline',at_ms+1200,'result',NULL","'deadline',at_ms+coalesce((s#>>'{rules,introMs}')::bigint,1200),'dealStartedAt',at_ms,'dealerIndex',1-first_i,'moves','[]'::jsonb,'knock',NULL,'presentation',NULL,'result',NULL");
rules=replace(rules,'at_ms+15000',"at_ms+coalesce((s#>>'{rules,turnMs}')::bigint,15000)");
rules=replace(rules,' -- Track only publicly witnessed',` IF s#>>'{rules,presentationVersion}'='2' THEN
  IF action IN('swap','take_pot') THEN
   s:=s||jsonb_build_object('moves',coalesce(s->'moves','[]')||jsonb_build_array(jsonb_build_object('id',(s->>'dealId')||':'||turn_i,'at',at_ms,'actor',actor,'action',action,'pairs',
    CASE WHEN action='swap' THEN jsonb_build_array(jsonb_build_object('handIndex',own_slot,'centerIndex',center_slot,'out',items[1],'in',items[2]))
    ELSE (SELECT jsonb_agg(jsonb_build_object('handIndex',i,'centerIndex',i,'out',old_hand->i,'in',hand->i) ORDER BY i) FROM generate_series(0,2) i) END)));
  ELSIF action='pass' AND NOT (s->>'closing')::boolean AND turn_i<=6 THEN
   s:=s||jsonb_build_object('knock',jsonb_build_object('id',(s->>'dealId')||':knock','at',at_ms,'actor',actor,'responder',opponent));
  END IF;
 END IF;
 -- Track only publicly witnessed`);
let multi=get('supabase/battle31/multiplayer.sql');
const configOld="'rules',private.battle31_rules()", configNew="'rules',private.battle31_rules()||jsonb_build_object('turnMs',1000*greatest(1,coalesce((SELECT decision_timer_seconds FROM public.game_defaults WHERE game_type='battle-31'),15))))";
// The original expression already closes jsonb_build_object: replace only its inner value.
multi=replace(multi,configOld,configNew.slice(0,-1));
const startOld="'startedAt',floor(extract(epoch FROM clock_timestamp())*1000)::bigint,'deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+3000";
const startNew="'startedAt',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,finishAt}')::bigint,0)),'deadline',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,finishAt}')::bigint,0))+3000";
multi=replace(multi,startOld,startNew);
const pauseOld="state=state||jsonb_build_object('deadline',(state->>'deadline')::bigint+at_ms-paused_at)";
const pauseNew="state=state||CASE WHEN state->'presentation' IS NOT NULL AND state->'presentation'<>'null'::jsonb THEN jsonb_build_object('presentation',(SELECT jsonb_object_agg(key,CASE WHEN key='version' THEN value ELSE to_jsonb(value::bigint+at_ms-paused_at) END) FROM jsonb_each(state->'presentation'))) ELSE '{}'::jsonb END||CASE WHEN state?'dealStartedAt' THEN jsonb_build_object('dealStartedAt',(state->>'dealStartedAt')::bigint+at_ms-paused_at) ELSE '{}'::jsonb END||jsonb_build_object('deadline',(state->>'deadline')::bigint+at_ms-paused_at)";
multi=replace(multi,pauseOld,pauseNew);
write('supabase/battle31/rules.sql',rules);write('supabase/battle31/multiplayer.sql',multi);
const selected=['battle31_rules','battle31_scoring_cards','battle31_resolve','battle31_deal','battle31_reduce'];
const definitions=[...rules.matchAll(/CREATE OR REPLACE FUNCTION private\.(\w+)[\s\S]*?\$\$;/g)].filter(x=>selected.includes(x[1])).map(x=>x[0]);
if(definitions.length!==5)throw Error('definition extraction');
const guard=`DO $$ BEGIN
 IF md5(pg_get_functiondef('private.battle31_reduce(jsonb,text,integer[],bigint)'::regprocedure))<>'1fb686ed6f3b171da0ff436a8940067e' THEN RAISE EXCEPTION 'battle31:rules_owner_drift';END IF;
END $$;`;
const patch=(signature,a,b)=>`DO $patch$ DECLARE d text; old text:=$old$${a}$old$; BEGIN d:=pg_get_functiondef('${signature}'::regprocedure);IF position(old IN d)=0 THEN RAISE EXCEPTION 'battle31:owner_drift:${signature}';END IF;EXECUTE replace(d,old,$new$${b}$new$);END $patch$;`;
const migration=[guard,...definitions,patch('public.battle31_configure(uuid,uuid,integer,text,jsonb,timestamptz)',configOld,configNew.slice(0,-1)),patch('private.battle31_settle(uuid)',startOld,startNew),patch('private.battle31_pause()',pauseOld,pauseNew),"REVOKE ALL ON FUNCTION private.battle31_scoring_cards(jsonb) FROM PUBLIC,anon,authenticated,service_role;", "UPDATE public.game_defaults SET presentation_mode='table' WHERE game_type='battle-31';"].join('\n');
write('supabase/battle31/canonical-table.sql',migration+'\n');
write('supabase/migrations/20261025200500_battle31_canonical_table.sql',migration+'\n');
console.log('Prepared canonical table forward migration');
