import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='dev/mega-card-golf/rank-spacing/evidence.local/';
const base='http://127.0.0.1:5194/dev/mega-card-golf/rank-spacing/index.html';
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage(),errors=[],external=[],layouts=[],ink=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{
 if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}
 return route.continue();
});
async function load(query){await page.goto(base+query);await page.locator('[data-megatouch-face]').first().waitFor();await page.waitForTimeout(450);}
async function geometry(){return page.locator('.mega-card').evaluateAll(cards=>cards.map(card=>{
 const b=card.getBoundingClientRect(),inner=card.querySelector('.mega-card-inner').getBoundingClientRect();
 return {x:b.x,y:b.y,width:b.width,height:b.height,innerWidth:inner.width,innerHeight:inner.height};
}));}
try{
 for(const [name,width,height] of [['portrait',390,844],['landscape',844,390],['compact-portrait',320,568],['compact-landscape',568,320]]){
  await page.setViewportSize({width,height});
  await load('?game&before');const before=await geometry();
  await page.screenshot({path:dir+'before-'+name+'.png'});
  await load('?game');const after=await geometry();assert.deepEqual(after,before,'card containers changed');
  for(const card of after){assert(Math.abs(card.width/card.height-5/7)<.002);assert(card.x>=0&&card.y>=0&&card.x+card.width<=width&&card.y+card.height<=height);}
  await page.screenshot({path:dir+'after-'+name+'.png'});
  // Sample the actual MegaCard arrival animation at source, midpoint and landing.
  await load('?game&arrive');
  const flight=await page.evaluate(()=>{
   const inner=document.querySelector('[data-replacement-stage=arrive] .mega-card-inner'),a=inner.getAnimations()[0];
   if(!a)throw Error('Actual arrival animation missing');
   a.pause();const samples=[0,175,350].map(t=>{a.currentTime=t;const b=inner.getBoundingClientRect();return {time:t,width:b.width,height:b.height};});a.cancel();return samples;
  });
  for(const sample of flight)assert(Math.abs(sample.width/sample.height-5/7)<.002);
  layouts.push({name,width,height,cards:after,flight});
 }
 await page.setViewportSize({width:1100,height:900});
 const shared=[];
 for(const mode of ['before','after']){
  await load(mode==='before'?'?before':'');
  await page.screenshot({path:dir+mode+'-faces.png',fullPage:true});
  shared.push(await page.locator('.shared-faces').screenshot());
  const bounds=await page.locator('.type-grid [data-megatouch-face]').evaluateAll(async faces=>{
   const result=[];
   for(const face of faces){
    const parts={};
    for(const part of ['rank','suit']){
     const text=face.querySelector(`[data-megatouch-${part}]`),cs=getComputedStyle(text);
     const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
     svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('viewBox','-20 -20 140 180');svg.setAttribute('width','700');svg.setAttribute('height','900');
     const clone=text.cloneNode(true);
     for(const prop of ['font-family','font-weight','font-size','letter-spacing','text-anchor','dominant-baseline','transform'])clone.style.setProperty(prop,cs.getPropertyValue(prop));
     clone.style.fill='#000';svg.append(clone);
     const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));await image.decode();
     const canvas=document.createElement('canvas');canvas.width=700;canvas.height=900;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
     const pixels=ctx.getImageData(0,0,700,900).data;let left=700,top=900,right=0,bottom=0;
     for(let y=0;y<900;y++)for(let x=0;x<700;x++)if(pixels[(y*700+x)*4+3]>24){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
     parts[part]={left:left/5-20,top:top/5-20,right:(right+1)/5-20,bottom:(bottom+1)/5-20};
    }
    result.push({label:face.querySelector('[data-megatouch-rank]').textContent+suitLabel(face),...parts});
   }
   function suitLabel(face){return face.querySelector('[data-megatouch-suit]').textContent;}
   return result;
  });
  ink.push({mode,bounds});
 }
 assert(shared[0].equals(shared[1]),'Shared Small/Medium/Large faces changed');
 const before=ink[0].bounds,after=ink[1].bounds;assert.equal(after.length,52);
 for(let i=0;i<after.length;i++){
  const a=after[i],b=before[i];
  assert(a.rank.top<b.rank.top-5,'rank did not move up');
  assert(a.rank.left>=5&&a.rank.right<=95&&a.rank.top>=8,'rank edge clipping/padding');
  assert(a.rank.bottom+8<a.suit.top,'rank crowds suit');
  assert(a.suit.bottom<=134,'suit bottom clipping');assert.deepEqual(a.suit,b.suit,'suit changed');
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 writeFileSync(dir+'browser-report.json',JSON.stringify({layouts,ink,sharedFacesUnchanged:true,errors,external},null,2));
 const ten=after.find(c=>c.label==='10♠');
 console.log(JSON.stringify({passed:true,layouts:layouts.length,faces:after.length,ten,sharedFacesUnchanged:true,errors,external}));
}finally{await browser.close();}
