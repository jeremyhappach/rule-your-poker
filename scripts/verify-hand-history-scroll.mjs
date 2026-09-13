// Real dialog/layout regression with fixture data; no database connections.
// Run: node scripts/verify-hand-history-scroll.mjs [--expect-blocked]
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { chromium } from '@playwright/test';

const expectBlocked = process.argv.includes('--expect-blocked');
const output = 'artifacts/hand-history-scroll';
mkdirSync(output, { recursive: true });
const participants = [{ playerId: 'hap', userId: 'viewer', name: 'Hap' }];
const games = [{ id: 'dealer', gameType: 'holm-game', startedAt: '2026-09-12T12:00:00Z', config: {},
  hands: [1, 2, 3].map(handNumber => ({ id: `hand-${handNumber}`, handNumber, participants,
    opening: { stacks: { hap: 100 }, pot: 10 }, closing: { stacks: { hap: 110 }, pot: 0 },
    scoresAfter: null, terminal: false, provenance: 'captured',
    events: Array.from({ length: 50 }, (_, i) => ({ id: `action-${handNumber}-${i}`, roundId: `round-${handNumber}`, roundNumber: 1,
      sequence: i + 1, type: 'action', actorId: 'hap', payload: { action: i % 2 ? 'fold' : 'stay' }, occurredAt: '2026-09-12T12:00:00Z' })),
  })),
}];
const mockClient = `
const result = {data:[],count:1,error:null};
const query = new Proxy({}, {get(_target,key){return key==='then' ? (resolve,reject)=>Promise.resolve(result).then(resolve,reject) : ()=>query;}});
const channel = {on(){return channel;},subscribe(){return channel;}};
export const supabase = {from(){return query;},rpc:async()=>({data:{version:1,games:${JSON.stringify(games)}},error:null}),
auth:{getSession:async()=>({data:{session:{user:{id:'viewer'}}}})},channel(){return channel;},removeChannel:async()=>{}};`;
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {SessionResults} from './src/components/SessionResults.tsx';
const session={id:'session',created_at:'2026-09-12T12:00:00Z',session_ended_at:'2026-09-12T13:00:00Z',total_hands:3,host_username:'Hap',players:[]};
createRoot(document.getElementById('root')).render(React.createElement(SessionResults,{open:true,onOpenChange:()=>{},session,currentUserId:'viewer'}));`;
const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'jsx' },
  bundle: true, write: false, format: 'esm', jsx: 'automatic', alias: { '@': resolve('src') }, loader: {'.png':'dataurl'},
  plugins: [{name:'fixture-client',setup(builder){builder.onLoad({filter:/integrations[\\/]supabase[\\/]client\.ts$/},()=>({contents:mockClient,loader:'js'}));}}],
});
const css = await postcss([tailwindcss('./tailwind.config.ts')]).process(readFileSync('src/index.css','utf8'), {from:'src/index.css'});
const html = '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>';
const server = createServer((req,res)=>{
  const type = req.url==='/entry.js' ? 'text/javascript' : req.url==='/style.css' ? 'text/css' : 'text/html';
  res.setHeader('Content-Type',type);res.end(req.url==='/entry.js' ? bundle.outputFiles[0].text : req.url==='/style.css' ? css.css : html);
});
await new Promise(resolve=>server.listen(8084,'localhost',resolve));
let browser;
const results = [];
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith('http://localhost:8084/') ? route.continue() : route.abort());
    await page.goto('http://localhost:8084/history-scroll');
    await page.getByRole('button', { name: 'Hand History', exact: true }).click();
    await page.getByRole('button', { name: /Holm/ }).click();
    await page.getByText('Hand 1', { exact: true }).click();
    const scroller = page.locator('[data-canonical-hand-history]').locator('..');
    const geometry = await scroller.evaluate(el => {
      const dialog = el.closest('[role="dialog"]').getBoundingClientRect();
      return { client: el.clientHeight, content: el.scrollHeight, top: dialog.top, bottom: dialog.bottom, height: innerHeight };
    });
    const blocked = geometry.content <= geometry.client || geometry.top < 0 || geometry.bottom > geometry.height;
    if (expectBlocked) {
      assert(blocked, 'Expected to reproduce unbounded dialog before correction');
      results.push({ viewport, reproduced: true, geometry });
    } else {
      assert(!blocked, JSON.stringify(geometry));
      const box = await scroller.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 500);
      await page.waitForFunction(() => document.querySelector('[data-canonical-hand-history]').parentElement.scrollTop > 0);
      const wheelTop = await scroller.evaluate(el => el.scrollTop);
      await scroller.evaluate(el => { el.scrollTop = 0; });
      const cdp = await context.newCDPSession(page);
      const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height * 0.8);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let n = 1; n <= 6; n++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - n * Math.min(30, box.height / 12) }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => document.querySelector('[data-canonical-hand-history]').parentElement.scrollTop > 0);
      const touchTop = await scroller.evaluate(el => el.scrollTop);
      await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.getByText('Hand 3', { exact: true }).click();
      assert(await page.getByRole('heading', { name: 'Hand History' }).isVisible(), 'Header must remain visible');
      assert(await page.getByRole('button', { name: 'Close', exact: true }).isVisible(), 'Close must remain visible');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}.png` });
      results.push({ viewport, passed: true, geometry, wheelTop, touchTop });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  writeFileSync(`${output}/${expectBlocked ? 'before' : 'after'}.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} catch(error) { console.error(error); throw error; }
finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
