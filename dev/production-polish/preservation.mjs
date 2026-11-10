import assert from 'node:assert/strict';
import {readFileSync as read,existsSync,writeFileSync as write} from 'node:fs';
import {createHash} from 'node:crypto';
import {decodePng,rgba} from '../../scripts/storage/png-lossless.mjs';
const baseline=JSON.parse(read('docs/codex/evidence/storage-preserve-20261110.json')),pngs=JSON.parse(read('docs/codex/evidence/storage-png-proof-20261110.json'));
// The earlier storage-only audit froze these two source files. They are the
// explicitly approved bonus orchestration owners in this subsequent release.
// Keep that historical audit immutable; verify every other preserved file.
const changedOwners=['server/delayed/adapter.ts','server/delayed/service.ts'];
for(const [file,hash]of Object.entries(baseline.files))if(!changedOwners.includes(file))assert.equal(createHash('sha256').update(read(file)).digest('hex'),hash,file);
for(const file of pngs.files){const image=decodePng(read(file.file));assert.equal(image.width,file.width);assert.equal(image.height,file.height);assert.equal(createHash('sha256').update(rgba(image)).digest('hex'),file.rgbaSha256,file.file);}
for(const url of baseline.publicUrls)assert(existsSync('public'+url),url);
const startup=[...read('index.html','utf8').matchAll(/rel="apple-touch-startup-image" href="([^"]+)"/g)];assert.equal(startup.length,24);
for(const [,url]of startup)assert(existsSync('public'+url));
const config=JSON.parse(read('vercel.json'));assert.deepEqual(config.functions,baseline.functions);assert.deepEqual(config.routes,baseline.routes);
const proof={pixelExactImages:pngs.files.length,startupImages:24,publicUrls:baseline.publicUrls.length,functionsAndRoutes:'unchanged',unchangedPreservedFiles:Object.keys(baseline.files).filter(x=>!changedOwners.includes(x)).length,qualifiedChangedOwners:changedOwners};
write('.polish-authority/preservation.json',JSON.stringify(proof,null,2));console.log(proof);
