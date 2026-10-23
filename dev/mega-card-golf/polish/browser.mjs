import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out='dev/mega-card-golf/polish/evidence.local';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[],errors=[],requests=[],external=[];
try{
 for(const [label,width,height] of [['portrait',390,844],['landscape',844,390],['compact',320,568],['compact-landscape',568,320]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname)){external.push(url.origin);await route.abort();return;}
   if(url.pathname==='/__mega'){
    const body=route.request().postDataJSON();requests.push(body);
    if(body.op==='leaderboard'){
     const offset=body.courseId==='sunny-meadows'?0:body.courseId==='coastal-links'?9:18;
     const rows=['Birdie','Ace','Clover','Sunny','Chip','River','Hazel','Robin','Aspen','Sky'].map((name,i)=>({runId:body.courseId+'-'+i,name,rank:i===1?1:i+1,score:offset+(i<2?-8:i*3)+(body.window==='30'?2:0)}));
     await route.fulfill({json:{id:body.courseId,boardId:body.boardId,rows,self:null,personalBest:null}});return;
    }
   }await route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5187/dev/mega-card-golf/polish/index.html');
  await page.getByRole('heading',{name:'Select a Course',exact:true}).waitFor();
  await page.getByText('Course record: -8',{exact:true}).waitFor();
  const fit=await page.locator('.mega-app').evaluate(el=>({scroll:el.scrollHeight,height:el.clientHeight,tiles:[...el.querySelectorAll('.mega-course-tile')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom};})}));
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.mega-course-tile')].map(el=>new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=reject;image.src=getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/)[1];})));});
  await page.screenshot({path:out+'/'+label+'-selection.png'});
  assert(fit.scroll<=fit.height+1,'Selection scrolls: '+label);assert(fit.tiles.every(r=>r.bottom<=height&&r.h>=44),'Tiles outside screen: '+label);
  assert((await page.getByRole('button',{name:'Select Devil’s Canyon',exact:true}).textContent()).includes('1 discard per hole'));
  await page.getByText('Course record: +1',{exact:true}).waitFor();await page.getByText('Course record: +10',{exact:true}).waitFor();
  const panels=[];
  const before=requests.filter(r=>r.op==='start').length;
  for(const name of ['Sunny Meadows','Coastal Links','Devil’s Canyon']){
   await page.getByRole('button',{name:'Select '+name,exact:true}).click();
   await page.getByRole('heading',{name:'Top Ten',exact:true}).waitFor();
   await page.locator('tbody tr').nth(9).waitFor();
   assert.equal(requests.filter(r=>r.op==='start').length,before,'Selection started run');
   await page.getByRole('button',{name:'All Time',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('tbody tr td:last-child')?.textContent?.match(/^-8$|^1$|^10$/));
   if(name==='Devil’s Canyon')assert((await page.locator('.mega-course-heading').textContent()).includes('1 discard per hole'));
   if(name==='Coastal Links'){const art=await page.locator('.mega-clubhouse').boundingBox(),panel=await page.locator('.mega-course-board').boundingBox();assert(art&&panel&&art.y+art.height-panel.y-panel.height>=39,'Coastal shoreline obscured below panel');}
   const key=name==='Sunny Meadows'?'sunny':name==='Coastal Links'?'coastal':'canyon';
   await page.screenshot({path:out+'/'+label+'-'+key+'.png'});
   assert.equal(await page.locator('tbody tr').count(),10);
   const panel=await page.locator('.mega-course-board').evaluate(el=>({height:el.clientHeight,content:el.firstElementChild.getBoundingClientRect().height,scroll:el.scrollHeight}));
   assert(panel.height<=panel.content+26,'Leaderboard stretches beyond content: '+label+' '+name);panels.push({name,...panel});
   await page.locator('tbody tr').nth(9).scrollIntoViewIfNeeded();
   const last=await page.locator('tbody tr').nth(9).boundingBox();assert(last&&last.y>=0&&last.y+last.height<=height,'Last leaderboard row unreachable');
   if(label.includes('landscape'))await page.screenshot({path:out+'/'+label+'-'+key+'-bottom.png'});
   await page.locator('.mega-course-board').evaluate(el=>el.scrollTop=0);
   for(const button of ['Start Game','Return to Clubhouse','Last 30 Days','All Time']){const b=await page.getByRole('button',{name:button,exact:true}).boundingBox();assert(b&&b.height>=44,button+' touch target');}
   await page.getByRole('button',{name:'Return to Clubhouse',exact:true}).click();
   await page.getByRole('heading',{name:'Select a Course',exact:true}).waitFor();
  }
  if(label==='portrait'){
   await page.getByRole('button',{name:'Select Sunny Meadows',exact:true}).click();await page.getByRole('button',{name:'Start Game',exact:true}).click();
   await page.getByRole('button',{name:'Reveal selected',exact:true}).waitFor();assert.equal(requests.filter(r=>r.op==='start').length,before+1);
   await page.screenshot({path:out+'/start-game.png'});
  }
  if(label==='portrait'||label==='landscape'){
   await page.goto('http://127.0.0.1:5187/dev/mega-card-golf/polish/index.html?surface=lobby');
   await page.getByRole('button',{name:'Defaults',exact:true}).waitFor();await page.screenshot({path:out+'/'+label+'-lobby.png'});
   await page.getByRole('button',{name:'Defaults',exact:true}).click();
   await page.getByRole('combobox',{name:'Game',exact:true}).selectOption('mega-card-golf');
   await page.getByLabel('Course name',{exact:true}).waitFor();
   await page.screenshot({path:out+'/'+label+'-defaults.png'});
   await page.getByLabel('Course name',{exact:true}).scrollIntoViewIfNeeded();
   await page.screenshot({path:out+'/'+label+'-defaults-fields.png'});
  }
  results.push({label,width,height,fit,panels,passed:true});await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log(JSON.stringify({results,errors,external,startRequests:requests.filter(r=>r.op==='start').length}));
}finally{writeFileSync(out+'/browser-report.json',JSON.stringify({results,errors,external,requests},null,2));await browser.close();}
