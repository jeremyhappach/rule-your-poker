import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const sha=process.argv[2];assert.match(sha??'',/^[0-9a-f]{40}$/);
const evidence=[];
for(const base of ['https://ptown-poker.vercel.app','https://holm357.com']){
 const response=await fetch(base+'/build-manifest.json?check='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,200);const manifest=await response.json();assert.equal(manifest.buildId,sha);
 const asset=await fetch(base+'/'+manifest.bundleFilename,{signal:AbortSignal.timeout(15000)});assert.equal(asset.status,200);
 const bundle=await asset.text();assert.ok(bundle.includes('trip-flip/1'));assert.ok(bundle.includes('Trip Flip'));assert.ok(bundle.includes('trip-round-result'));assert.ok(bundle.includes('Runs must be arranged in ascending or descending order.'));
 const api=await fetch(base+'/api/arcade',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'start',game:'trip-flip'}),signal:AbortSignal.timeout(15000)});
 assert.equal(api.status,401,'unauthenticated admission stays denied');
 evidence.push({base,manifest,bundleBytes:bundle.length,unauthenticatedStatus:api.status});
}
writeFileSync('qualification.local/trip-flip/production-release.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence,null,2));
