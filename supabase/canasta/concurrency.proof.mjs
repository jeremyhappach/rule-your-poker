import {execFileSync,spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {baseline,dispatchProof} from './qualification/bootstrap.mjs';
const docker=path.join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe'),container='canasta-integration-proof-20261021',db='canasta_concurrency_proof_'+Date.now();
assert.equal(execFileSync(docker,['inspect',container,'--format','{{.HostConfig.NetworkMode}}'],{encoding:'utf8'}).trim(),'none');
const args=(database=db)=>['exec','-i',container,'psql','-X','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-Atq'];
const sql=(query,database=db)=>execFileSync(docker,args(database),{input:query,encoding:'utf8',maxBuffer:4*1024*1024}).trim();
// A new disposable database makes concurrent commits visible without touching the baseline.
sql(`CREATE DATABASE ${db} OWNER postgres TEMPLATE postgres;`,'postgres');
try{
 const files=['authority.candidate.sql','admission.candidate.sql','lifecycle.candidate.sql','registration.candidate.sql','recovery.candidate.sql','concurrency.fixture.sql',...(process.argv.includes('--beginner')?['beginner.candidate.sql']:[])];
 sql('SET ROLE postgres;\n'+baseline+'\n'+files.map(f=>readFileSync(new URL(f,import.meta.url),'utf8')).join('\n')+'\n'+dispatchProof+'\nUPDATE private.canasta_release SET enabled=true;');
 const fixture=money=>JSON.parse(sql(`SET ROLE postgres; SELECT private.canasta_concurrency_fixture(${money});`));
 const commit=(f,command=f.command)=>`SELECT public.canasta_server_commit('${f.match}',1,'${JSON.stringify(f.next)}'::jsonb,'${JSON.stringify({kind:'command',command,userId:f.actor})}'::jsonb);`;
 const report=f=>JSON.parse(sql(`SELECT jsonb_build_object('results',(SELECT count(*) FROM public.game_results WHERE dealer_game_id='${f.match}'),'batches',(SELECT count(*) FROM public.gameplay_transfer_batches WHERE dealer_game_id='${f.match}' AND unmatched_deltas='{}'),'snapshots',(SELECT count(*) FROM public.session_player_snapshots WHERE dealer_game_id='${f.match}'),'chips',(SELECT jsonb_agg(chips ORDER BY position) FROM public.players WHERE game_id='${f.game}'),'revision',(SELECT revision FROM private.canasta_matches WHERE dealer_game_id='${f.match}'));`));
 const processSql=query=>{let output='',error='';let unlock;const locked=new Promise(r=>unlock=r);const child=spawn(docker,args(),{stdio:['pipe','pipe','pipe']});child.stdout.on('data',b=>{output+=b;if(output.includes('locked'))unlock();});child.stderr.on('data',b=>error+=b);const done=new Promise(resolve=>child.on('close',code=>resolve({code,output,error})));child.stdin.end(query);return {done,locked};};
 for(const money of [false,true])for(const duplicate of [false,true]){
  const f=fixture(money),a=processSql(`BEGIN;SELECT id FROM public.rounds WHERE id='${f.round}' FOR UPDATE;SELECT 'locked';SELECT pg_sleep(0.8);${commit(f)}COMMIT;`);
  await a.locked;const b=processSql(commit(f,duplicate?f.command:{...f.command,requestId:randomUUID()}));
  const [one,two]=await Promise.all([a.done,b.done]);assert.equal(one.code,0,one.error);
  if(duplicate)assert.equal(two.code,0,two.error);else assert.match(two.error,/canasta:(conflict|inactive)/);
  assert.deepEqual(report(f),{results:1,batches:1,snapshots:2,chips:[110,90],revision:2});
 }
 const late=fixture(false);
 sql(`UPDATE private.canasta_matches SET state=jsonb_set(state,'{hand,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint+500)) WHERE dealer_game_id='${late.match}';`);
 const holder=processSql(`BEGIN;SELECT id FROM public.rounds WHERE id='${late.round}' FOR UPDATE;SELECT 'locked';SELECT pg_sleep(1);COMMIT;`);
 await holder.locked;const delayed=processSql(commit(late));await holder.done;const expired=await delayed.done;assert.match(expired.error,/canasta:deadline/);assert.deepEqual(report(late),{results:0,batches:0,snapshots:0,chips:[100,100],revision:1});
 const fail=fixture(true);
 sql(`CREATE FUNCTION public.canasta_proof_inject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.dealer_game_id='${fail.match}' THEN RAISE EXCEPTION 'injected_snapshot_failure';END IF;RETURN NEW;END $$;CREATE TRIGGER canasta_proof_inject BEFORE INSERT ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION public.canasta_proof_inject();`);
 const failed=await processSql(commit(fail)).done;assert.match(failed.error,/injected_snapshot_failure/);assert.deepEqual(report(fail),{results:0,batches:0,snapshots:0,chips:[100,100],revision:1});
 // Reclaim wins the canonical lock before a stale autoplay worker can commit.
 const control=fixture(false),who=control.players[0];
 sql(`UPDATE private.canasta_matches SET state=jsonb_set(state,'{automatic}','["${who}"]') WHERE dealer_game_id='${control.match}';
  UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE id='${who}';`);
 const prior=JSON.parse(sql(`SELECT state FROM private.canasta_matches WHERE dealer_game_id='${control.match}';`));
 const reclaimed={...prior,revision:prior.revision+1,automatic:[]},stale={...prior,revision:prior.revision+1};
 const reclaim=`SELECT public.canasta_server_commit('${control.match}',${prior.revision},'${JSON.stringify(reclaimed)}','${JSON.stringify({kind:'control',userId:control.actor})}');`;
 const first=processSql(`BEGIN;SELECT id FROM public.rounds WHERE id='${control.round}' FOR UPDATE;SELECT 'locked';SELECT pg_sleep(0.5);${reclaim}COMMIT;`);
 await first.locked;
 const worker=processSql(`SELECT public.canasta_server_commit('${control.match}',${prior.revision},'${JSON.stringify(stale)}','{"kind":"recover"}');`);
 assert.equal((await first.done).code,0);assert.match((await worker.done).error,/canasta:conflict/);
 assert.equal(sql(`SELECT NOT auto_fold AND NOT sit_out_next_hand FROM public.players WHERE id='${who}';`),'t');
 assert.deepEqual(JSON.parse(sql(`SELECT state->'hand' FROM private.canasta_matches WHERE dealer_game_id='${control.match}';`)),prior.hand);
 console.log('Passed: both-money competing/duplicate settlement, fresh-lock deadline, injected post-transfer rollback, and reclaim versus stale autoplay.');
}finally{sql(`DROP DATABASE ${db};`,'postgres');}
