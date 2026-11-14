import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildSync} from 'esbuild';
const baseline=JSON.parse(read('dev/chess/bots-installed.json','utf8')).definitions;
const get=name=>baseline.find(d=>d.name===name).definition;
const replace=(text,from,to)=>{if(!text.includes(from)||text.indexOf(from)!==text.lastIndexOf(from))throw Error('Ambiguous source: '+from);return text.replace(from,to);};
const guard=baseline.filter(d=>d.name!=='private.chess_sync').map(d=>`IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname||'.'||p.proname='${d.name}') IS DISTINCT FROM '${createHash('md5').update(d.definition).digest('hex')}' THEN RAISE EXCEPTION 'chess:bot_baseline_changed ${d.name}'; END IF;`).join('\n');
let seed=get('private.chess_seed');
seed=replace(seed,"jsonb_array_length(s->'players')<>2 OR EXISTS(SELECT FROM jsonb_array_elements(s->'players') p WHERE (p->>'isBot')::boolean)","jsonb_array_length(s->'players')<>2 OR NOT EXISTS(SELECT FROM jsonb_array_elements(s->'players') p WHERE NOT (p->>'isBot')::boolean) OR (EXISTS(SELECT FROM jsonb_array_elements(s->'players') p WHERE (p->>'isBot')::boolean) AND (mode_i<>'live' OR NOT EXISTS(SELECT FROM private.chess_release WHERE singleton AND bots_enabled)))");
let configure=get('public.chess_configure');
configure=replace(configure,"IF coalesce(g.pot,0)<>0",`IF EXISTS(SELECT FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) THEN PERFORM private.chess_bot_health();END IF;
 IF coalesce(g.pot,0)<>0`);
configure=replace(configure,"jsonb_build_object('ante_amount',stake_i,'rules',private.chess_rules())",`jsonb_build_object('ante_amount',stake_i,'rules',private.chess_rules())||CASE WHEN EXISTS(SELECT FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) THEN jsonb_build_object('bot',jsonb_build_object('version','ptown-chess-bot/1','difficulty',(SELECT chess_bot_difficulty FROM public.game_defaults WHERE game_type='chess'))) ELSE '{}'::jsonb END`);
let begin=get('private.megatouch_begin');
begin=replace(begin,"s:=private.chess_seed(s,'live'",`IF EXISTS(SELECT FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) THEN
    IF g.real_money IS DISTINCT FROM false OR NOT EXISTS(SELECT FROM private.chess_release WHERE singleton AND bots_enabled) OR NOT EXISTS(SELECT FROM jsonb_array_elements(people)p WHERE NOT (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'chess:bots_fake_money_only';END IF;
    PERFORM private.chess_bot_health();
    IF dg.config#>>'{bot,version}' IS DISTINCT FROM 'ptown-chess-bot/1' OR coalesce(dg.config#>>'{bot,difficulty}','') NOT IN ('easy','medium','expert') THEN RAISE EXCEPTION 'chess:bot_difficulty';END IF;
    s:=s||jsonb_build_object('bot',dg.config->'bot');
   END IF;
   s:=private.chess_seed(s,'live'`);
let commit=get('public.chess_commit');
commit=replace(commit,'public.chess_commit(', 'private.chess_commit_impl(');
commit=replace(commit,'p_fingerprint jsonb)','p_fingerprint jsonb, p_bot boolean)');
commit=replace(commit,'PERFORM private.chess_authorize(p_mode,p_id,p_actor);PERFORM private.chess_sync(p_mode,p_id);',`IF NOT p_bot THEN PERFORM private.chess_authorize(p_mode,p_id,p_actor);
 ELSIF p_mode<>'live' THEN RAISE EXCEPTION 'chess:bot_mode';END IF;
 PERFORM private.chess_sync(p_mode,p_id);`);
commit=replace(commit,"row_i:=private.chess_record(p_mode,p_id,p_actor);before_s:=row_i->'state';",`row_i:=private.chess_record(p_mode,p_id,CASE WHEN p_bot THEN NULL ELSE p_actor END);before_s:=row_i->'state';
 IF p_bot THEN
  IF NOT EXISTS(SELECT FROM private.chess_matches m JOIN public.games g ON g.id=m.game_id JOIN public.players p ON p.game_id=g.id WHERE m.dealer_game_id=p_id AND p.id=p_actor AND p.is_bot AND g.real_money=false)
    OR NOT EXISTS(SELECT FROM jsonb_array_elements(before_s->'players') p WHERE p->>'id'=p_actor::text AND (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'chess:bot_actor';END IF;
  row_i:=row_i||jsonb_build_object('viewerId',p_actor);
 END IF;`);
commit=replace(commit,"IF p_state->'identity'", "IF p_state->'bot' IS DISTINCT FROM before_s->'bot' THEN RAISE EXCEPTION 'chess:bot_config_changed';END IF;\n IF p_state->'identity'");
const wrapper=`CREATE OR REPLACE FUNCTION public.chess_commit(p_mode text,p_id uuid,p_actor uuid,p_revision bigint,p_state jsonb,p_request uuid,p_fingerprint jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.chess_commit_impl(p_mode,p_id,p_actor,p_revision,p_state,p_request,p_fingerprint,false) $$;
REVOKE ALL ON FUNCTION private.chess_commit_impl(text,uuid,uuid,bigint,jsonb,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;`;
const sql=`-- Guarded forward migration; bot admission stays closed until worker qualification.
DO $$ BEGIN ${guard} END $$;
ALTER TABLE public.game_defaults ADD COLUMN chess_bot_difficulty text NOT NULL DEFAULT 'medium' CHECK(chess_bot_difficulty IN ('easy','medium','expert'));
ALTER TABLE private.chess_release DROP CONSTRAINT chess_release_bots_enabled_check;
${read('supabase/chess/bot-recovery.sql','utf8')}
${seed};\n${configure};\n${begin};\n${commit};\n${wrapper}
NOTIFY pgrst,'reload schema';`;
write('supabase/chess/bots.candidate.sql',sql);
mkdirSync('qualification.local/chess-bots',{recursive:true});
buildSync({entryPoints:['supabase/functions/chess-recovery/index.ts'],outfile:'qualification.local/chess-bots/worker.js',bundle:true,platform:'neutral',mainFields:['module','main'],format:'esm',target:'es2022'});
console.log('Prepared guarded Chess bot candidate and bundled worker.');
