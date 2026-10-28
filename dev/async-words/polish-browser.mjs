import {chromium} from '@playwright/test';
import {existsSync,readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
import {connect} from './local.mjs';
const ctx=JSON.parse(read('qualification.local/async-words/browser-context.json','utf8')),root='http://127.0.0.1:15319',errors=[];
const db=await connect(ctx.database),browser=await chromium.launch({headless:true,executablePath:['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)});
try{
 const pages=await Promise.all(ctx.tokens.map(async token=>{const p=await browser.newPage({viewport:{width:390,height:844}});p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));await p.goto(root+'/delayed/new?token='+token,{waitUntil:'commit',timeout:60000});return p;}));
 const [a,b]=pages;await a.getByRole('option',{name:ctx.names[1]}).waitFor({state:'attached'});
 await a.getByLabel('Filter opponents').fill(ctx.names[1]);await a.getByLabel('Opponent',{exact:true}).selectOption(ctx.users[1]);await a.getByLabel('Stake',{exact:true}).fill('9');
 await a.screenshot({path:'qualification.local/async-words/polish-invite-mobile.png'});
 await a.getByRole('button',{name:'Review invitation'}).click();await a.getByRole('button',{name:'Send invitation'}).click();await a.getByRole('button',{name:'Cancel invitation'}).waitFor();const match=a.url().split('/').at(-1);
 assert.equal(await a.locator('.delayed-net').count(),0);await b.goto(root+'/delayed/'+match);assert.equal(await b.locator('.delayed-net').count(),0);
 await b.getByRole('button',{name:'Accept lineup and stakes'}).click();await b.getByText(/active · 0\/1 complete/).waitFor();await a.reload();await a.getByRole('button',{name:/Notifications/}).click();await a.locator('a[href="/delayed/'+match+'"]').filter({hasText:'Invitation accepted'}).waitFor();await a.keyboard.press('Escape');
 const child=(await db.query('SELECT * FROM private.delayed_children WHERE match_id=$1',[match])).rows[0],actor=pages[ctx.users.indexOf(child.actor)],peer=pages[1-ctx.users.indexOf(child.actor)];
 // Local synthetic deal only, preserving all 100 tile identities and rack sizes.
 const state=child.state,pool=[...state.bag,...Object.values(state.racks).flat()],take=face=>pool.splice(pool.findIndex(t=>t.face===face),1)[0];
 const rack=['C','A','T'].map(take);rack.push(...pool.splice(0,4));const other=ctx.users.find(id=>id!==child.actor);state.racks={[child.actor]:rack,[other]:pool.splice(0,7)};state.bag=pool;
 await db.query('UPDATE private.delayed_children SET state=$2 WHERE id=$1',[child.id,state]);
 await actor.goto(root+'/delayed');await actor.locator('[data-turn="own"]').filter({has:actor.locator('a[href="/delayed/'+match+'"]')}).waitFor();await actor.getByRole('button',{name:/Notifications/}).click();await actor.locator('li').filter({has:actor.locator('a[href="/delayed/'+match+'"]')}).getByRole('button',{name:'1 available turn',exact:true}).click();await actor.locator('.words-rack[data-actionable="true"]').waitFor();
 await actor.locator('[data-square="112"]').click();await actor.getByRole('button',{name:'C, 3 points',exact:true}).first().click();await actor.locator('[data-square="112"]').click();await actor.locator('.is-staged').waitFor();
 await actor.getByRole('button',{name:'A, 1 points',exact:true}).first().click();await actor.locator('[data-square="113"]').click();await actor.waitForFunction(()=>document.querySelectorAll('.is-staged').length===2);
 await actor.getByRole('button',{name:'T, 1 points',exact:true}).first().click();await actor.waitForFunction(()=>document.querySelectorAll('.is-staged').length===3);
 await actor.screenshot({path:'qualification.local/async-words/polish-draft-mobile.png'});assert.equal(await actor.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await actor.getByRole('button',{name:'Submit Word',exact:true}).click();await actor.locator('.words-score-plus').waitFor();assert(actor.url().includes('/play/'));await actor.screenshot({path:'qualification.local/async-words/polish-score-mobile.png'});
 await actor.waitForTimeout(1800);assert(actor.url().includes('/play/'));await actor.waitForURL(root+'/delayed/'+match);
 const result=(await db.query('SELECT state FROM private.delayed_children WHERE id=$1',[child.id])).rows[0].state;assert.equal(result.moves.length,1);assert.equal(result.moves[0].words[0].word,'CAT');
 await peer.goto(root+'/delayed');await peer.locator('[data-turn="own"]').filter({has:peer.locator('a[href="/delayed/'+match+'"]')}).waitFor();await peer.goto(root+'/delayed/'+match+'/play/'+child.id);await peer.locator('.words-rack[data-actionable="false"]').waitFor();await peer.waitForFunction(()=>document.querySelectorAll('.words-cell.has-tile').length>0);assert((await peer.locator('.words-cell.has-tile').count())<=3);
 await peer.locator('.words-score-plus').waitFor();await peer.screenshot({path:'qualification.local/async-words/polish-opponent-mobile.png'});await peer.reload();await peer.locator('.words-rack[data-actionable="true"]').waitFor();assert.equal(await peer.locator('.words-cell.has-tile').count(),3);
 await peer.setViewportSize({width:1440,height:900});await peer.screenshot({path:'qualification.local/async-words/polish-turn-desktop.png'});assert.equal(await peer.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await peer.reload();await peer.locator('.words-rack[data-actionable="true"]').waitFor();assert.equal(await peer.locator('.words-score-plus').count(),0);
 assert.deepEqual(errors,[]);write('qualification.local/async-words/polish-browser.json',JSON.stringify({passed:true,match,child:child.id,actor:child.actor,errors,checks:['immediate filtered opponents','pending totals hidden','acceptance notice','authoritative own-turn green and direct navigation','CAT auto placement and actual server score','own score hold before home','opponent replay, reload and receipt retirement','390x844 and 1440x900 without overflow']},null,2));console.log('PASS local polish browser flow',match);
}catch(e){console.error(e);for(const c of browser.contexts())for(const p of c.pages())console.log((await p.locator('body').innerText()).slice(0,1800));throw e;}finally{await browser.close();await db.end();}
