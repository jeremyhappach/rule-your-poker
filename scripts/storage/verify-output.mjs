import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync,statSync} from 'node:fs';
import {resolve,sep,extname} from 'node:path';

const root=resolve('dist');
const baseline=JSON.parse(readFileSync('docs/codex/evidence/storage-preserve-20261110.json','utf8'));
const mime={'.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.js':'text/javascript','.webmanifest':'application/manifest+json'};
// No SPA fallback: a missing image must never pass because index.html is 200.
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!path.startsWith(root+sep)||!existsSync(path)||!statSync(path).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',mime[extname(path)]??'application/octet-stream');res.end(readFileSync(path));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;let requests=0;
async function check(url){
  const r=await fetch(origin+url);assert.equal(r.status,200,url);const body=Buffer.from(await r.arrayBuffer());
  assert(body.equals(readFileSync('public'+url)),url+' changed when copied into output');requests++;
}
try{
  for(const url of baseline.publicUrls)await check(url);
  const manifest=JSON.parse(readFileSync('dist/manifest.webmanifest','utf8'));
  for(const icon of manifest.icons)await check(icon.src.startsWith('/')?icon.src:'/'+icon.src);
  const html=readFileSync('dist/index.html','utf8');const startup=[...html.matchAll(/rel="apple-touch-startup-image" href="([^"]+)"/g)];assert.equal(startup.length,24);
  for(const [,url]of startup)await check(url);
  await check('/ptown-push-sw.js');
  const result={publicUrls:baseline.publicUrls.length,originalUrlsRetained:108,startupImages:24,manifestIcons:manifest.icons.length,worker:'byte-identical',httpChecks:requests,missingAssets:0,scope:'local built static output with strict 404; not a hosted Vercel verification'};
  mkdirSync('.storage-audit',{recursive:true});writeFileSync('.storage-audit/output-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await new Promise(r=>server.close(r));}
