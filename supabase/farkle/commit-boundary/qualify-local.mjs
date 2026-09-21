// Destructive only to this explicitly named, isolated qualification database.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const dir='supabase/farkle/commit-boundary/';
const settings=JSON.parse(fs.readFileSync('runtime-farkle.local/status.json','utf8'));
if(settings.API_URL!=='http://127.0.0.1:57321')throw Error('Isolated environment required');
const api=createClient(settings.API_URL,settings.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const evidence={environment:'isolated loopback Supabase',cases:[],sessions:[]};
function sql(input){const r=spawnSync('docker',['exec','-i','supabase_db_farkle-wave2-local','psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input,encoding:'utf8',maxBuffer:30e6});if(r.status)throw Error(r.stderr);return r.stdout;}
function value(input){return JSON.parse(sql(input).split('\n').find(x=>x.startsWith('{')));}
function check(ok,name){if(!ok)throw Error(name);evidence.cases.push(name);}
const assert=`CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $p$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'commit_proof:%',label; END IF; END $p$;`;
const identity=id=>`SELECT set_config('request.jwt.claim.sub','${id}',true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated"}',true);`;
const read=p=>fs.readFileSync(p,'utf8');
const users=[];let fixture;
try {
 check(value("SELECT json_build_object('n',(SELECT count(*) FROM public.games),'users',(SELECT count(*) FROM auth.users));").n===0,'clean game database');
 for(let i=0;i<5;i++){
  const {data,error}=await api.auth.admin.createUser({email:`farkle-wave2-commit-${randomUUID()}@local.test`,password:randomUUID(),email_confirm:true,user_metadata:{username:`Commit proof ${i}`}});
  if(error)throw error;users.push(data.user.id);
  if(i===0)sql(`INSERT INTO public.user_roles(user_id,role) VALUES('${data.user.id}','admin');`);
 }
 sql('BEGIN;'+read(dir+'candidate.sql')+'COMMIT;');
 const base=read('supabase/farkle/proof.sql').split('DO $proof$')[0];
 const helpers=read('supabase/farkle/wave2-postgame/proof.sql').split('DO $p$\nDECLARE f jsonb;')[0];
 evidence.terminals=[];
 for(const pendingEnd of [false,true]) {
 fixture=value(`BEGIN;${base}${helpers} CREATE TEMP TABLE selected AS SELECT pg_temp.farkle_postgame_fixture() AS f;
 SELECT private.farkle_claim_v1((f->>'game')::uuid,(f->>'dealer')::uuid,NULL,'configure') FROM selected;
 UPDATE public.rounds SET farkle_state=farkle_state||'{"stage":"bank_or_roll","thisTurn":1000}'::jsonb WHERE id=(SELECT (f->>'round')::uuid FROM selected);
 UPDATE public.games SET pending_session_end=${pendingEnd} WHERE id=(SELECT (f->>'game')::uuid FROM selected);
 SELECT set_config('app.farkle_authority','',true); SELECT f FROM selected; COMMIT;`);
 const {game:g,dealer:d,round:r,b:actor,peer}=fixture;const request=randomUUID();
 const bank=value(`BEGIN;${identity(peer)} SET LOCAL ROLE authenticated;
 SELECT public.farkle_apply_action('${r}','${actor}','bank',0,'${request}') AS response;
 RESET ROLE;${assert}
 SELECT pg_temp.assert_true(coalesce(current_setting('app.farkle_authority',true),'')='','claim restored before COMMIT');
 CREATE FUNCTION pg_temp.generic_mutation() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $x$ BEGIN UPDATE public.players SET chips=chips+1 WHERE id='${actor}'; END $x$;
 DO $x$ DECLARE denied boolean:=false; BEGIN BEGIN PERFORM pg_temp.generic_mutation(); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:authority_claim_required'; END; PERFORM pg_temp.assert_true(denied,'generic definer after Bank blocked');
 denied:=false; BEGIN PERFORM private.farkle_begin_terminal_transfer_v2('${g}',txid_current(),'{}','{}'); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle_transfer:deferred_context_required'; END; PERFORM pg_temp.assert_true(denied,'helper outside deferred path blocked'); END $x$;
 SELECT pg_temp.assert_true((SELECT count(*)=3 FROM public.gameplay_transfer_pending_changes WHERE game_id='${g}'),'three deferred callbacks queued');
 COMMIT;`);
 check(bank.outcome==='applied','target-reaching Bank COMMIT succeeded as authenticated actor');
 const snapshot=()=>value(`SELECT json_build_object('pid',pg_backend_pid(),'claim',coalesce(current_setting('app.farkle_authority',true),''),'game',(SELECT status FROM public.games WHERE id='${g}'),'round',(SELECT status FROM public.rounds WHERE id='${r}'),'state',(SELECT farkle_state FROM public.rounds WHERE id='${r}'),'results',(SELECT count(*) FROM public.game_results WHERE dealer_game_id='${d}' AND settlement_key='farkle_terminal'),'balances',(SELECT jsonb_object_agg(id,chips) FROM public.players WHERE game_id='${g}'),'snapshots',(SELECT count(*) FROM public.session_player_snapshots WHERE game_id='${g}'),'events',(SELECT count(*) FROM private.farkle_events WHERE round_id='${r}' AND sequence=1),'receipts',(SELECT count(*) FROM private.farkle_action_receipts WHERE round_id='${r}'),'batches',(SELECT count(*) FROM public.gameplay_transfer_batches WHERE game_id='${g}'),'pending',(SELECT count(*) FROM public.gameplay_transfer_pending_changes WHERE game_id='${g}'),'tickets',(SELECT count(*) FROM private.farkle_terminal_transfers_v2 WHERE game_id='${g}'));`);
 const first=snapshot();evidence.sessions.push(first.pid);
 check(first.game===(pendingEnd?'session_ended':'game_over')&&first.round==='completed'&&first.state.gamePhase==='complete'&&first.state.playerStates[actor].banked===1000,`fresh-session persisted Bank and ${pendingEnd?'session_ended':'game_over'} identity`);
 check(first.results===1&&first.balances[actor]===114&&first.balances[fixture.a]===93&&first.balances[fixture.bot]===93,'one settlement and exact fixed-stake balances');
 check(first.snapshots===3&&first.events===1&&first.receipts===1,'terminal snapshots history and action receipt persisted');
 check(first.batches===1&&first.pending===0&&first.tickets===0&&first.claim==='','deferred callbacks consumed once and authority cleared');
 const replay=value(`BEGIN;${identity(peer)} SET LOCAL ROLE authenticated;SELECT public.farkle_apply_action('${r}','${actor}','bank',0,'${request}'); COMMIT;`);
 check(replay.deduped===true,'identical request replay deduped after COMMIT');
 const second=snapshot();evidence.sessions.push(second.pid);delete first.pid;delete second.pid;
 check(JSON.stringify(first)===JSON.stringify(second),'fresh replay session no chip settlement cursor or state changes');
 sql(`BEGIN;${assert}${identity(peer)}
 DO $x$ DECLARE denied boolean:=false; BEGIN BEGIN UPDATE public.games SET pot=1 WHERE id='${g}'; EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:authority_claim_required'; END; PERFORM pg_temp.assert_true(denied,'fresh owner has no inherited claim'); END $x$;
 SET LOCAL ROLE authenticated;
 DO $x$ DECLARE denied boolean:=false; BEGIN BEGIN UPDATE public.players SET chips=115 WHERE id='${actor}'; EXCEPTION WHEN OTHERS THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'direct client mutation accepted'; END IF;
 denied:=false; BEGIN PERFORM private.farkle_begin_terminal_transfer_v2('${g}',txid_current(),'{}','{}'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'private helper executable'; END IF; END $x$;RESET ROLE;
 INSERT INTO public.gameplay_transfer_pending_changes(transaction_id,game_id,endpoint_key,opening_balance,closing_balance) VALUES(txid_current(),'${g}','player:${actor}',114,114);
 DELETE FROM public.gameplay_transfer_pending_changes WHERE transaction_id=txid_current() AND game_id='${g}';COMMIT;`);
 const stale=snapshot();delete stale.pid;
 check(JSON.stringify(first)===JSON.stringify(stale),'stale deferred notification harmless; client generic and cross-transaction writes rejected');
 evidence.terminals.push(first);
 sql(`BEGIN;SELECT private.farkle_claim_v1('${g}','${d}',NULL,'cleanup');DELETE FROM public.games WHERE id='${g}';COMMIT;`);fixture=null;
 }
 for(let pass=1;pass<=2;pass++){
  const proof=sql(read(pass===1?'runtime-farkle.local/commit-boundary-preapply.sql':'supabase/farkle/wave2-postgame/post-apply-proof.sql'));
  const result=JSON.parse(proof.split('\n').find(x=>x.includes('"assertions"')));
  check(result.assertions===158,`candidate pass ${pass}: all 158 Wave1/Wave2 and seven-game assertions`);
  sql(read(dir+'restore-shared.sql'));
  const restored=sql(read('supabase/farkle/wave2-postgame/post-apply-proof.sql'));
  check(JSON.parse(restored.split('\n').find(x=>x.includes('"assertions"'))).assertions===158,`recovery pass ${pass}: exact metadata and seven-game assertions`);
  sql('BEGIN;'+read(dir+'candidate.sql')+'COMMIT;');
 }
 evidence.passed=true;
} finally {
 if(fixture)sql(`BEGIN;SELECT private.farkle_claim_v1('${fixture.game}','${fixture.dealer}',NULL,'cleanup');DELETE FROM public.games WHERE id='${fixture.game}';COMMIT;`);
 for(const id of users){const {error}=await api.auth.admin.deleteUser(id);if(error)throw error;sql(`DELETE FROM public.profiles WHERE id='${id}';`);}
 evidence.cleanup=value("UPDATE private.farkle_release SET creation_enabled=false WHERE singleton; SELECT json_build_object('games',(SELECT count(*) FROM public.games),'players',(SELECT count(*) FROM public.players),'rounds',(SELECT count(*) FROM public.rounds),'results',(SELECT count(*) FROM public.game_results),'snapshots',(SELECT count(*) FROM public.session_player_snapshots),'users',(SELECT count(*) FROM auth.users),'profiles',(SELECT count(*) FROM public.profiles),'tickets',(SELECT count(*) FROM private.farkle_terminal_transfers_v2),'pending',(SELECT count(*) FROM public.gameplay_transfer_pending_changes),'batches',(SELECT count(*) FROM public.gameplay_transfer_batches),'release',(SELECT row_to_json(x) FROM private.farkle_release x),'defaults',(SELECT count(*) FROM public.game_defaults WHERE game_type='farkle'));");
 const countKeys=['games','players','rounds','results','snapshots','users','profiles','tickets','pending','batches','defaults'];
 evidence.cleanupPassed=countKeys.every(k=>evidence.cleanup[k]===0)&&evidence.cleanup.release.creation_enabled===false&&evidence.cleanup.release.admin_only===true&&evidence.cleanup.release.production_defaults_approved===false;
 if(!evidence.cleanupPassed)evidence.passed=false;
 fs.writeFileSync(dir+'local-qualification.json',JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({passed:evidence.passed??false,cases:evidence.cases,cleanup:evidence.cleanup}));
 if(!evidence.cleanupPassed)throw Error('Fixture cleanup failed');
}
