import {chromium} from 'playwright';
import {readFileSync,writeFileSync,readdirSync,unlinkSync} from 'node:fs';
// Encode the exact extracted pixels; no drawing, inpainting or replacement art.
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();
 for(const name of readdirSync('qualification.local/approved-source-regions')){
  const png=readFileSync('qualification.local/approved-source-regions/'+name).toString('base64');
  const data=await page.evaluate(async source=>{const img=new Image();img.src=source;await img.decode();const canvas=document.createElement('canvas');const scale=Math.min(1,384/img.width);canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/webp',.58).split(',')[1];},'data:image/png;base64,'+png);
  const base='public/game-branding/'+name.replace('.png','');
  writeFileSync(base+'.webp',Buffer.from(data,'base64'));
  try{unlinkSync(base+'.jpg');}catch(error){if(error.code!=='ENOENT')throw error;}
 }
} finally {await browser.close();}
