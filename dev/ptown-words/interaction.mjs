import {chromium} from '@playwright/test';import {readFileSync as read,writeFileSync as write} from 'node:fs';import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';import {connect,context} from './database.mjs';
const f=JSON.parse(read('qualification.local/ptown-words/live.json','utf8')),db=await connect(context().database),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const query=async(sql,params=[])=>(await db.query(sql,params)).rows[0];
async function rpc(user,requestId,revision,action,items=null){const c=await connect(context().database);try{await c.query('BEGIN');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);await c.query('SET LOCAL ROLE authenticated');const v=(await c.query('SELECT public.ptown_words_action($1,$2,$3,$4,$5::jsonb) v',[f.id,requestId,revision,action,items?JSON.stringify(items):null])).rows[0].v;await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}}
try{
 const row=await query('SELECT state FROM private.ptown_words_matches WHERE dealer_game_id=$1',[f.id]);let s=row.state;
 const all=[...s.bag,...Object.values(s.racks).flat(),...s.board.filter(Boolean)];assert.equal(new Set(all.map(t=>t.id)).size,100);
 const chosen=[];for(const face of ['C','A','T','?','E','R','S']){const i=all.findIndex(t=>t.face===face);assert.ok(i>=0);chosen.push(all.splice(i,1)[0]);}
 s={...s,board:Array(225).fill(null),racks:{[f.players[0]]:chosen,[f.players[1]]:all.splice(0,7)},bag:all,scores:{[f.players[0]]:0,[f.players[1]]:0},turnIndex:s.players.findIndex(p=>p.id===f.players[0]),turn:1,passes:0,moves:[],deadline:Date.now()+180000,phase:'playing'};
 await query('UPDATE private.ptown_words_matches SET state=$2,revision=revision+1,last_request_at=0 WHERE dealer_game_id=$1 RETURNING revision',[f.id,s]);
 const page=await browser.newPage({viewport:{width:390,height:760},isMobile:true,hasTouch:true}),opponent=await browser.newPage({viewport:{width:390,height:760}}),errors=[];for(const p of [page,opponent])p.on('pageerror',e=>errors.push(e.message));
 const url=user=>`http://127.0.0.1:5197/dev/ptown-words/live.html?${new URLSearchParams({id:f.id,user,session:f.session})}`;
 await Promise.all([page.goto(url(f.users[0])),opponent.goto(url(f.users[1]))]);await page.locator('.words-grid').waitFor();await opponent.locator('.words-grid').waitFor();
 await page.getByRole('button',{name:'Zoom In',exact:true}).click();
 await page.locator('.words-rack button').nth(0).click();await page.locator('[data-square="112"]').click();
 assert.equal(await page.locator('.is-staged').count(),1);assert.equal(await opponent.locator('.is-staged').count(),0);
 // A one-letter draft rejects without consuming the rack or turn.
 await page.getByRole('button',{name:'Submit Word',exact:true}).click();await page.locator('.words-error').waitFor();assert.equal(await page.locator('.is-staged').count(),1);
 await page.getByRole('button',{name:'Recall all',exact:true}).click();
 for(const [index,square] of [[0,111],[1,112],[2,113]]){await page.locator('.words-rack button').nth(index).click();await page.locator(`[data-square="${square}"]`).click();}
 await page.screenshot({path:'qualification.local/ptown-words/browser/390-staged.png'});
 await page.waitForTimeout(450);await page.getByRole('button',{name:'Submit Word',exact:true}).click();await page.locator('.words-status strong').filter({hasText:'Mara'}).waitFor();
 assert.equal((await query('SELECT state FROM private.ptown_words_matches WHERE dealer_game_id=$1',[f.id])).state.scores[f.players[0]],10);
 await opponent.locator('.words-cell.has-tile').first().waitFor();assert.equal(await opponent.locator('.words-cell.has-tile').count(),3);
 await page.reload();await page.locator('.words-cell.has-tile').first().waitFor();assert.equal(await page.locator('.words-cell.has-tile').count(),3);
 // Same request races return the same receipt; different concurrent commands cannot both commit.
 let current=await query('SELECT revision,state FROM private.ptown_words_matches WHERE dealer_game_id=$1',[f.id]);const turnUser=current.state.players[current.state.turnIndex].userId;const requestId=uuid();
 const twins=await Promise.all([rpc(turnUser,requestId,current.revision,'pass'),rpc(turnUser,requestId,current.revision,'pass')]);assert.deepEqual(twins[0],twins[1]);
 current=await query('SELECT revision,state FROM private.ptown_words_matches WHERE dealer_game_id=$1',[f.id]);await query('UPDATE private.ptown_words_matches SET last_request_at=0 WHERE dealer_game_id=$1',[f.id]);
 const actor=current.state.players[current.state.turnIndex].userId;const race=await Promise.allSettled([rpc(actor,uuid(),current.revision,'pass'),rpc(actor,uuid(),current.revision,'pass')]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.match(race.find(r=>r.status==='rejected').reason.message,/stale_revision/);
 await page.screenshot({path:'qualification.local/ptown-words/browser/390-opponent.png'});assert.deepEqual(errors,[]);
 write('qualification.local/ptown-words/interaction.json',JSON.stringify({passed:true,checks:['draft privacy','invalid draft preserved','CAT scores 10','opponent realtime','reload committed board','duplicate request race','conflicting request race'],errors},null,2));console.log('Live placement, privacy, reload and request races PASS');
}finally{await browser.close();await db.end();}
