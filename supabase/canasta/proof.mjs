import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const docker=path.join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe');
const name='canasta-qualification-proof-20261020';
const network=execFileSync(docker,['inspect',name,'--format','{{.HostConfig.NetworkMode}}'],{encoding:'utf8'}).trim();
if(network!=='none')throw Error('Canasta proof requires the isolated local container.');
const sql='BEGIN;\n'+['authority.candidate.sql','admission.candidate.sql','lifecycle.candidate.sql','proof.sql'].map(f=>readFileSync(new URL(f,import.meta.url),'utf8')).join('\n')+'\nROLLBACK;';
process.stdout.write(execFileSync(docker,['exec','-i',name,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-q'],
 {input:sql,encoding:'utf8',maxBuffer:1024*1024}));
