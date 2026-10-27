import {chromium} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const sha=process.argv[2];assert.match(sha,/^[0-9a-f]{40}$/);
const base='https://holm357.com';
const response=await fetch(base+'/build-manifest.json',{headers:{'Cache-Control':'no-cache'}});
assert.equal(response.status,200);const manifest=await response.json();assert.equal(manifest.buildId,sha);
const bundle=await fetch(base+'/'+manifest.bundleFilename);assert.equal(bundle.status,200);
const output='qualification.local/ptown-words/banks-publication';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const cases=[];
try {
 for(const viewport of [{width:390,height:760},{width:1280,height:800}]){
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const navigation=await page.goto(base,{waitUntil:'networkidle'});assert.equal(navigation.status(),200);
  const actualSha=await page.locator('meta[name="app-build-sha"]').getAttribute('content');assert.equal(actualSha,sha);
  const text=await page.locator('body').innerText();assert.ok(text.trim().length>30,'Production application renders');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No page overflow');
  assert.deepEqual(errors,[]);await page.screenshot({path:`${output}/${viewport.width}.png`});
  cases.push({viewport,url:page.url(),sha:actualSha,text:text.slice(0,600),errors});await page.close();
 }
 writeFileSync(`${output}/evidence.json`,JSON.stringify({passed:true,manifest,cases,scope:'Public production load in fresh unauthenticated contexts; hosted rollback proofs qualify gameplay authority. Owner gameplay smoke remains separate.'},null,2));
 console.log(JSON.stringify({passed:true,sha,cases}));
} finally {await browser.close();}
