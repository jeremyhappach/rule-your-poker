// Assemble bounded rollback-only SQL. This script never connects to production.
import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {createHash} from 'node:crypto';
import {connect,context,body} from './human-ready-local.mjs';
const out='qualification.local/eleven-up-timeout/';
const pre=JSON.parse(read(out+'smoke-production-preflight.json'))[0].preflight;
const sql=read('supabase/eleven-up/smoke-controls.sql','utf8');
assert.equal(createHash('sha256').update(sql).digest('hex'),'01d79eea3a187446f31e7ed8193b9c92c9fa6a33d776ff033accb9ffb71546c7');
const c=await connect(context().database);
try {
 // Prove the captured production scheduler is the exact pre-patch owner.
 await c.query('BEGIN');
 const ready=read('supabase/eleven-up/human-ready.sql','utf8');
 const source=ready.slice(ready.indexOf('CREATE OR REPLACE FUNCTION private.eleven_up_schedule_bot()'),ready.indexOf('-- Canonical player flags'));
 await c.query(source);
 const d=(await c.query("SELECT pg_get_functiondef('private.eleven_up_schedule_bot()'::regprocedure) d")).rows[0].d;
 assert.equal(d.replaceAll('\r\n','\n'),pre.functions.find(f=>f.signature==='private.eleven_up_schedule_bot()').definition.replaceAll('\r\n','\n'));
 await c.query('ROLLBACK');
}finally{await c.end();}
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const guard='DO $parity$ BEGIN '+pre.functions.map(f=>`IF md5(replace(pg_get_functiondef(${quote(f.signature)}::regprocedure),chr(13)||chr(10),chr(10)))<>${quote(createHash('md5').update(f.definition.replaceAll('\r\n','\n')).digest('hex'))} THEN RAISE EXCEPTION 'smoke:production_drift:${f.signature}';END IF;`).join('\n')+' END $parity$;\n';
let base=read('qualification.local/eleven-up-bots/installed-proof.sql','utf8');
const financialEnd=base.indexOf('DO $$ DECLARE u uuid:=');
assert(financialEnd>0);base=base.slice(0,financialEnd); // Unchanged Add Bot admission uses retained release evidence.
const preserved=`CREATE TEMP TABLE smoke_owners ON COMMIT DROP AS SELECT p.oid,pg_get_functiondef(p.oid) definition,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public') AND p.proname NOT IN ('eleven_up_schedule_bot','eleven_up_expiry_control');
CREATE TEMP TABLE smoke_defaults ON COMMIT DROP AS SELECT * FROM public.game_defaults;
CREATE TEMP TABLE smoke_gates ON COMMIT DROP AS SELECT 'eleven' name,to_jsonb(r) v FROM private.eleven_up_release r UNION ALL SELECT 'race',to_jsonb(r) FROM private.race_poker_release r UNION ALL SELECT 'battle',to_jsonb(r) FROM private.battle31_release r;
CREATE TEMP TABLE smoke_existing_matches ON COMMIT DROP AS SELECT 'eleven' name,dealer_game_id,md5(to_jsonb(m)::text) hash FROM private.eleven_up_matches m UNION ALL SELECT 'race',dealer_game_id,md5(to_jsonb(m)::text) FROM private.race_poker_matches m UNION ALL SELECT 'battle',dealer_game_id,md5(to_jsonb(m)::text) FROM private.battle31_matches m;
CREATE TEMP TABLE smoke_fixture_users(id uuid) ON COMMIT PRESERVE ROWS;
`;
// Recording the generated identities outside the proof transaction lets the
// post-rollback query verify all new control fixtures disappeared.
const ids=Array.from({length:12},(_,i)=>`'${crypto.randomUUID()}'::uuid`);
const controls=read('dev/eleven-up/smoke-hosted-controls.sql','utf8').replace('u:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];',`u:=(ARRAY[${ids.join(',')}])[(CASE WHEN real_mode THEN 6 ELSE 0 END+CASE WHEN late_rpc THEN 3 ELSE 0 END+1):(CASE WHEN real_mode THEN 6 ELSE 0 END+CASE WHEN late_rpc THEN 3 ELSE 0 END+3)];`);
const preservation=`DO $preserve$ BEGIN
 PERFORM pg_temp.money_assert(NOT EXISTS(SELECT 1 FROM smoke_owners s JOIN pg_proc p ON p.oid=s.oid WHERE pg_get_functiondef(s.oid) IS DISTINCT FROM s.definition OR p.proacl IS DISTINCT FROM s.proacl),'other owners/ACLs unchanged');
 PERFORM pg_temp.money_assert(NOT EXISTS((TABLE public.game_defaults EXCEPT TABLE smoke_defaults) UNION ALL (TABLE smoke_defaults EXCEPT TABLE public.game_defaults)),'defaults unchanged');
 PERFORM pg_temp.money_assert(NOT EXISTS((TABLE smoke_gates EXCEPT SELECT 'eleven',to_jsonb(r) FROM private.eleven_up_release r EXCEPT SELECT 'race',to_jsonb(r) FROM private.race_poker_release r EXCEPT SELECT 'battle',to_jsonb(r) FROM private.battle31_release r)),'admission unchanged');
 PERFORM pg_temp.money_assert(NOT EXISTS(SELECT 1 FROM bot_existing_balances b LEFT JOIN public.players p USING(id) WHERE p.id IS NULL OR p.chips IS DISTINCT FROM b.chips),'existing balances unchanged');
 PERFORM pg_temp.money_assert(NOT EXISTS(SELECT 1 FROM smoke_existing_matches s LEFT JOIN (SELECT 'eleven' name,dealer_game_id,md5(to_jsonb(m)::text) hash FROM private.eleven_up_matches m UNION ALL SELECT 'race',dealer_game_id,md5(to_jsonb(m)::text) FROM private.race_poker_matches m UNION ALL SELECT 'battle',dealer_game_id,md5(to_jsonb(m)::text) FROM private.battle31_matches m) a USING(name,dealer_game_id) WHERE a.hash IS DISTINCT FROM s.hash),'existing matches unchanged');
 PERFORM pg_temp.money_assert((SELECT count(*)=6 FROM money_evidence),'six financial cases');
END $preserve$;
ROLLBACK;
SELECT jsonb_build_object('passed',true,'financialCases',6,'timeoutControlCases',4,'existingBalancesOwnersAndAdmissionPreserved',true,'residualControlUsers',(SELECT count(*) FROM auth.users WHERE id=ANY(ARRAY[${ids}]))) smoke_evidence;
`;
// Retain the existing financial proof's post-rollback fixture checks.
const financialReceipt=read('qualification.local/eleven-up-bots/installed-proof.sql','utf8').split('ROLLBACK;').at(-1);
const insertion='CREATE TEMP TABLE bot_existing_balances';
for(const installed of [false,true]){
 let result=base.replace(insertion,()=>preserved+(installed?'':guard+body(sql)+'\n')+insertion)+controls+preservation+financialReceipt;
 assert(!/^\s*COMMIT\s*;/im.test(result));
 write(out+(installed?'smoke-installed.sql':'smoke-candidate.sql'),result);
}
console.log('Generated bounded candidate/installed rollback proofs; scheduler parity passed.');
