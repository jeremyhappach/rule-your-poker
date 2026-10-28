import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath}),page=await browser.newPage({viewport:{width:390,height:844}}),out='qualification.local/canasta/playability/';
try{for(const count of [15,30]){
 await page.goto('http://127.0.0.1:4338/?scene='+count);await page.locator('.canasta-card').first().waitFor();
 assert.equal(await page.locator('.canasta-card').count(),count);
 if(count===30)await page.getByText('Rank order · Scroll ↕',{exact:true}).waitFor();
 await page.screenshot({animations:'disabled',path:out+count+'-390.png'});
 if(count===30){await page.locator('.canasta-card').last().scrollIntoViewIfNeeded();await page.screenshot({animations:'disabled',path:out+'30-bottom-390.png'});}
}console.log('Final 15/30-card captures and visible scroll cue pass.');}finally{await browser.close();}
