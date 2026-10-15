import {c,fixture,finalArgs,rpc,actionSql,verify,result,dir,state,rejection} from './helpers.mjs';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
try {
 await c.query('BEGIN');const f=await fixture(2,true),a=await finalArgs(f),u=f.users[f.players.indexOf(a[1])];
 await c.query('update profiles set is_active=false where id=$1',[u]);
 await rejection('Disabled participant rejected before profile change',()=>rpc(actionSql,a,u),/active_account_required/);
 const before=await state(f);
 await rejection('Inactive non-admin cannot self-reactivate through actual profile authority',()=>rpc('update public.profiles set is_active=true where id=$1 returning is_active v',[u],u),/profile_authority:admin_required/);
 assert.deepEqual(await state(f),before);
 console.log('PASS: fresh profile status cannot be bypassed by browser self-reactivation');
}catch(e){result.errors.push({message:e.message,code:e.code,where:e.where});console.log(JSON.stringify(result.errors));}
finally {await c.query('ROLLBACK');writeFileSync(dir+'profile-authority-result.json',JSON.stringify(result,null,2));await c.end();if(result.errors.length)process.exitCode=1;}
