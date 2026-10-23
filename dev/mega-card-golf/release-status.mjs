import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const expected=process.argv[2];assert.match(expected??'',/^[a-f0-9]{40}$/);
const response=await fetch('https://holm357.com/build-manifest.json?mega='+Date.now(),{headers:{'Cache-Control':'no-cache'}});assert(response.ok);
const manifest=await response.json();assert.equal(manifest.buildId,expected);
writeFileSync('dev/mega-card-golf/evidence/production-manifest.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify({manifest}));
