import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root='qualification.local/farkle-full-stack/run21-handoff-v5-output';
const out='supabase/farkle/financial-correction/20261015/';
const report=JSON.parse(fs.readFileSync('qualification.local/farkle-full-stack/run21-handoff-v5-results.json'));
assert.equal(report.stats.expected,2);assert.equal(report.stats.unexpected,0);
const result={at:new Date().toISOString(),productionWrites:0,qualificationOnly:true,serverCloseMd5:'e57f2fcd24eee243f38c9696c7ac1e54',transport:'Actual authenticated Run21 handler; browser virtual project origin forwarded exclusively to loopback Supabase, including WebSockets; local publishable/service credentials only.',cases:{}};
for(const directory of fs.readdirSync(root)){
 const evidencePath=path.join(root,directory,'evidence.json');if(!fs.existsSync(evidencePath))continue;
 const e=JSON.parse(fs.readFileSync(evidencePath));
 const frames=[e.frames0,e.frames1].map(a=>a.slice(a.findIndex(x=>x.fullscreen===1)));
 for(const a of frames){assert.ok(a.length>0);assert.ok(a.every(x=>x.shell&&!x.replaced&&x.hud<=1&&x.fullscreen<=1&&x.felts<=1));assert.ok(a.some(x=>x.mode==='table'&&x.neutral===1&&x.hud===1&&x.run21===0));}
 assert.equal(e.handoff.game.status,'game_selection');assert.equal(e.handoff.match.finished,true);assert.equal(e.successor.game.game_type,e.next);
 assert.ok(e.networkErrors.every(x=>x.status===403&&x.url.endsWith('/admin_account_balances')));assert.deepEqual(e.pageErrors,[]);assert.deepEqual(e.blockedRequests,[]);
 result.cases[e.next]=e;
 for(const file of fs.readdirSync(path.join(root,directory)).filter(f=>/^(fullscreen|neutral|successor)-client-[01]\.png$/.test(f)))fs.copyFileSync(path.join(root,directory,file),path.join(out,'run21-to-'+e.next+'-'+file));
}
assert.deepEqual(Object.keys(result.cases).sort(),['farkle','run21']);fs.writeFileSync(path.join(out,'run21-handoff-evidence.json'),JSON.stringify(result,null,2));console.log('Both Run21 transitions pass: no post-game route/shell remount, duplicate surface or missing-shell frame.');
