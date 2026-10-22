import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {baseline,dispatchProof} from './qualification/bootstrap.mjs';
const docker=path.join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe');
const name='canasta-integration-proof-20261021';
const network=execFileSync(docker,['inspect',name,'--format','{{.HostConfig.NetworkMode}}'],{encoding:'utf8',timeout:15000}).trim();
if(network!=='none')throw Error('Canasta proof requires the isolated local container.');
const read=f=>readFileSync(new URL(f,import.meta.url),'utf8');
const forwardProof=['beginner.candidate.sql','beginner.proof.sql','qualification/pacing-admission.proof.sql'].map(read).join('\n')+"\nSELECT set_config('request.jwt.claim.sub','',true);\n"+read('proof.sql').replace('CREATE FUNCTION pg_temp.canasta_assert','CREATE OR REPLACE FUNCTION pg_temp.canasta_assert')+'\n'+read('consent.proof.sql')+'\n'+read('admission.proof.sql');
// Fixture scheduler setup needs UPDATE as well as INSERT; both grants roll back.
const sql='BEGIN; GRANT INSERT,UPDATE ON cron.job TO postgres; GRANT USAGE ON SEQUENCE cron.jobid_seq TO postgres; SET LOCAL ROLE postgres;\n'+baseline+'\n'+['authority.candidate.sql','admission.candidate.sql','lifecycle.candidate.sql','registration.candidate.sql','recovery.candidate.sql'].map(read).join('\n')+'\n'+dispatchProof+'\n'+['proof.sql','consent.proof.sql','admission.proof.sql','concurrency.fixture.sql','terminal-control.proof.sql'].map(read).join('\n')+'\n'+forwardProof+'\nROLLBACK;';
process.stdout.write(execFileSync(docker,['exec','-i',name,'psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-q'],
 {input:sql,encoding:'utf8',maxBuffer:1024*1024}));
