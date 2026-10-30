import {connect} from '../async-words/local.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const db=await connect(JSON.parse(readFileSync('qualification.local/async-combined/context.json')).database),a=randomUUID(),b=randomUUID(),outside=randomUUID(),match=randomUUID(),child=randomUUID(),checks=[];
const pass=s=>{checks.push(s);console.log('PASS',s);};
try{
 await db.query('BEGIN');
 await db.query("UPDATE private.delayed_incidents SET closed_at=clock_timestamp() WHERE closed_at IS NULL");
 // This older disposable fixture has no Realtime service. Model its policy table
 // transactionally; this proves SQL authorization, not the hosted wire protocol.
 await db.query("CREATE TABLE IF NOT EXISTS private.delayed_removals(match_id uuid PRIMARY KEY REFERENCES private.delayed_matches(id),actor uuid NOT NULL REFERENCES public.profiles(id),request_id uuid NOT NULL,prior_status text NOT NULL,removed_at timestamptz NOT NULL DEFAULT clock_timestamp()); CREATE SCHEMA IF NOT EXISTS realtime; CREATE TABLE realtime.messages(extension text,topic text); ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA realtime TO authenticated; GRANT SELECT,INSERT ON realtime.messages TO authenticated; CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('realtime.topic',true) $$;");
 await db.query(readFileSync('supabase/delayed/playing-presence.candidate.sql','utf8'));
 for(const id of [a,b,outside]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true",[id,'Presence proof '+id.slice(0,8)]);}
 await db.query("INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,status,offer,offer_hash) VALUES($1,$2,$3,false,'active','[]','fixture')",[match,a,b]);
 await db.query("WITH t AS(SELECT clock_timestamp() at) INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,actor,starter,segment,available_at,last_call_at,expires_at) SELECT $1,$2,1,'ptown-words',5,'{}',$3,$3,1,at,at+interval '24 hours',at+interval '36 hours' FROM t",[child,match,a]);
 const expiry=(await db.query('SELECT floor(extract(epoch FROM expires_at)*1000)::bigint AS at FROM private.delayed_children WHERE id=$1',[child])).rows[0].at;
 const topic=`delayed-playing:${match}:${child}:${a}:${expiry}`;
 async function allowed(user,t,publish){await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);return (await db.query('SELECT private.delayed_presence_allowed($1,$2) allowed',[t,publish])).rows[0].allowed;}
 assert.equal(await allowed(a,topic,true),true);assert.equal(await allowed(b,topic,false),true);assert.equal(await allowed(b,topic,true),false);assert.equal(await allowed(outside,topic,false),false);assert.equal(await allowed('',topic,false),false);pass('actor publishes; other participant only reads; outsider and anonymous denied');
 for(const bad of [topic.replace(child,randomUUID()),topic.replace(match,randomUUID()),topic.replace(a,b),topic.replace(expiry,String(Number(expiry)+1)),'malformed'])assert.equal(await allowed(a,bad,true),false);pass('exact child, parent, actor and millisecond availability window enforced');
 await db.query("INSERT INTO realtime.messages VALUES('presence',$1),('broadcast',$1)",[topic]);
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('realtime.topic',$2,true)",[b,topic]);await db.query('SET LOCAL ROLE authenticated');assert.equal((await db.query('SELECT * FROM realtime.messages')).rowCount,1);await db.query('SAVEPOINT denied');await assert.rejects(()=>db.query("INSERT INTO realtime.messages VALUES('presence',$1)",[topic]),/row-level security/);await db.query('ROLLBACK TO denied');await db.query('RESET ROLE');pass('actual SELECT/INSERT RLS admits presence only and denies observer publishing');
 await db.query('UPDATE private.delayed_children SET actor=$1,segment=2 WHERE id=$2',[b,child]);assert.equal(await allowed(a,topic,false),false);assert.equal(await allowed(b,topic.replace(a,b),true),true);pass('handoff retires prior actor topic without financial or gameplay mutation by presence');
 await db.query('SAVEPOINT terminal');await db.query('UPDATE private.delayed_children SET terminal=true WHERE id=$1',[child]);assert.equal(await allowed(b,topic.replace(a,b),true),false);pass('terminal child denied');await db.query('ROLLBACK TO terminal');
 await db.query('SAVEPOINT removed');await db.query("INSERT INTO private.delayed_removals(match_id,actor,request_id,prior_status) VALUES($1,$2,$3,'active')",[match,a,randomUUID()]);assert.equal(await allowed(b,topic.replace(a,b),false),false);pass('removed parent denied');await db.query('ROLLBACK TO removed');
 await db.query('SAVEPOINT settled');await db.query("UPDATE private.delayed_matches SET status='settled' WHERE id=$1",[match]);assert.equal(await allowed(b,topic.replace(a,b),false),false);pass('settled parent denied');await db.query('ROLLBACK TO settled');
 await db.query("UPDATE private.delayed_children SET available_at=available_at-interval '40 hours',last_call_at=last_call_at-interval '40 hours',expires_at=expires_at-interval '40 hours' WHERE id=$1",[child]);const expired=topic.replace(a,b).replace(expiry,String(Number(expiry)-40*3600000));assert.equal(await allowed(b,expired,true),false);pass('expired turn denied');
 await db.query('ROLLBACK');writeFileSync('qualification.local/async-combined/playing-presence-proof.json',JSON.stringify({passed:true,checks,scope:'rollback-only local SQL and RLS; no hosted Realtime qualification'},null,2));
}finally{await db.query('ROLLBACK');await db.end();}
