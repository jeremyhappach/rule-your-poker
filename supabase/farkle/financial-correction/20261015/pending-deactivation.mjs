import {c,opts,pg,fixture,finalArgs,rpc,actionSql,verify,dir,result,identity,scalar,pass} from './helpers.mjs';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const peer=new pg.Client(opts);
try {
 await c.query('BEGIN');const f=await fixture(2,true),a=await finalArgs(f),u=f.users[f.players.indexOf(a[1])];await c.query('COMMIT');
 await peer.connect();await peer.query('BEGIN');await rpc(actionSql,a,u,peer);
 // Independent administrator revocation commits after the valid action and
 // before its deferred canonical financial trigger. No browser is involved.
 await c.query('update profiles set is_active=false where id=$1',[u]);
 await peer.query('COMMIT');await c.query('BEGIN');
 await verify(f,'Deactivation after authorized action preserves atomic deferred settlement');
 await identity(null,'service_role');assert.equal((await scalar('select public.farkle_advance_postgame($1,$2,$3,1) v',[f.game,f.round,f.dg])).outcome,'advanced');pass('Trusted postgame completes after actor deactivation');
 await c.query('COMMIT');
}catch(e){result.errors.push({message:e.message,code:e.code,where:e.where});console.error(e.message);}
finally {await peer.query('ROLLBACK').catch(()=>{});await peer.end();await c.query('ROLLBACK');await c.end();writeFileSync(dir+'pending-deactivation-result.json',JSON.stringify(result,null,2));if(result.errors.length)process.exitCode=1;}
