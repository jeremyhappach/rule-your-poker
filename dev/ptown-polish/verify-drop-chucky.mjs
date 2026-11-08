import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const expected=process.argv[2];
assert.match(expected??'',/^[a-f0-9]{40}$/);
const base='https://ptown-poker.vercel.app';
const get=async path=>{
 const response=await fetch(base+path+'?verify='+expected,{cache:'no-store'});
 assert.equal(response.status,200,path);return response;
};
const manifest=await (await get('/build-manifest.json')).json();
assert.equal(manifest.buildId,expected);
for(const game of ['357-drop','chucky-showdown']){
 assert.ok((await (await get('/arcade/'+game)).text()).includes(manifest.bundleFilename));
}
const hash=data=>createHash('sha256').update(data).digest('hex');
for(const name of ['357-drop-riverfront-background.png','chucky-portrait-four-cards.png']){
 const path='/arcade/'+name,response=await get(path);
 assert.equal(response.headers.get('content-type')?.split(';')[0],'image/png');
 assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(readFileSync('public'+path)));
}
console.log('PASS: published commit, both Arcade shells and exact supplied artwork bytes match',expected);
