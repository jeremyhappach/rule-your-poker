import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const out='qualification.local/farkle-full-stack/';
const base='supabase/farkle/financial-correction/20261015/';
const steps=['supabase/farkle/financial-audit/20261015/create-empty.mjs',...['restore-column-grants.mjs','apply-local.mjs','containment.mjs','auth-proof.mjs','profile-authority-proof.mjs','pending-deactivation.mjs','proof.mjs','supplement.mjs','immutability.mjs','race.mjs','metadata-proof.mjs'].map(x=>base+x)];
const results=[];
for(const file of steps){
 const r=spawnSync(process.execPath,[file,...(file.endsWith('/race.mjs')?['--fixed']:[])],{encoding:'utf8',maxBuffer:16e6,timeout:180000});
 const name=file.split('/').at(-1);fs.writeFileSync(out+'rerun-'+name+'.log',(r.stdout??'')+'\n'+(r.stderr??''));
 results.push({name,exitCode:r.status,error:r.error?.message});console.log(name+': '+r.status);
 fs.writeFileSync(out+'rerun-steps.json',JSON.stringify(results,null,2));
 if(r.status!==0){process.exitCode=1;break;}
}
