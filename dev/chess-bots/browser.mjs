import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
const out='qualification.local/chess-bots',rows=JSON.parse(read(out+'/defaults.json','utf8'));rows[0].chess_bot_difficulty='medium';
const saves=[],errors=[],report=[];
const server=await createServer({configFile:false,envFile:false,plugins:[react(),{name:'local-chess-bot-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 if(!req.url?.startsWith('/fixture/'))return next();res.setHeader('Content-Type','application/json');
 if(req.url==='/fixture/view'){res.end(read(out+'/medium-view.json'));return;}
 let text='';for await(const chunk of req)text+=chunk;const body=text?JSON.parse(text):{};
 if(body.table==='game_defaults'){if(body.value){assert(['easy','medium','expert'].includes(body.value.chess_bot_difficulty));Object.assign(rows[0],body.value);saves.push(body.value.chess_bot_difficulty);}res.end(JSON.stringify({data:rows,error:null}));}
 else res.end(JSON.stringify({data:body.single?{play_sounds:false}:body.table?[]:{},error:null}));
 });}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/chess-bots/client.ts')},{find:'@',replacement:resolve('src')}]},server:{host:'127.0.0.1',port:5193,strictPort:true}});
await server.listen();const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 for(const [width,height] of [[390,844],[844,390],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  rows[0].chess_bot_difficulty='medium';await page.goto('http://127.0.0.1:5193/dev/chess-bots/');
  await page.getByRole('tab',{name:'Other',exact:true}).click();await page.locator('select.catalog-select').selectOption('chess');
  const difficulty=page.getByLabel('Bot difficulty');await difficulty.waitFor();assert.equal(await difficulty.inputValue(),'medium');assert.deepEqual(await difficulty.locator('option').allTextContents(),['Easy','Medium','Expert']);
  for(const level of ['easy','expert','medium']){await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Save Defaults'&&!b.disabled));await difficulty.selectOption(level);await page.getByRole('button',{name:'Save Defaults',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[role=dialog]'));assert.equal(rows[0].chess_bot_difficulty,level);await Promise.all([page.waitForResponse(r=>r.url().endsWith('/fixture/table')&&r.request().postDataJSON()?.table==='game_defaults'&&!r.request().postDataJSON()?.value),page.getByRole('button',{name:'Open defaults',exact:true}).click()]);await page.waitForFunction(level=>document.querySelector('#chess-bot-difficulty')?.value===level,level);}
  await page.waitForTimeout(300);await page.screenshot({path:out+`/defaults-${width}.png`});
  await page.goto('http://127.0.0.1:5193/dev/chess-bots/?board');await page.locator('.chess-board').waitFor();assert.equal(await page.locator('.chess-square').count(),64);await page.waitForFunction(()=>document.querySelector('.chess-board').getBoundingClientRect().width>180);await page.waitForTimeout(400);const board=await page.locator('.chess-board').boundingBox();assert(board.x>=0&&board.y>=0&&board.x+board.width<=width+1&&board.y+board.height<=height+1);await page.screenshot({path:out+`/board-${width}.png`});
  report.push({width,height,defaults:'all levels save and reopen',board:'rendered actual worker result'});await page.close();
 }
 assert.deepEqual(errors,[]);write(out+'/browser.json',JSON.stringify({report,saves,errors},null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await server.close();}
