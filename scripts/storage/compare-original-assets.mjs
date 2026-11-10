// Measure an otherwise identical build with original PNG encodings restored in
// a separate scratch copy. Never changes dist, the working assets, or deployment.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {measureBuild,compareBuilds} from '../build-size-report.mjs';

mkdirSync('.storage-audit',{recursive:true});
const scratch=mkdtempSync('.storage-audit/unoptimized-output-');cpSync('dist',scratch,{recursive:true});
const proof=JSON.parse(readFileSync('docs/codex/evidence/storage-png-proof-20261110.json','utf8'));
for(const file of proof.files){
  assert(file.file.startsWith('public/')&&!file.file.includes('..'));
  const base=file.baseCommit??'97372c3b025d4b5b59b82bcaf617e0fb10f425f4';assert(/^[a-f0-9]{40}$/.test(base));
  const bytes=execFileSync('git',['show',`${base}:${file.file}`],{maxBuffer:20*1024*1024});assert.equal(bytes.length,file.before);
  writeFileSync(join(scratch,file.file.slice('public/'.length)),bytes);
}
const before=measureBuild(scratch),after=measureBuild('dist'),comparison=compareBuilds(before,after);
const report={method:'Matched compiled output; all original PNG encodings restored in a separate scratch copy. This is not a second production deployment or a production billing estimate.',before,after,comparison};
writeFileSync('.storage-audit/build-comparison-final.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(comparison));
