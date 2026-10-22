import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const docker=path.join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe');
const name='canasta-integration-proof-20261021';
const network=execFileSync(docker,['inspect',name,'--format','{{.HostConfig.NetworkMode}}'],{encoding:'utf8'}).trim();
if(network!=='none')throw Error('Canasta proof requires the isolated local container.');
const sql='BEGIN; GRANT INSERT ON cron.job TO postgres; GRANT USAGE ON SEQUENCE cron.jobid_seq TO postgres; SET LOCAL ROLE postgres;\n'+['ante.production-proof.sql','authority.candidate.sql','admission.candidate.sql','lifecycle.candidate.sql','registration.candidate.sql','recovery.candidate.sql','proof.sql','consent.proof.sql','admission.proof.sql','concurrency.fixture.sql','terminal-control.proof.sql'].map(f=>readFileSync(new URL(f,import.meta.url),'utf8')).join('\n')+'\nROLLBACK;';
process.stdout.write(execFileSync(docker,['exec','-i',name,'psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-q'],
 {input:sql,encoding:'utf8',maxBuffer:1024*1024}));
