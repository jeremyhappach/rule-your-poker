// Exhaustive interleavings of two creators and one recovery transaction.
// Complements (does not replace) the separate live two-session lock proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const read=f=>fs.readFileSync(new URL(f,import.meta.url),'utf8');
test('SQL uses one transaction-scoped creation/recovery protocol',()=>{
 const resolver=read('../configuration-v1.sql');
 const trigger=read('../authority-v1.sql');
 const recovery=read('restore-shared.sql');
 assert.ok(resolver.indexOf('pg_advisory_xact_lock_shared(19092026,1)')<resolver.indexOf('SELECT * INTO release'));
 assert.ok(trigger.indexOf('pg_advisory_xact_lock_shared(19092026,1)')<trigger.indexOf('singleton AND creation_enabled'));
 assert.ok(recovery.startsWith('BEGIN ISOLATION LEVEL READ COMMITTED;'));
 assert.ok(recovery.indexOf('pg_advisory_xact_lock(19092026,1)')<recovery.indexOf('creation_enabled=false'));
 assert.ok(recovery.indexOf('creation_enabled=false')<recovery.indexOf('IF EXISTS(SELECT 1 FROM public.games'));
 assert.ok(recovery.indexOf('active_games_require_compatible_recovery')<recovery.indexOf('CREATE OR REPLACE FUNCTION'));
 assert.ok(recovery.trimEnd().endsWith('COMMIT;'));
});
test('every creator/recovery interleaving preserves quiescence',()=>{
 const seen=new Set(); let completed=0;
 function visit(s){
  const key=JSON.stringify(s); if(seen.has(key))return; seen.add(key);
  if(s.checked)assert.equal(s.active,0,'a creator committed after a successful quiescence check');
  if(s.restored)assert.equal(s.enabled,false,'recovery reopened creation');
  if(s.creator.every(x=>x===4)&&s.recovery===5){completed++;return;}
  for(let i=0;i<2;i++){
   const c=s.creator[i],n=structuredClone(s);
   if(c===0&&!s.exclusive){n.shared++;n.creator[i]=1;}
   else if(c===1){n.creator[i]=s.enabled?2:3;}
   else if(c===2){assert.equal(s.checked,false,'insert after successful check');n.active++;n.creator[i]=3;}
   else if(c===3){n.shared--;n.creator[i]=4;}
   else continue;
   visit(n);
  }
  const n=structuredClone(s);
  if(s.recovery===0&&s.shared===0){n.exclusive=true;n.recovery=1;}
  else if(s.recovery===1){n.enabled=false;n.recovery=2;}
  else if(s.recovery===2){
   if(s.active){n.enabled=true;n.exclusive=false;n.recovery=5;} // abort restores pre-recovery gate
   else {n.checked=true;n.recovery=3;}
  } else if(s.recovery===3){n.restored=true;n.recovery=4;}
  else if(s.recovery===4){n.exclusive=false;n.recovery=5;}
  else return;
  visit(n);
 }
 visit({creator:[0,0],recovery:0,shared:0,exclusive:false,enabled:true,active:0,checked:false,restored:false});
 assert.ok(completed>1); console.log(JSON.stringify({states:seen.size,terminalStates:completed}));
});
