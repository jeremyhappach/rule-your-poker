import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {measureBuild,compareBuilds} from '../build-size-report.mjs';
import {decodePng,optimizePng,rgba} from './png-lossless.mjs';

function fixture(){
  mkdirSync('.storage-audit',{recursive:true});const dir=mkdtempSync('.storage-audit/report-test-');
  writeFileSync(join(dir,'build-manifest.json'),JSON.stringify({buildId:'a'.repeat(40)}));
  writeFileSync(join(dir,'index.html'),'<html></html>');return dir;
}
test('reports nested static bytes and does not confuse gzip estimates with actual files',()=>{
  const dir=fixture();mkdirSync(join(dir,'sounds'));writeFileSync(join(dir,'sounds/a.wav'),Buffer.alloc(123));
  const report=measureBuild(dir);assert.equal(report.byCategory.audio.bytes,123);assert.equal(report.fileCount,3);
  assert.equal(report.totalBytes,report.files.reduce((n,f)=>n+f.bytes,0));assert.equal(report.files[0].sha256.length,64);
});
test('missing output and missing build identity cannot produce a misleading zero-byte pass',()=>{
  assert.throws(()=>measureBuild('.storage-audit/not-a-build'));const dir=fixture();
  writeFileSync(join(dir,'build-manifest.json'),'{}');assert.throws(()=>measureBuild(dir),/identity/);
});
test('comparison retains removed categories and signed increases',()=>{
  const result=compareBuilds({totalBytes:100,byCategory:{image:{bytes:90},other:{bytes:10}}},{totalBytes:120,byCategory:{audio:{bytes:110},other:{bytes:10}}});
  assert.equal(result.savedBytes,-20);assert.equal(result.byCategory.image.saved,90);assert.equal(result.byCategory.audio.saved,-110);
});
test('CLI fails closed above the budget and for invalid budgets',()=>{
  const dir=fixture();for(const budget of ['1','invalid']){
    const result=spawnSync(process.execPath,['scripts/build-size-report.mjs',dir,'--max-bytes',budget]);assert.equal(result.status,1);
  }
});
test('encoder rejects corrupted bytes before any rewrite',()=>{
  const bytes=Buffer.from(readFileSync('public/launch-splash/startup/opening-640x1136.png'));bytes[40]^=1;
  assert.throws(()=>decodePng(bytes),/CRC/);
});
test('transparent artwork remains pixel-exact and never grows',()=>{
  const before=readFileSync('public/arcade/chucky-portrait-four-cards.png'),source=decodePng(before),result=optimizePng(before);
  assert.equal(source.channels,4);assert(rgba(source).some((value,index)=>index%4===3&&value<255));
  assert(result.bytes.length<=before.length);assert(rgba(source).equals(rgba(decodePng(result.bytes))));
});
