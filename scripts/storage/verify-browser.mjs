// Offline native browser decoder cross-check, independent of the PNG encoder.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const proof=JSON.parse(readFileSync('docs/codex/evidence/storage-png-proof-20261110.json','utf8'));
const baseline=JSON.parse(readFileSync('docs/codex/evidence/storage-preserve-20261109.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});const results=[];
try{
  const context=await browser.newContext();await context.route('**/*',route=>route.abort());
  const page=await context.newPage();
  for(const file of proof.files){
    const before=execFileSync('git',['show',`${file.baseCommit??baseline.baseCommit}:${file.file}`],{maxBuffer:20*1024*1024});
    const after=readFileSync(file.file);
    const result=await page.evaluate(async({before,after})=>{
      const decode=async base64=>{const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);return{width:canvas.width,height:canvas.height,pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data};};
      const a=await decode(before),b=await decode(after);let changed=0;
      if(a.width!==b.width||a.height!==b.height)return{dimensionsEqual:false};
      for(let i=0;i<a.pixels.length;i++)if(a.pixels[i]!==b.pixels[i])changed++;
      return{dimensionsEqual:true,width:a.width,height:a.height,changedChannels:changed};
    },{before:before.toString('base64'),after:after.toString('base64')});
    assert(result.dimensionsEqual,`${file.file}: browser dimensions changed`);assert.equal(result.changedChannels,0,`${file.file}: browser rendering changed`);
    results.push({file:file.file,...result});
  }
}finally{await browser.close();}
mkdirSync('.storage-audit',{recursive:true});writeFileSync('.storage-audit/browser-pixels.json',JSON.stringify({browser:'installed Edge / Chromium',network:'all requests blocked; data URLs only',physicalIPhoneVerified:false,results},null,2)+'\n');
console.log(`${results.length} PNGs decode to exactly the same browser pixels. No network requests allowed.`);
