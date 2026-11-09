import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Only public GET/HEAD requests. No cookies, bearer credentials, form submission,
// session creation, game actions, push delivery or direct Supabase requests.
const origins=['https://holm357.com','https://ptown-poker.vercel.app'];
const functionPaths=['account-access','arcade','canasta','delayed','delayed-run21','mega-golf','run21','web-push'].map(name=>'/api/'+name);
const digest=text=>createHash('sha256').update(text).digest('hex');
export async function probeProduction(expectedSha,fetchImpl=fetch){
 const preserved=JSON.parse(readFileSync(new URL('../../docs/codex/evidence/storage-preserve-20261109.json',import.meta.url),'utf8'));
 const resources=[],manifests=[];
 const request=async(origin,path,method='GET')=>{
  assert(origins.includes(origin)&&path.startsWith('/')&&!path.startsWith('//'));
  const url=new URL(path,origin);assert.equal(url.origin,origin);
  const r=await fetchImpl(url,{method,redirect:'error',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
  return r;
 };
 for(const origin of origins){
  const mr=await request(origin,'/build-manifest.json');assert.equal(mr.status,200,'Manifest unavailable');
  const manifest=await mr.json();assert.equal(manifest.buildId,expectedSha,'Unexpected live build');manifests.push({origin,buildId:manifest.buildId});
  const home=await request(origin,'/');assert.equal(home.status,200);assert(home.headers.get('content-type')?.includes('text/html'));
  const html=await home.text();resources.push({origin,path:'/',status:home.status,sha256:digest(html)});
  const paths=new Set([...html.matchAll(/(?:src|href)=["'](\/[^"']+\.(?:js|css|png|webp|ico))["']/g)].map(m=>m[1]));
  assert([...paths].some(p=>p.endsWith('.js'))&&[...paths].some(p=>p.endsWith('.css')),'No production bundles');
  assert.equal([...paths].filter(p=>p.startsWith('/launch-splash/startup/')).length,24,'Startup selection changed');
  // All preserved public URLs on the primary origin; index-selected assets on both.
  if(origin===origins[0])preserved.publicUrls.forEach(p=>paths.add(p));
  paths.add('/manifest.webmanifest');paths.add('/ptown-push-sw.js');
  const all=[...paths].sort();
  for(let i=0;i<all.length;i+=6)await Promise.all(all.slice(i,i+6).map(async path=>{
   const r=await request(origin,path,'HEAD'),type=r.headers.get('content-type')??'';
   assert.equal(r.status,200,'Asset unavailable: '+path);assert(!type.includes('text/html'),'Asset fell back to SPA: '+path);
   resources.push({origin,path,status:r.status,type,length:r.headers.get('content-length')});
  }));
  for(const path of ['/auth','/delayed']){
   const r=await request(origin,path);assert.equal(r.status,200,'App shell unavailable: '+path);
   const body=await r.text();assert(r.headers.get('content-type')?.includes('text/html'));
   resources.push({origin,path,status:r.status,sha256:digest(body)});
  }
  for(const path of functionPaths){
   // These exact GET paths reject before backend work: method, route or absent
   // authorization guard. In particular, no cron secret is supplied to push.
   const r=await request(origin,path);
   const expected={'/api/account-access':405,'/api/arcade':409,'/api/canasta':404,'/api/delayed':405,'/api/delayed-run21':405,'/api/mega-golf':405,'/api/run21':401,'/api/web-push':401};
   assert.equal(r.status,expected[path],'Unexpected unauthenticated function response: '+path);
   assert(!r.headers.get('content-type')?.includes('text/html'),'Function fell back to HTML');
   const body=await r.json();assert.equal(typeof body.error,'string','Missing function rejection');
   if(path==='/api/canasta')assert.equal(body.error,'canasta:route');
   if(path==='/api/run21')assert.equal(body.error,'run21:authentication_required');
   if(path==='/api/web-push')assert.equal(body.error,'push:unauthorized');
   resources.push({origin,path,status:r.status,type:r.headers.get('content-type'),error:body.error});
  }
 }
 resources.sort((a,b)=>(a.origin+a.path).localeCompare(b.origin+b.path));
 return {expectedSha,manifests,resources,authenticatedSessionVerified:false,limitations:'Shell/authentication boundary only; no signed-in user or gameplay/database operation. Error-rate and account-usage checks remain separate read-only verification steps.'};
}
export function compareHealth(before,after){assert.deepEqual(after.manifests,before.manifests,'Production manifest changed');assert.deepEqual(after.resources,before.resources,'Production resources changed after deletion');}
