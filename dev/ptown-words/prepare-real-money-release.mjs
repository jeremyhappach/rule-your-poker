import {readFileSync as read,writeFileSync as write} from 'node:fs';
const dir='qualification.local/ptown-words/real-money';
const pre=JSON.parse(read('dev/ptown-words/real-money-release-preimage.json','utf8'));
const owners=['ptown_words_configure(uuid,uuid,integer,text,jsonb,timestamp with time zone)','ptown_words_capabilities(uuid)','private.megatouch_begin(uuid,uuid)'];
const guards=owners.map(s=>`IF md5(pg_get_functiondef('${s}'::regprocedure)) IS DISTINCT FROM '${pre.functions.find(f=>f.signature===s).md5}' THEN RAISE EXCEPTION 'Words real preimage changed: ${s}';END IF;`).join('\n');
const migration=`SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';\nDO $guard$ BEGIN ${guards} END $guard$;\n`+read('supabase/ptown-words/real-money.candidate.sql','utf8').replace(/^-- Isolated preparation only[^\n]*\n--[^\n]*\n/,'-- Approved live human real-money admission; installed closed.\n');
const core=read('supabase/ptown-words/core-proof.sql','utf8');
let proof=read(dir+'/financial-proof.sql','utf8').slice(core.length);
// This dedicated final recovery fixture now proves real-money zero-client recovery.
const split=proof.indexOf('-- Durable recovery');const end=proof.indexOf('DROP TRIGGER words_proof_fail_transfer');
proof=proof.slice(0,split)+proof.slice(split,end).replace("VALUES(game,'game_selection',false,2", "VALUES(game,'game_selection',true,2")+proof.slice(end);
const guardsProof=read('supabase/ptown-words/real-money-admission-proof.sql','utf8');
const preservation=pre.functions.filter(f=>!owners.includes(f.signature)).map(f=>`IF md5(pg_get_functiondef('${f.signature}'::regprocedure)) IS DISTINCT FROM '${f.md5}' THEN RAISE EXCEPTION 'Preserved Words/canonical function changed: ${f.signature}';END IF;`).join('\n');
const tail=`DO $preserved$ BEGIN ${preservation} END $preserved$;\nROLLBACK;\nSELECT jsonb_build_object('fixtures_removed',NOT EXISTS(SELECT FROM public.profiles WHERE username LIKE 'Words money proof %' OR username LIKE 'Words proof %' OR username LIKE 'Words banks proof %'),'release',(SELECT to_jsonb(r) FROM private.ptown_words_release r),'health',private.evaluate_real_money_liveness(NULL)) evidence;`;
write(dir+'/release-migration.sql',migration);
write(dir+'/hosted-candidate.sql','BEGIN;\n'+migration+'\n'+core+'\n'+guardsProof+'\n'+proof+'\n'+tail);
write(dir+'/hosted-installed.sql',"BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';\n"+core+'\n'+guardsProof+'\n'+proof+'\n'+tail);
console.log('Prepared closed migration, current-authority guards and complete rollback proofs');
