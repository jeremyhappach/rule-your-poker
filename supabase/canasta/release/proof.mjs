import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
const docker=path.join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe');
const name='canasta-integration-proof-20261021';
assert.equal(execFileSync(docker,['inspect',name,'--format','{{.HostConfig.NetworkMode}}'],{encoding:'utf8'}).trim(),'none');
const read=f=>readFileSync(new URL(f,import.meta.url),'utf8');
const install=read('closed-install.sql');
assert.ok(install.endsWith('COMMIT;\n'));
// The captured dispatcher ONLY updates this old isolated clone inside rollback.
// The release artifact itself never includes it. Cron launch is disabled in this container.
const fixture='SET LOCAL ROLE postgres;\n'+read('../ante.production-proof.sql');
const run=sql=>process.stdout.write(execFileSync(docker,['exec','-i',name,'psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-q'],{input:sql,encoding:'utf8',maxBuffer:1024*1024}));
run(read('candidate-rollback-proof.sql').replace('BEGIN;\n',()=>'BEGIN;\n'+fixture));
const health=`SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='canasta-recovery'),active:=true);
UPDATE private.canasta_recovery_state SET last_completed_at=clock_timestamp();
UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed',consecutive_partial_failures=0 WHERE singleton;\n`;
const proof=read('installed-rollback-proof.sql').replace('BEGIN;\n','').replace(/ROLLBACK;\n$/,'');
const sql=install.replace('BEGIN;\n',()=>'BEGIN;\n'+fixture).replace(/COMMIT;\n$/,()=>read('closed-verify.sql')+'\n'+health+proof+'\nROLLBACK;\n');
run(sql);
console.log('Exact closed package + disabled scheduler + installed rollback proof passed locally; HTTP health is fixture-only.');
