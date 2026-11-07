import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {connect} from '../quintzee/database.mjs';
const {database}=JSON.parse(readFileSync('qualification.local/ship-cap-voyage/context.json'));
if(!/^ship_cap_voyage_\d+$/.test(database))throw Error('Disposable database required');
const c=await connect(database),a=await connect(database),b=await connect(database),actor=randomUUID();
const call=async(client,v,request,type)=>{return(await client.query('select public.arcade_ship_cap_voyage_step($1,$2,$3,$4,$5,$6) result',[actor,v.id,v.revision,v.roundId,request,type])).rows[0].result;};
try{
 await c.query('insert into auth.users(id) values($1)',[actor]);await c.query('insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true',[actor]);await c.query('insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true',[actor,'Voyage race']);
 await c.query("update private.arcade_rulesets set enabled=true where id='ship-cap-voyage/1'");await c.query("update private.arcade_recovery_state set last_completed_at=clock_timestamp(),failure=null");
 const start=async client=>(await client.query("select public.arcade_start($1,$2,'ship-cap-voyage') r",[actor,randomUUID()])).rows[0].r;
 const starts=await Promise.all([start(a),start(b)]);assert.equal(starts[0].id,starts[1].id);
 let v=(await c.query('select public.arcade_ship_cap_voyage_step($1,$2) r',[actor,starts[0].id])).rows[0].r.projection;
 let race=await Promise.all([call(a,v,randomUUID(),'roll'),call(b,v,randomUUID(),'roll')]);assert.deepEqual(race.map(r=>r.outcome).sort(),['committed','stale']);v=race.find(r=>r.outcome==='committed').projection;assert.equal(v.roll,1);
 const request=randomUUID();race=await Promise.all([call(a,v,request,'roll'),call(b,v,request,'roll')]);assert.deepEqual(race.map(r=>r.outcome).sort(),['committed','duplicate']);v=race[0].projection;assert.equal(v.roll,2);
 await c.query("update private.arcade_runs set state=state||'{\"dice\":[6,5,4,6,6],\"locked\":[0,1,2],\"cargo\":12}'::jsonb where id=$1",[v.id]);
 race=await Promise.all([call(a,v,randomUUID(),'bank'),call(b,v,randomUUID(),'bank')]);assert.deepEqual(race.map(r=>r.outcome).sort(),['committed','stale']);v=race.find(r=>r.outcome==='committed').projection;assert.equal(v.banks.length,1);
 await call(c,v,randomUUID(),'abandon');
 writeFileSync('qualification.local/ship-cap-voyage/races.json',JSON.stringify({passed:true,starts:'one active run',rolls:'one revision winner',duplicate:'one receipt',banks:'one bank',database},null,2));console.log('PASS independent connection start, roll, duplicate and bank races');
}finally{await c.query("update private.arcade_rulesets set enabled=false where id='ship-cap-voyage/1'");await Promise.all([c.end(),a.end(),b.end()]);}
