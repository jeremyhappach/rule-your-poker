import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {decodePng,rgba} from './png-lossless.mjs';

const proof=JSON.parse(readFileSync('docs/codex/evidence/storage-png-proof-20261109.json','utf8'));
for(const file of proof.files){
  const image=decodePng(readFileSync(file.file));assert.equal(image.width,file.width);assert.equal(image.height,file.height);
  assert.equal(createHash('sha256').update(rgba(image)).digest('hex'),file.rgbaSha256,`Decoded pixels changed: ${file.file}`);
}
const html=readFileSync('index.html','utf8');
const startup=[...html.matchAll(/rel="apple-touch-startup-image" href="([^"]+)" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\) and \(orientation: (portrait|landscape)\)"/g)];
assert.equal(startup.length,24);assert.equal(new Set(startup.map(x=>x[1])).size,24);
for(const [,url,w,h,scale,orientation]of startup){const image=decodePng(readFileSync('public'+url));assert.equal(image.width,Number(orientation==='landscape'?h:w)*Number(scale));assert.equal(image.height,Number(orientation==='landscape'?w:h)*Number(scale));}

const check=url=>assert(existsSync('public'+url),`Missing artwork URL: ${url}`);
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
let literalReferences=0;
for(const file of [...walk('src').filter(f=>['.ts','.tsx','.css'].includes(extname(f))&&!f.includes('.test.')),'index.html','public/manifest.webmanifest']){
  const text=readFileSync(file,'utf8');
  for(const match of text.matchAll(/['"`]((?:\/(?:arcade|launch-splash|game-branding|mega-card-golf|icons)\/)[^'"`$\s]+\.(?:png|webp|avif|jpg|ico|mp4))['"`]/g)){check(match[1]);literalReferences++;}
}
// The lobby builds fallback paths from slugs; a literal URL scan alone misses them.
const tiles=readFileSync('src/lib/arcade/tileArtwork.ts','utf8');let dynamicReferences=0;
for(const match of tiles.matchAll(/:\s*\{([^{}]*slug\s*:[^{}]*)\}/g)){
  const body=match[1],source=body.match(/source\s*:\s*['"]([^'"]+)['"]/),slug=body.match(/slug\s*:\s*['"]([^'"]+)['"]/);
  if(source)check(source[1]);else for(const width of [480,960])check(`/arcade/approved-v1/${slug[1]}-${width}.webp`);
  dynamicReferences++;
}
assert(dynamicReferences>=14,'Artwork registry scan did not cover the current catalog');
const baseline=JSON.parse(readFileSync('docs/codex/evidence/storage-preserve-20261109.json','utf8'));
for(const [file,digest]of Object.entries(baseline.files))assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),digest,`Preserved file changed: ${file}`);
for(const url of baseline.publicUrls)check(url);
const config=JSON.parse(readFileSync('vercel.json','utf8'));
assert.deepEqual(config.functions,baseline.functions);assert.deepEqual(config.routes,baseline.routes);
console.log(JSON.stringify({pixelExactImages:proof.files.length,startupImages:startup.length,literalReferences,dynamicTiles:dynamicReferences,preservedFiles:Object.keys(baseline.files).length,retainedPublicUrls:baseline.publicUrls.length,functionsAndRoutes:'unchanged'}));
