import {readdirSync,statSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,extname,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const categories={image:['.png','.webp','.avif','.jpg','.jpeg','.gif','.svg','.ico'],audio:['.wav','.mp3','.ogg','.m4a'],video:['.mp4','.webm'],javascript:['.js','.mjs'],css:['.css'],font:['.woff','.woff2','.ttf','.otf']};
const category=path=>Object.entries(categories).find(([,extensions])=>extensions.includes(extname(path).toLowerCase()))?.[0]??'other';
export function measureBuild(directory) {
  const root=resolve(directory);
  // A missing or wrong output directory must not report a successful zero-byte build.
  const manifest=JSON.parse(readFileSync(resolve(root,'build-manifest.json'),'utf8'));
  if(!/^[a-f0-9]{40}$/i.test(manifest.buildId??''))throw Error('Missing production build identity');
  if(!statSync(resolve(root,'index.html')).isFile())throw Error('Missing application entry');
  const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    if(entry.isSymbolicLink())throw Error('Unexpected symlink in build output');
    const path=resolve(dir,entry.name);
    return entry.isDirectory()?walk(path):[{path:relative(root,path).replaceAll('\\','/'),bytes:statSync(path).size,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}];
  });
  const files=walk(root).sort((a,b)=>a.path.localeCompare(b.path)),byCategory={},byExtension={},byDirectory={};
  const add=(map,key,file)=>{map[key]??={files:0,bytes:0};map[key].files++;map[key].bytes+=file.bytes;};
  for(const file of files){add(byCategory,category(file.path),file);add(byExtension,extname(file.path)||'(none)',file);add(byDirectory,file.path.includes('/')?file.path.split('/')[0]:'(root)',file);}
  return {schemaVersion:1,buildId:manifest.buildId,measurement:'uncompressed static files; excludes Vercel Function bundles and account billing',fileCount:files.length,totalBytes:files.reduce((sum,file)=>sum+file.bytes,0),byCategory,byExtension,byDirectory,largest:[...files].sort((a,b)=>b.bytes-a.bytes||a.path.localeCompare(b.path)).slice(0,20),files};
}
export function compareBuilds(before,after) {
  const categories=[...new Set([...Object.keys(before.byCategory),...Object.keys(after.byCategory)])];
  return {beforeBytes:before.totalBytes,afterBytes:after.totalBytes,savedBytes:before.totalBytes-after.totalBytes,savedPercent:Number((100*(before.totalBytes-after.totalBytes)/before.totalBytes).toFixed(3)),byCategory:Object.fromEntries(categories.map(key=>[key,{before:before.byCategory[key]?.bytes??0,after:after.byCategory[key]?.bytes??0,saved:(before.byCategory[key]?.bytes??0)-(after.byCategory[key]?.bytes??0)}]))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);if(i===-1)return undefined;const value=args[i+1];if(!value||value.startsWith('--'))throw Error(`${name} requires a value`);return value;};
  const report=measureBuild(args[0]&&!args[0].startsWith('--')?args[0]:'dist');
  const baseline=option('--compare');if(baseline)report.comparison=compareBuilds(JSON.parse(readFileSync(baseline,'utf8')),report);
  const json=option('--json');if(json){mkdirSync(dirname(resolve(json)),{recursive:true});writeFileSync(json,JSON.stringify(report,null,2)+'\n');}
  console.log(`Static build: ${report.totalBytes.toLocaleString('en-US')} bytes / ${report.fileCount} files (${(report.totalBytes/1e6).toFixed(3)} MB)`);
  for(const [name,value]of Object.entries(report.byCategory))console.log(`  ${name}: ${value.bytes.toLocaleString('en-US')} bytes / ${value.files} files`);
  console.log('Largest files:');for(const file of report.largest)console.log(`  ${file.bytes.toLocaleString('en-US')}  ${file.path}`);
  if(report.comparison)console.log(`Saved: ${report.comparison.savedBytes.toLocaleString('en-US')} bytes (${report.comparison.savedPercent}%)`);
  const max=option('--max-bytes');if(max&&(!/^\d+$/.test(max)||report.totalBytes>Number(max))){console.error('Static build size budget exceeded or invalid.');process.exitCode=1;}
}
