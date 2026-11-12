import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';

// Explicit photo allowlist: four files mislabeled as originals in the handoff
// contain composited UI and must never enter the production background pool.
const photos=[
 ['image(3).png','big-als','24% 22%'],
 ['image(4).png','pere-marquette','47% 15%'],
 ['image(5).png','hoops','70% 12%'],
 ['image(6).png','sullys','50% 18%'],
 ['image(7).png','river-autumn','51% 12%'],
 ['image(8).png','ballpark','50% 23%'],
 ['image(9).png','bradley-arena','50% 20%'],
 ['image(10).png','theater','50% 30%'],
 ['image(20261112-185827).png','crusens','27% 24%'],
];
const source=process.argv[2];
if(!source)throw Error('Pass the extracted original-backgrounds directory. This command never uploads.');
const output=resolve('qualification.local/game-backgrounds/assets');
mkdirSync(output,{recursive:true});
mkdirSync('src/lib/gameBackgrounds',{recursive:true});
const manifest=photos.map(([file,slug,position])=>{
 const bytes=readFileSync(resolve(source,file));
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const id='peoria-'+slug+'-'+sha256.slice(0,12);
 copyFileSync(resolve(source,file),resolve(output,id+'.png'));
 return {id,source:file,path:'game-backgrounds/'+id+'.png',position,sha256,bytes:bytes.length};
});
writeFileSync('src/lib/gameBackgrounds/photos.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({photos:manifest.length,bytes:manifest.reduce((n,p)=>n+p.bytes,0),output,uploaded:false}));
