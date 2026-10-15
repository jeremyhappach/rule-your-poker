import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const workspace=path.resolve('qualification.local/farkle-full-stack');
const cli=path.resolve('qualification.local/tri-towers/tools/node_modules/@supabase/cli-windows-x64/bin/supabase.exe');
const docker=path.join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin');
if(fs.existsSync(path.join(workspace,'supabase/.temp/project-ref')))throw Error('Linked project forbidden');
const configPath=path.join(workspace,'supabase/config.toml');
let config=fs.readFileSync(configPath,'utf8');
if(!config.includes('project_id = "farkle-full-stack"'))throw Error('Wrong isolated project');
config=config.replaceAll('5432','5732');
fs.writeFileSync(configPath,config);
const action=process.argv[2];
if(!['start','status','stop'].includes(action))throw Error('start, status or stop required');
const args=['--workdir',workspace,action];
if(action==='start')args.push('--exclude','storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor,mailpit');
if(action==='status')args.push('-o','json');
const r=spawnSync(cli,args,{encoding:'utf8',env:{...process.env,PATH:docker+path.delimiter+process.env.PATH},maxBuffer:64e6,timeout:600000});
if(action==='status'&&r.status===0){
 const status=JSON.parse(r.stdout);
 if(status.API_URL!=='http://127.0.0.1:57321')throw Error('Unexpected API URL');
 fs.writeFileSync(path.join(workspace,'status.json'),JSON.stringify(status,null,2));
 console.log(JSON.stringify({API_URL:status.API_URL,keysSavedLocally:true}));
}else{
 fs.writeFileSync(path.join(workspace,action+'.log'),(r.stdout??'')+'\n'+(r.stderr??''));
 console.log(JSON.stringify({action,exitCode:r.status,error:r.error?.message,log:path.join(workspace,action+'.log')}));
}
process.exitCode=r.status??1;
