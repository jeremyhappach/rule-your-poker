import {build} from 'esbuild';import {chromium} from '@playwright/test';
import {createServer} from 'node:http';import {readFileSync as read,writeFileSync as write,mkdirSync,readdirSync} from 'node:fs';import {resolve,extname} from 'node:path';import assert from 'node:assert/strict';
const out='qualification.local/account-access';mkdirSync(out,{recursive:true});
await build({entryPoints:['dev/account-access/preview.tsx'],bundle:true,format:'esm',jsx:'automatic',platform:'browser',outfile:out+'/preview.js',alias:{'@':resolve('src')},define:{'import.meta.env.VITE_ASYNC_PUSH_ENABLED':'false'},plugins:[{name:'local-fixture',setup(b){b.onResolve({filter:/integrations\/supabase\/client$/},()=>({path:resolve('dev/account-access/preview-client.ts')}));}}]});
const css=readdirSync('dist/assets').find(f=>f.startsWith('index-')&&f.endsWith('.css'));
const server=createServer((req,res)=>{const path=new URL(req.url,'http://local').pathname;res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(path==='/preview.js'?read(out+'/preview.js'):path==='/style.css'?read('dist/assets/'+css):'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body class="bg-background"><div id="root"></div><script type="module" src="/preview.js"></script></body></html>');});
await new Promise(r=>server.listen(15454,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),checks=[];
try{for(const width of [320,390,844,1280]){
 const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/account-access',r=>r.fulfill({json:{ok:true}}));
 for(const scenario of ['pending','suspended','unverified','admin','notifications']){
  await page.goto('http://127.0.0.1:15454/?scenario='+scenario);
  if(scenario==='pending')await page.getByText('Account Pending Admin Approval').waitFor();
  if(scenario==='suspended')await page.getByText('Account Suspended — Contact Administrator.').waitFor();
  if(scenario==='unverified'){await page.getByText('Your email is not verified').waitFor();await page.getByRole('button',{name:'Resend verification email',exact:true}).click();await page.getByText('Verification email requested. Check your inbox and spam folder.').waitFor();await page.getByRole('button',{name:'Continue playing'}).click();await page.getByText('Playable content').waitFor();await page.evaluate(()=>window.accountFixture.suspend());await page.getByText('Account Suspended — Contact Administrator.').waitFor();}
  if(scenario==='admin'){
   await page.getByRole('button',{name:'Enable User',exact:true}).click();await page.getByRole('button',{name:'Disable User',exact:true}).waitFor();
   await page.getByRole('button',{name:'Disable User',exact:true}).click();await page.getByRole('alertdialog').waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();
   await page.getByRole('button',{name:'Disable User',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Disable User',exact:true}).click();
   await page.getByText('Suspended · Email Unverified').waitFor();await page.getByRole('alertdialog').waitFor({state:'hidden'});await page.getByLabel('Search username or email').fill('admin@example.invalid');assert.equal(await page.getByText('newplayer87',{exact:true}).count(),0);await page.getByLabel('Search username or email').fill('');
  }
  if(scenario==='notifications'){await page.getByRole('button',{name:'Notifications',exact:true}).click();await page.getByRole('checkbox',{name:'New User Registrations',exact:true}).waitFor();}
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}/${scenario}`);
  if(width===390&&scenario==='admin')await page.screenshot({path:out+'/admin-390.png',fullPage:true});checks.push({width,scenario});
 }
 assert.deepEqual(errors,[]);await page.close();
}mkdirSync('dev/account-access/evidence',{recursive:true});write('dev/account-access/evidence/browser.json',JSON.stringify({passed:true,checks,mockedNetwork:true},null,2));console.log('Browser proof PASS:',checks.length,'screen/viewport cases');}
finally{await browser.close();await new Promise(r=>server.close(r));}
