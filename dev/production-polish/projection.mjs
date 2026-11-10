import {readFileSync as read} from 'node:fs';
import assert from 'node:assert/strict';
import {connect} from './local.mjs';
const db=await connect(JSON.parse(read('.polish-authority/context.json')).database);
const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.v;
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>k!=='serverAt').map(([k,x])=>[k,stable(x)])):v;
try{await db.query('BEGIN');await db.query("UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()");
 const f=await q("SELECT public.qualification_bonus_fixture('tri-towers',true) v");
 await db.query('SET LOCAL ROLE service_role');
 const old=await q('SELECT public.delayed_tri_step($1,$2) v',[f.id,f.actor]);
 const current=await q('SELECT public.delayed_tri_bonus_step($1,$2) v',[f.id,f.actor]);
 assert.equal(old.optionalBonus,undefined);assert.equal(current.optionalBonus.choice,'pending');
 const {optionalBonus,...rest}=current;assert.deepEqual(stable(rest),stable(old));
 assert.deepEqual(stable(await q('SELECT public.delayed_tri_bonus_step($1,$2) v',[f.id,f.actor])),stable(current));
 const opponent=await q('SELECT public.delayed_tri_bonus_step($1,$2) v',[f.id,f.users[1]]);assert.equal(opponent.optionalBonus,undefined);assert.equal(opponent.board,null);
 console.log('PASS old/new projection compatibility, equal-revision reconnect and opponent privacy');
}finally{await db.query('ROLLBACK');await db.end();}
