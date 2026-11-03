// Generates one rollback-contained MCP payload. Never connects or changes health.
import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const installed=process.argv.includes('--installed');
let matrix=read('supabase/mega-card-golf/competition-proof.sql','utf8');
matrix=matrix.replace('INSERT INTO auth.users(id) VALUES(users[i]);',`INSERT INTO auth.users(id,raw_app_meta_data) VALUES(users[i],'{"mega_synthetic":true}');INSERT INTO private.mega_test_accounts(user_id,expires_at) VALUES(users[i],clock_timestamp()+interval '1 hour');`)
 .replace(/ UPDATE private\.(mega_competition_release|delayed_words_health|delayed_recovery_state|delayed_release) SET[^;]+;\r?\n/g,'')
 .replace(/ PERFORM pg_temp\.mega_assert\(EXISTS\(SELECT FROM jsonb_array_elements\(public\.delayed_capabilities\(\)->'games'\)[^\n]+\n/,'')
 .replace('FOR money_i IN 0..1','FOR money_i IN 0..0')
 .replace('  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot)',"  INSERT INTO private.mega_test_live(game_id,user_id,expires_at) SELECT g,users[x],clock_timestamp()+interval '1 hour' FROM generate_series(1,n)x;\n  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot)")
 .replace("PERFORM set_config('request.jwt.claim.role','service_role',true);UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';PERFORM set_config('request.jwt.claim.role','authenticated',true);",'');
if(/UPDATE private\.(delayed_.*(?:health|state|release)|game_recovery_dispatch_state)|SET live_enabled=true/.test(matrix))throw Error('Unsafe shared-state mutation in hosted proof');
const candidate=read('supabase/mega-card-golf/competition.candidate.sql','utf8');
const sql="BEGIN; SET LOCAL lock_timeout='100ms'; SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='20s';\n"+
 (installed?'':candidate+'\n')+matrix+'\n'+read('supabase/mega-card-golf/qualification-proof.sql','utf8')+
 "\nSET CONSTRAINTS ALL IMMEDIATE; ROLLBACK;\nSELECT jsonb_build_object('passed',true,'registration',to_regclass('private.mega_competition_release')::text,'synthetic_accounts_remaining',(SELECT count(*) FROM auth.users WHERE raw_app_meta_data->>'mega_synthetic'='true')) AS evidence;";
const out='qualification.local/mega-competition/hosted-'+(installed?'installed':'candidate')+'.sql';mkdirSync('qualification.local/mega-competition',{recursive:true});write(out,sql);
console.log(JSON.stringify({out,sha256:createHash('sha256').update(sql).digest('hex'),bytes:sql.length,installed,fakeMoneyOnly:true}));
