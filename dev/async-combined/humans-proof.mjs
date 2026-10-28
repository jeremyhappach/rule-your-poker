import {connect} from '../async-words/local.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const ctx=JSON.parse(read('qualification.local/async-combined/context.json','utf8'));
const db=await connect(ctx.database),checks=[],prefix='HumanProof'+Date.now();
const a=randomUUID(),b=randomUUID(),bot=randomUUID(),inactive=randomUUID(),renamed=randomUUID();
const actor=async id=>{await db.query('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id]);await db.query('SET LOCAL ROLE authenticated');};
async function denied(sql,args=[]){await db.query('SAVEPOINT denied');let error;try{await db.query(sql,args);}catch(e){error=e;}await db.query('ROLLBACK TO SAVEPOINT denied');assert.equal(error?.code,'42501');}
try{
 await db.query('BEGIN');
 for(const [id,name,active] of [[a,prefix+'Owner',true],[b,prefix+'Other',true],[inactive,prefix+'Inactive',false],[renamed,'Bot '+prefix,true],...Array.from({length:54},(_,i)=>[randomUUID(),prefix+String(i).padStart(2,'0'),true])]){
  await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET username=excluded.username,is_active=excluded.is_active',[id,name,active]);
 }
 // Like canonical create_session_bot: profile only, with no auth account.
 await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true)',[bot,prefix+'Bot']);
 await db.query(read('supabase/delayed/combined-humans.sql','utf8'));
 await db.query('UPDATE private.delayed_release SET admission_enabled=true WHERE singleton');
 await actor(a);
 let page=(await db.query('SELECT public.delayed_opponent_page($1) v',[prefix])).rows[0].v;
 assert.equal(page.items.length,50);assert.equal(page.hasMore,true);
 const all=[...page.items];page=(await db.query("SELECT public.delayed_opponent_page($1,'username',$2) v",[prefix,page.next])).rows[0].v;all.push(...page.items);
 assert.equal(all.length,56);assert.equal(new Set(all.map(p=>p.id)).size,56);assert(all.every(p=>p.isHuman===true));assert(!all.some(p=>[a,bot,inactive].includes(p.id)));assert(all.some(p=>p.id===renamed));
 assert(all.every(p=>Object.keys(p).sort().join(',')==='id,isHuman,name'));checks.push('active humans only across two pages; bot-like human name allowed; no account/private data');
 const legacy=(await db.query('SELECT public.delayed_opponents($1) v',[prefix+'Bot'])).rows[0].v;assert.equal(legacy.length,0);
 await denied("SELECT public.delayed_create($1,$2,false,'[{\"game\":\"ptown-words\",\"stake\":5}]')",[randomUUID(),bot]);
 await denied("SELECT public.delayed_create($1,$2,false,'[{\"game\":\"ptown-words\",\"stake\":5}]')",[randomUUID(),inactive]);
 checks.push('legacy picker and direct invitation reject bots/inactive users');
 const request=randomUUID(),parent=(await db.query("SELECT public.delayed_create($1,$2,false,'[{\"game\":\"ptown-words\",\"stake\":5}]') v",[request,b])).rows[0].v;
 assert.equal((await db.query("SELECT public.delayed_create($1,$2,false,'[{\"game\":\"ptown-words\",\"stake\":5}]') v",[request,b])).rows[0].v,parent);
 await actor(bot);await denied("SELECT public.delayed_opponent_page('')");await denied("SELECT public.delayed_create($1,$2,false,'[{\"game\":\"ptown-words\",\"stake\":5}]')",[randomUUID(),b]);checks.push('bot caller denied; human invitation and duplicate receipt preserved');
 await db.query('RESET ROLE');assert.equal((await db.query('SELECT count(*) n FROM private.delayed_matches WHERE organizer=$1',[a])).rows[0].n,'1');
 await db.query('ROLLBACK');write('qualification.local/async-combined/humans-proof.json',JSON.stringify({passed:true,database:ctx.database,checks},null,2));console.log('PASS',checks);
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
