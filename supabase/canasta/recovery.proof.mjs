import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
const docker=path.join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe'),container='canasta-integration-proof-20261021',db='canasta_recovery_proof';
assert.equal(execFileSync(docker,['inspect',container,'--format','{{.HostConfig.NetworkMode}}'],{encoding:'utf8'}).trim(),'none');
const sql=(q,database=db)=>execFileSync(docker,['exec','-i',container,'psql','-X','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-Atq'],{input:q,encoding:'utf8',maxBuffer:8*1024*1024}).trim();
const literal=v=>"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const folder=mkdtempSync(path.join(tmpdir(),'canasta-recovery-proof-')),entry=path.join(folder,'worker.cjs');
sql(`CREATE DATABASE ${db} OWNER postgres TEMPLATE postgres;`,'postgres');
try{
 const files=['ante.production-proof.sql','authority.candidate.sql','admission.candidate.sql','lifecycle.candidate.sql','registration.candidate.sql','recovery.candidate.sql','concurrency.fixture.sql'];
 sql('SET ROLE postgres;\n'+files.map(f=>readFileSync(new URL(f,import.meta.url),'utf8')).join('\n')+'\nUPDATE private.canasta_release SET enabled=true;');
 // This clone has no pg_net. Stub only HTTP delivery, retaining the real dispatcher,
 // token rotation, claim, state commits, finish and health acknowledgement.
 sql(`CREATE SCHEMA net; CREATE TABLE private.canasta_dispatch_fixture(headers jsonb);
  CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
  BEGIN INSERT INTO private.canasta_dispatch_fixture VALUES(headers); RETURN 1; END $$;`);
 buildSync({entryPoints:[new URL('recovery.process-proof.ts',import.meta.url).pathname.replace(/^\/(.:)/,'$1')],outfile:entry,bundle:true,platform:'node',format:'cjs',logLevel:'silent'});
 const child=(arg,crash='')=>spawnSync(process.execPath,[entry,arg],{encoding:'utf8',env:{...process.env,CANASTA_PROOF_CRASH:crash}});
 const seeded=child('seed');assert.equal(seeded.status,0,seeded.stderr);const f=JSON.parse(seeded.stdout);
 const read=()=>JSON.parse(sql(`SELECT public.canasta_server_load(${literal(f.match)},NULL);`));
 // Exercise the actual dispatcher; a fresh local process receives its issued token.
 const lease=()=>sql('SELECT private.canasta_dispatch_recovery(); SELECT token FROM private.canasta_recovery_state;').trim();
 const first=lease(),crashed=child(first,'commit');assert.equal(crashed.status,23,crashed.stderr);
 const committed=read();assert.equal(committed.state.hand.turn,2);assert.equal(committed.state.automatic.length,1);
 assert.equal(sql(`SELECT count(*) FROM public.players WHERE game_id=${literal(f.game)} AND auto_fold AND sit_out_next_hand;`),'1');
 assert.equal(sql('SELECT last_completed_at IS NULL FROM private.canasta_recovery_state;'),'t');
 // Restart loses all process memory. An expired claim cannot read/ack; a fresh lease reconciles durable state.
 sql("UPDATE private.canasta_recovery_state SET expires_at=clock_timestamp()-interval '1 second';");
 const stale=child(first);assert.notEqual(stale.status,0);assert.match(stale.stderr,/token_denied/);
 const second=lease(),restarted=child(second);assert.equal(restarted.status,0,restarted.stderr);assert.deepEqual(JSON.parse(restarted.stdout).failures,[]);
 assert.deepEqual(read().state,committed.state);assert.equal(sql('SELECT last_completed_at IS NOT NULL AND failure IS NULL FROM private.canasta_recovery_state;'),'t');
 assert.equal(sql(`SELECT count(*) FROM public.game_results WHERE dealer_game_id=${literal(f.match)};`),'0');
 // A second fixture isolates post-settlement restart, including pause and Stand Up.
 const terminal=JSON.parse(sql('SET ROLE postgres; SELECT private.canasta_concurrency_fixture(false);'));
 sql(`SELECT public.canasta_server_commit(${literal(terminal.match)},1,${literal(terminal.next)}::jsonb,'{"kind":"recover"}');
  UPDATE public.players SET stand_up_next_hand=true WHERE id=${literal(terminal.players[0])};
  UPDATE private.canasta_matches SET settlement=jsonb_set(settlement,'{deadline}','0') WHERE dealer_game_id=${literal(terminal.match)};
  SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
  SELECT public.set_game_paused(${literal(terminal.game)},true,${literal(terminal.match)},(SELECT pause_version FROM public.games WHERE id=${literal(terminal.game)}));`);
 const held=child(lease());assert.equal(held.status,0,held.stderr);assert.deepEqual(JSON.parse(held.stdout).failures,[]);
 assert.equal(sql(`SELECT finished FROM private.canasta_matches WHERE dealer_game_id=${literal(terminal.match)};`),'f');
 sql(`SELECT set_config('request.jwt.claims','{"role":"service_role"}',false); SELECT public.set_game_paused(${literal(terminal.game)},false,${literal(terminal.match)},(SELECT pause_version FROM public.games WHERE id=${literal(terminal.game)}));`);
 const terminalLease=lease(),closed=child(terminalLease,'finish');assert.equal(closed.status,24,closed.stderr);
 const final=JSON.parse(sql(`SELECT public.canasta_server_load(${literal(terminal.match)},${literal(terminal.actor)});`));assert.equal(final.finished,true);
 sql("UPDATE private.canasta_recovery_state SET expires_at=clock_timestamp()-interval '1 second';");
 const last=child(lease());assert.equal(last.status,0,last.stderr);assert.deepEqual(JSON.parse(last.stdout).failures,[]);
 assert.equal(sql(`SELECT revision FROM public.canasta_revisions WHERE dealer_game_id=${literal(terminal.match)};`),String(final.state.revision));
 assert.equal(sql(`SELECT count(*) FROM public.game_results WHERE dealer_game_id=${literal(terminal.match)};`),'1');
 assert.equal(sql(`SELECT count(*) FROM public.gameplay_transfer_batches WHERE dealer_game_id=${literal(terminal.match)};`),'1');
 assert.equal(sql(`SELECT status FROM public.players WHERE id=${literal(terminal.players[0])};`),'left');
 console.log('Passed: real worker-process crash after commit and after terminal finish, expired lease rejection, restart without clients, durable exact-once state and settlement.');
}finally{
 sql(`DROP DATABASE ${db};`,'postgres');
 // Only the exact temporary directory created above, verified under the OS temp root.
 if(!path.resolve(folder).startsWith(path.resolve(tmpdir())+path.sep))throw Error('temporary path escaped');
 rmSync(folder,{recursive:true,force:true});
}
