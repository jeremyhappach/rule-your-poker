// Package the qualified checkpoint; no database access and no other game writer.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root='supabase/tests/replay/';
const read=name=>readFileSync(root+name,'utf8');
const qualified=read('gin-writers-v1.draft.sql');
let writers=qualified.replace("pot=0,is_first_hand=true WHERE id=_game_id RETURNING", "pot=0,is_first_hand=true,replay_contract_version=1 WHERE id=_game_id RETURNING")
 .replace("total_hands=v_hand_number,is_first_hand=false WHERE id=v_previous.game_id RETURNING", "total_hands=v_hand_number,is_first_hand=false,replay_contract_version=1 WHERE id=v_previous.game_id RETURNING");
if(writers===qualified || (writers.match(/replay_contract_version=1 WHERE/g)||[]).length!==2) throw Error('Enrollment anchors drifted');
let shared=read('gin-shared-writers-v1.draft.sql');
shared=shared.replace(/IF (\w+)\.replay_contract_version=1 THEN v_replay_shared/g,"IF $1.replay_contract_version=1 AND $1.game_type='gin-rummy' THEN v_replay_shared");
shared=shared.replace(/ PERFORM private\.replay_gin_shared_end_v1\(([^\n]+)\);/g,' IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1($1); END IF;');
const functions=[...qualified.matchAll(/CREATE OR REPLACE FUNCTION ([\w.]+)\(/g),...shared.matchAll(/CREATE OR REPLACE FUNCTION ([\w.]+)\(/g)].map(x=>x[1]);
const original=JSON.parse(readFileSync('artifacts/replay-baseline/functions.json','utf8')).filter(x=>functions.includes(x.schema+'.'+x.name)&&!(x.name==='set_game_paused'&&x.args.split(',').length===2));
if(original.length!==23) throw Error('Unexpected deployed-owner scope');
const expected=original.map(x=>({identity:x.schema+'.'+x.name+'('+x.args.split(',').map(a=>a.trim().slice(a.trim().indexOf(' ')+1)).join(',')+')',md5:createHash('md5').update(x.definition).digest('hex')}));
const guards=`DO $guard$ BEGIN\n${expected.map(x=>` IF md5(pg_get_functiondef('${x.identity}'::regprocedure)) IS DISTINCT FROM '${x.md5}' THEN RAISE EXCEPTION 'Gin replay deployment: owner drift: ${x.identity}'; END IF;`).join('\n')}\nEND $guard$;\n`;
const header=`-- Qualified Gin replay/1. Enroll ONLY newly opened Gin hands.\n-- Existing hands, other games and canonical human-readable history are preserved.\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='30s';\nSET LOCAL check_function_bodies=false;\n`;
const sections=['journal-v1.draft.sql','gin-completion-v1.draft.sql','gin-shared-v1.draft.sql','gin-export-v1.draft.sql'].map(read);
const sql=header+guards+sections.join('\n')+'\n'+writers+'\n'+shared+'\n';
writeFileSync(root+'gin-production-v1.sql',sql);
const recovery=`-- Emergency recovery: atomic, non-destructive, keeps all replay rows/exporter.\n-- Restore original gameplay owners and append an explicit partial tail before\n-- disabling enrollment. Run as one transaction during a controlled recovery.\nSET LOCAL lock_timeout='5s';\nSET LOCAL check_function_bodies=false;\nDO $recovery$ DECLARE g record;last_step jsonb;pause_guard text:=coalesce(current_setting('app.session_pause_write',true),'');BEGIN\n FOR g IN SELECT id FROM public.games WHERE replay_contract_version=1 ORDER BY id FOR UPDATE LOOP\n  SELECT body INTO last_step FROM private.replay_steps WHERE session_id=g.id ORDER BY sequence DESC LIMIT 1;\n  IF last_step IS NOT NULL THEN\n   PERFORM private.replay_append_v1(g.id,'capture-suspended:'||gen_random_uuid(),last_step->'identity',NULL,\n    jsonb_build_array(jsonb_build_object('type','capture.suspended','source','gin-replay-production-recovery','actorId',NULL,'targets','[]'::jsonb,'origin','recovery','operands','{}'::jsonb,'delta','[]'::jsonb,'scores','[]'::jsonb,'transfers','[]'::jsonb)));\n  END IF;\n END LOOP;\n PERFORM set_config('app.gin_rummy_authoritative_write','on',true);\n PERFORM set_config('app.session_pause_write','on',true);\n UPDATE public.games SET replay_contract_version=NULL WHERE replay_contract_version=1;\n PERFORM set_config('app.session_pause_write',pause_guard,true);\nEND $recovery$;\n`+original.map(x=>x.definition+';').join('\n')+'\n';
writeFileSync(root+'gin-production-recovery.sql',recovery);
writeFileSync('artifacts/replay-baseline/gin-production-manifest.json',JSON.stringify({checkpoint:'af0867d42',owners:expected,migrationSha256:createHash('sha256').update(sql).digest('hex')},null,2));
console.log(JSON.stringify({owners:original.length,newEnrollmentPoints:2,sharedGinGuards:(shared.match(/game_type='gin-rummy' THEN v_replay_shared/g)||[]).length,bytes:sql.length}));
