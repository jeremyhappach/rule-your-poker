import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const cli=process.argv[2];assert(cli,'Pass an existing Supabase CLI executable');
const manifest=JSON.parse(read('src/lib/gameBackgrounds/photos.json'));
const receipt=[];
for(const p of manifest){
 const path='qualification.local/game-backgrounds/assets/'+p.id+'.png',bytes=read(path);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),p.sha256);assert.equal(bytes.length,p.bytes);assert(bytes.length<=2097152);
 const r=spawnSync(cli,['storage','cp',path,'ss:///arcade-artwork/'+p.path,'--project-ref','xvhmbuppghwmwpwrkzao','--content-type','image/png','--cache-control','max-age=31536000, immutable','--experimental'],{encoding:'utf8',windowsHide:true});
 if(r.status!==0)throw Error('Upload failed for '+p.id+': '+r.stderr.slice(0,300));
 receipt.push({id:p.id,path:p.path,sha256:p.sha256,bytes:p.bytes});
}
write('qualification.local/game-backgrounds/upload-receipt.json',JSON.stringify({project:'xvhmbuppghwmwpwrkzao',bucket:'arcade-artwork',objects:receipt},null,2));
console.log(JSON.stringify({uploaded:receipt.length,bytes:receipt.reduce((n,p)=>n+p.bytes,0)}));
