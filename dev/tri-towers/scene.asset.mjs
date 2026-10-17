import {chromium} from '@playwright/test';import {readFileSync,writeFileSync} from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true});try{const page=await browser.newPage();
const data='data:image/png;base64,'+readFileSync(process.argv[2]).toString('base64');
const out=await page.evaluate(async data=>{const img=new Image();img.src=data;await img.decode();const c=document.createElement('canvas');c.width=1440;c.height=480;c.getContext('2d').drawImage(img,0,0,1440,480);return c.toDataURL('image/webp',.88).split(',')[1];},data);
writeFileSync('src/assets/cartoon/grass.webp',Buffer.from(out,'base64'));}finally{await browser.close();}
