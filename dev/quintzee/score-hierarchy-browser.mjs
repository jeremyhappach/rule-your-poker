import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {connect} from './database.mjs';
const base='http://127.0.0.1:15318',dir='dev/quintzee/evidence/score-hierarchy';mkdirSync(dir,{recursive:true});
const c=await connect(JSON.parse(readFileSync('qualification.local/quintzee/release/browser-context.json','utf8')).database);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),cases=[],errors=[];
const cats=['ones','twos','threes','fours','fives','sixes','three_of_a_kind','four_of_a_kind','yahtzee','full_house','large_straight','chance'];
async function measure(p){return p.evaluate(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
 const row=document.querySelector('.q-bonuses'),field=rect(document.querySelector('.quintzee-plane')),r=rect(row),groups=[...row.children].map(rect),font=e=>parseFloat(getComputedStyle(e).fontSize);
 const base=document.querySelector('.q-base'),value=base.querySelector('strong'),pill=document.querySelector('.tri-score-cell[data-active=true] .tri-score-pill'),v=pill.querySelector('strong');
 const a=rect(base),b=rect(pill);
 return {row:r,field,groups,font:font(row),valueFont:font(row.querySelector('b')),bonusFont:font(row.querySelector('em')),baseFont:font(value),pillFont:font(v),baseColor:getComputedStyle(value).color,pillColor:getComputedStyle(v).color,
 rowFits:r.left>=field.left&&r.right<=field.right&&groups.every(g=>g.top>=r.top&&g.bottom<=r.bottom&&g.left>=r.left&&g.right<=r.right)&&groups[0].right<=groups[1].left&&[...row.querySelectorAll('span,em,b')].every(e=>{const g=rect(e),parent=rect(e.parentElement);return g.left>=parent.left-1&&g.right<=parent.right+1&&g.top>=parent.top-1&&g.bottom<=parent.bottom+1;}),
 categoryFits:[...document.querySelectorAll('.q-category')].every(e=>{const r=rect(e),label=rect(e.querySelector('span'));return r.height>=18&&label.top>=r.top-1&&label.bottom<=r.bottom+1;}),
 rollFits:(()=>{const e=document.querySelector('.q-roll');return !e||e.scrollHeight<=e.clientHeight+1;})(),
 rollGeometry:(()=>{const e=document.querySelector('.q-roll');return e?{height:e.clientHeight,scroll:e.scrollHeight,font:font(e),line:getComputedStyle(e).lineHeight,small:e.querySelector('small')?rect(e.querySelector('small')):null}:null;})(),
 nonOverlap:a.bottom<=b.top||b.bottom<=a.top||a.right<=b.left||b.right<=a.left,base:value.textContent};
 });}
try{for(const theme of ['classic','modern'])for(const solo of [true,false])for(const [width,height] of (process.env.QUINTZEE_LANDSCAPE_ONLY?[[844,390]]:[[320,568],[390,844],[844,390]])){
 const response=await fetch(base+'/__quintzee/new',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({solo,theme})});assert.ok(response.ok);const f=await response.json();
 const p=await browser.newPage({viewport:{width,height}});p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/dev/quintzee/production.html?'+new URLSearchParams(f),{waitUntil:'domcontentloaded'});
 await p.getByRole('button',{name:'Start',exact:true}).click();await p.locator('[data-category=chance]:not([disabled])').waitFor();
 const playing=await measure(p);assert.ok(playing.rowFits&&playing.nonOverlap&&playing.categoryFits&&playing.rollFits,JSON.stringify({theme,solo,width,playing}));assert.ok(playing.font>=18&&playing.font===playing.valueFont&&playing.font===playing.bonusFont);assert.ok(playing.baseFont<playing.pillFont);assert.notEqual(playing.baseColor,playing.pillColor);
 // Stress the widest legal upper subtotal without changing game authority.
 await p.locator('[data-upper-progress]').evaluate(e=>e.textContent='105/63');const widest=await measure(p);assert.ok(widest.rowFits,JSON.stringify({theme,solo,width,widest}));await p.locator('[data-upper-progress]').evaluate(e=>e.textContent='0/63');
 await p.screenshot({path:dir+'/'+f.mode+'-'+theme+'-'+width+'-playing.png'});
 const table=solo?'private.arcade_runs':'private.quintzee_matches',key=solo?'id':'dealer_game_id',path=solo?['board']:['core','board'];
 const data={phase:'playing',deadline:Date.now()+180000,scores:Object.fromEntries(cats.filter(x=>x!=='chance').map(x=>[x,0])),dice:[6,6,6,1,2],held:[],rollsRemaining:2,celebration:null,result:null};
 await c.query('UPDATE '+table+" SET state=jsonb_set(state,$2,(state#>$2)||$3::jsonb||jsonb_build_object('potentials',private.quintzee_v3_potentials((state#>$2)||$3::jsonb))),revision=revision+1 WHERE "+key+'=$1',[f.id,path,JSON.stringify(data)]);
 await p.reload();await p.locator('[data-category=chance]:not([disabled])').click();await p.locator('.tri-score-pill[data-centered=true]').waitFor();await p.waitForTimeout(500);
 const scoring=await measure(p);assert.ok(scoring.nonOverlap,JSON.stringify({theme,solo,width,scoring}));assert.ok(scoring.baseFont<scoring.pillFont);assert.equal(scoring.base,'56');await p.screenshot({path:dir+'/'+f.mode+'-'+theme+'-'+width+'-scoring.png'});
 cases.push({theme,mode:f.mode,width,height,playing,scoring});console.log(theme+' '+f.mode+' '+width+' PASS');await p.close();
}assert.deepEqual(errors,[]);writeFileSync(dir+'/browser.json',JSON.stringify({passed:true,at:new Date().toISOString(),cases,errors},null,2));}catch(error){console.error(error);throw error;}finally{await c.end();await browser.close();}
