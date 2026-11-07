import {readFileSync as read,writeFileSync as write} from 'node:fs';
const owners=JSON.parse(read('dev/originals-competition/installed-current.json','utf8'));
const source=name=>owners.find(f=>f.name===name).definition;
const replace=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Changed reference: '+a);return s.replace(a,()=>b);};
const clone=s=>s.replaceAll('mega_live','originals_live').replaceAll('mega:','originals:');
let schema=read('supabase/mega-card-golf/competition-schema.sql','utf8');
schema=clone(schema.slice(schema.indexOf('CREATE TABLE private.mega_live_matches'),schema.indexOf('CREATE FUNCTION private.mega_live_guard')));
schema=schema.replaceAll("(SELECT live_enabled FROM private.mega_competition_release WHERE singleton)","(SELECT bool_and(live_enabled) FROM private.originals_release)");
schema=schema.replaceAll("d.game_type='mega-card-golf'","d.game_type IN('crib-lab','chucky-showdown')");
schema=schema.replace(/CREATE FUNCTION private.originals_live_supported_rules[\s\S]*?\$\$;/,()=>`CREATE FUNCTION private.originals_live_supported_rules(rules jsonb) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT rules->>'game' IN('crib-lab','chucky-showdown') AND rules->>'rounds'='3' AND EXISTS(SELECT FROM private.arcade_rulesets WHERE game=rules->>'game' AND id=rules->>'ruleset' AND config=rules->'gameplay')
$$;`);
let configure=clone(source('public.mega_configure')).replace('public.mega_configure','public.originals_configure');
configure=configure.replace("p_game_type IS DISTINCT FROM 'mega-card-golf'","p_game_type NOT IN('crib-lab','chucky-showdown')").replaceAll('NOT BETWEEN 2 AND 8','NOT BETWEEN 2 AND 7');
configure=replace(configure,"IF p_config ? 'holes' AND p_config->'holes' NOT IN ('3'::jsonb,'6'::jsonb,'9'::jsonb,'18'::jsonb) THEN RAISE EXCEPTION 'originals:holes';END IF;", "IF (p_config-ARRAY['ante_amount'])<>'{}'::jsonb THEN RAISE EXCEPTION 'originals:configuration';END IF;\n IF g.real_money AND NOT EXISTS(SELECT FROM private.originals_release WHERE game=p_game_type AND live_real_qualified) THEN RAISE EXCEPTION 'originals:real_money_closed';END IF;");
configure=configure.replaceAll("'mega-card-golf'","p_game_type");
configure=replace(configure,"private.mega_competition_config(p_config->'mega')||jsonb_build_object('holes',coalesce(p_config#>'{mega,course,holes}','9'::jsonb))","private.originals_config(p_game_type)");
let begin=clone(source('private.mega_live_begin')).replaceAll('NOT BETWEEN 2 AND 8','NOT BETWEEN 2 AND 7');
begin=begin.replace("g.game_type IS DISTINCT FROM 'mega-card-golf'","g.game_type NOT IN('crib-lab','chucky-showdown')");
begin=begin.replace("'hole',1","'round',1").replace("'holes','[]'::jsonb","'rounds','[]'::jsonb");
let settle=clone(source('private.mega_live_settle'));
settle=settle.replaceAll("g.game_type IS DISTINCT FROM 'mega-card-golf'","g.game_type IS DISTINCT FROM m.state#>>'{rules,game}'")
 .replaceAll("m.state->'holes'","m.state->'rounds'").replace("coalesce((m.state#>>'{rules,holes}')::integer,9)","3")
 .replaceAll('min(value::integer)','max(value::integer)').replaceAll('min(value::bigint)','max(value::bigint)')
 .replace("'originals_live_terminal','mega-card-golf'","'originals_live_terminal',m.state#>>'{rules,game}'")
 .replace("'Mega Card Golf: '","(m.state#>>'{rules,game}')||': '").replace("last_round_result='Mega Card Golf complete'","last_round_result=(m.state#>>'{rules,game}')||' complete'");
let finish=clone(source('private.mega_live_finish_postgame')).replace("g.game_type IS DISTINCT FROM 'mega-card-golf'","g.game_type IS DISTINCT FROM m.state#>>'{rules,game}'");
let roster=clone(source('private.mega_live_roster_guard')).replaceAll("='mega-card-golf'"," IN('crib-lab','chucky-showdown')");
const parts=[schema,configure,begin,settle,finish,roster];
for(const [name,from,to] of [
 ['private.advance_ante_phase_exact',"WHEN v_game.game_type='mega-card-golf' THEN","WHEN v_game.game_type IN('crib-lab','chucky-showdown') THEN\n      SELECT private.originals_live_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;\n    WHEN v_game.game_type='mega-card-golf' THEN"],
 ['private.megatouch_frozen_stake',"'mega-card-golf'","'mega-card-golf','crib-lab','chucky-showdown'"]
]){const f=owners.find(f=>f.name===name);parts.push(`DO $$BEGIN IF md5(pg_get_functiondef('${f.signature}'::regprocedure))<>'${f.hash}' THEN RAISE EXCEPTION 'originals:owner_changed:${name}';END IF;END $$;\n`+replace(f.definition,from,to));}
parts.push("CREATE TRIGGER originals_live_roster_guard BEFORE UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION private.originals_live_roster_guard();");
const recover=owners.find(f=>f.name==='private.delayed_words_recover');
const anchor="AND NOT EXISTS(SELECT FROM private.mega_live_matches";
const wake="AND NOT EXISTS(SELECT FROM private.originals_live_matches WHERE NOT finished AND paused_at IS NULL AND CASE WHEN settlement IS NULL THEN (state->>'deadline')::bigint ELSE (state#>>'{terminal,deadline}')::bigint END<=floor(extract(epoch FROM clock_timestamp())*1000)) ";
parts.push(`DO $$BEGIN IF md5(pg_get_functiondef('${recover.signature}'::regprocedure))<>'${recover.hash}' THEN RAISE EXCEPTION 'originals:recovery_owner_changed';END IF;END $$;\n`+replace(recover.definition,anchor,wake+anchor));
write('supabase/originals-competition/live-foundation.sql',parts.join('\n;\n')+';\n');
console.log('Prepared sequential live foundation from inspected Mega owners');
