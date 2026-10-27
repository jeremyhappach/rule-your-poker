import {readFileSync as read,writeFileSync as write} from 'node:fs';
const contract=JSON.parse(read('dev/ptown-words/bot-contract.json','utf8'));
let registration="ALTER TABLE private.ptown_words_release ADD COLUMN bots_enabled boolean NOT NULL DEFAULT false;\n";
for(const name of ['ptown_words_configure','megatouch_begin']){
 const f=contract.functions.find(f=>f.name===name);let source=f.definition;
 if(name==='ptown_words_configure')source=source.replace("IF EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'ptown_words:humans_only';END IF;","IF EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) AND (g.real_money IS DISTINCT FROM false OR NOT EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND bots_enabled)) THEN RAISE EXCEPTION 'ptown_words:bots_fake_money_only';END IF;");
 else source=source.replace("IF EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) OR NOT EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND enabled AND admission_enabled)","IF (EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) AND (g.real_money IS DISTINCT FROM false OR NOT EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND bots_enabled))) OR NOT EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND enabled AND admission_enabled)");
 if(source===f.definition)throw Error('Missing preimage '+name);
 registration+=`DO $guard$ BEGIN IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='${name}' AND n.nspname='${name==='megatouch_begin'?'private':'public'}') IS DISTINCT FROM '${f.md5}' THEN RAISE EXCEPTION 'Ptown Words bot preimage changed: ${name}';END IF;END $guard$;\n`+source+';\n';
}
let recovery=read('supabase/boxdrop/recovery.sql','utf8').replaceAll('\r\n','\n').replaceAll('boxdrop','ptown_words');
recovery=recovery.replace('BEGIN\n IF NEW.finished',"BEGIN\n IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.state->'players') p WHERE NOT coalesce((p->>'isBot')::boolean,false)) THEN\n  RAISE EXCEPTION 'ptown_words:human_required';\n END IF;\n IF NEW.finished");
recovery=recovery.replace("m.state:=private.ptown_words_reduce(m.state,choice->>'action',ARRAY(SELECT value::integer FROM jsonb_array_elements_text(choice->'items')),at_ms);","m.state:=private.ptown_words_reduce(m.state,choice->>'action',choice->'items',at_ms);");
recovery=recovery.replace('choice:=private.ptown_words_bot_choice(private.ptown_words_visible(m.state),at_ms);',"IF g.real_money IS DISTINCT FROM false THEN CONTINUE;END IF;\n   choice:=private.ptown_words_bot_choice(private.ptown_words_visible(m.state,actor::text),at_ms);");
recovery=recovery.replace("  IF (m.state->>'deadline')::bigint<=at_ms THEN", "  IF private.pause_all_humans_auto_fold(g.id) THEN CONTINUE;END IF;\n  IF (m.state->>'deadline')::bigint<=at_ms THEN");
// Ptown Words advances only one expired turn and gives the successor a fresh clock.
recovery=recovery.replace("   FOR i IN 1..64 LOOP\n EXIT WHEN m.state->>'phase'='complete' OR (m.state->>'deadline')::bigint>at_ms;\n m.state:=private.ptown_words_reduce(m.state,'tick',NULL,(m.state->>'deadline')::bigint);\n END LOOP;", "   m.state:=private.ptown_words_reduce(m.state,'tick',NULL,at_ms);");
if(recovery.includes('FOR i IN 1..64'))throw Error('Unexpected timeout loop preimage');
recovery=recovery.replaceAll("'ptown_words'","'ptown-words'").replace('LIMIT 20 LOOP','LIMIT 2 LOOP');
// One recovery implementation, with an exact-match entry for contained proofs
// and operational recovery. The existing scheduled no-argument entry delegates.
recovery=recovery.replace('FUNCTION private.ptown_words_recover()','FUNCTION private.ptown_words_recover(p_dealer_game_id uuid)');
recovery=recovery.replace("WHERE NOT work.finished AND", "WHERE (p_dealer_game_id IS NULL OR work.dealer_game_id=p_dealer_game_id) AND NOT work.finished AND");
recovery=recovery.replace("WHERE NOT finished AND settlement IS NOT NULL", "WHERE (p_dealer_game_id IS NULL OR dealer_game_id=p_dealer_game_id) AND NOT finished AND settlement IS NOT NULL");
recovery=recovery.replace('private.ptown_words_recover() FROM', 'private.ptown_words_recover(uuid) FROM');
recovery+="\nCREATE OR REPLACE FUNCTION private.ptown_words_recover() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.ptown_words_recover(NULL::uuid) $$;\nREVOKE ALL ON FUNCTION private.ptown_words_recover() FROM PUBLIC,anon,authenticated,service_role;\n";
write('supabase/ptown-words/bot-registration.sql',registration);write('supabase/ptown-words/bot-recovery.sql',recovery);
write('qualification.local/ptown-words/bot-migration.sql',"SET LOCAL lock_timeout='100ms';\nSET LOCAL statement_timeout='30s';\n"+registration+read('supabase/ptown-words/bots.sql','utf8')+'\n'+recovery);
console.log('Prepared bot migration; admission remains closed for bots');
