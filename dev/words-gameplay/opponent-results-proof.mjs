import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8').replaceAll('\r\n','\n');
const candidate=process.argv.includes('--installed')?'':read('supabase/ptown-words/opponent-results-timer.sql');
let fa=read('dev/five-alive/privacy.rollback.proof.sql')
.replace("-- CANDIDATE_SQL",()=>candidate).replace("-- IDEMPOTENCE_SQL",()=>candidate).replace(/ROLLBACK;/g,'')
.replace("CASE WHEN j=jsonb_array_length(r->'guesses')-1 AND guess->>'word'=r->>'answer' THEN guess ELSE '{\"word\":\"\",\"feedback\":[]}'::jsonb END","jsonb_build_object('word',CASE WHEN j=0 THEN guess->>'word' ELSE '' END,'feedback',CASE WHEN j=0 AND guess->>'word'<>r->>'answer' THEN '[\"absent\",\"absent\",\"absent\",\"absent\",\"absent\"]'::jsonb ELSE guess->'feedback' END)");
let words=read('supabase/ptown-words/proof.sql')
.replace('mode int;tie_case int;','mode int;timer_on boolean;tie_case int;')
.replace(' FOR mode IN 0..1 LOOP FOR n',' FOR timer_on IN SELECT unnest(ARRAY[false,true]) LOOP\n FOR mode IN 0..1 LOOP FOR n')
.replaceAll("'ptown-words','{\"ante_amount\":5}',deadline","'ptown-words',jsonb_build_object('ante_amount',5,'words_timer_enabled',timer_on,'words_turn_seconds',120),deadline")
.replace("s->'rules'=private.ptown_words_rules()","s->'rules'=private.ptown_words_live_rules(jsonb_build_object('words_timer_enabled',timer_on,'words_turn_seconds',120))")
.replace(' END LOOP;END LOOP;END LOOP;',' END LOOP;END LOOP;END LOOP;END LOOP;\n timer_on:=true;')
.replace('INSERT INTO auth.users(id) VALUES(users[i]);INSERT INTO public.profiles','INSERT INTO auth.users(id) VALUES(users[i]);UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=users[i];INSERT INTO public.profiles');
mkdirSync('qualification.local',{recursive:true});
writeFileSync('qualification.local/opponent-results-timer-proof.sql',fa+'\n'+read('supabase/ptown-words/opponent-results-timer-proof.sql')+'\n'+words+'\nROLLBACK;\n');

