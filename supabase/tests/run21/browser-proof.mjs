// Isolated component/authority integration; all network traffic stays on loopback.
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

export async function openBrowserProof(vite, worker, game, users) {
 const tokens=users.map(()=>randomUUID()), errors=[];
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/_run21-proof'){
   res.setHeader('Content-Type','text/html');
   res.end(await vite.transformIndexHtml(url.pathname,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}</style></head><body><div id="root"></div><script type="module" src="/supabase/tests/run21/browser-proof.tsx"></script></body></html>'));return;
  }
  if(url.pathname==='/_run21-api'){
   const index=tokens.indexOf(url.searchParams.get('token'));
   if(index<0){res.statusCode=403;res.end();return;}
   try{
    if(req.method==='POST'){
     let body='';for await(const part of req)body+=part;
     await worker.act(game,users[index],JSON.parse(body));
    }
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await worker.read(game,users[index])));
   }catch(error){res.statusCode=400;res.end(JSON.stringify({error:String(error)}));}return;
  }
  vite.middlewares(req,res,()=>{res.statusCode=404;res.end();});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,channel:'msedge'}),pages=[];
 try{
  for(let i=0;i<2;i++){
   const context=await browser.newContext({viewport:{width:1120,height:860}});
   await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
   const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`${base}/_run21-proof?token=${tokens[i]}`);
   try {await page.locator('[data-fullscreen-game-shell]').waitFor({timeout:10000});}
   catch(error){throw new Error(`${error.message}; page errors: ${JSON.stringify(errors)}; body: ${await page.locator('body').innerText()}`);}
  }
  return {
   async act(user,command){
    const page=pages[users.indexOf(user)];
    await page.reload();await page.locator('[data-fullscreen-game-shell]').waitFor();
    const button=command.intent.type==='place'?page.getByRole('button',{name:new RegExp(`^Place in column ${command.intent.column+1},`)})
     :page.getByRole('button',{name:/^Take Win/});
    await button.click();
    await page.waitForFunction(revision=>Number(document.querySelector('[data-proof-revision]')?.getAttribute('data-proof-revision'))>revision,command.revision);
    assert.deepEqual(errors,[]);
    return worker.read(game,user);
   },
   async finish(){
    for(const page of pages){await page.reload();await page.locator('[data-fullscreen-game-shell]').waitFor();}
    await pages[0].screenshot({path:'qualification.local/run21-production/two-browser-terminal.png'});
    assert.deepEqual(errors,[]);
   },
   async close(){await browser.close();await new Promise(resolve=>server.close(resolve));},
  };
 }catch(error){await browser.close();await new Promise(resolve=>server.close(resolve));throw error;}
}
