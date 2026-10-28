import {connect} from '../async-words/local.mjs';import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {build} from 'esbuild';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
await build({entryPoints:['server/delayed/service.ts'],bundle:true,platform:'node',format:'esm',outfile:'qualification.local/async-combined/recovery-service.mjs'});
const {delayedOperation,synchronize}=await import(pathToFileURL(resolve('qualification.local/async-combined/recovery-service.mjs')));
const ctx=JSON.parse(read('qualification.local/async-combined/context.json')),db=await connect(ctx.database),a=randomUUID(),b=randomUUID(),checks=[];
const val=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.v;
async function role(name,id=a){await db.query('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id]);if(name!=='owner')await db.query('SET LOCAL ROLE '+name);}
const rpc=async(name,args)=>{await role('service_role');return val('SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') v',Object.values(args));};
async function rejected(sql,args=[]){await db.query('SAVEPOINT rejected');let error;try{await db.query(sql,args);}catch(e){error=e;}await db.query('ROLLBACK TO SAVEPOINT rejected');assert(error);}
try{
 await db.query('BEGIN');
 // Loopback proof transport: this transaction cannot call the hosted worker.
 await db.query('CREATE SCHEMA IF NOT EXISTS net');await db.query('CREATE TEMP TABLE dispatch_proof(headers jsonb)');
 await db.query("CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE plpgsql AS $$BEGIN INSERT INTO dispatch_proof VALUES(headers);RETURN 1;END $$");
 await db.query("SELECT private.delayed_incident_close(id,'Local recovery proof reset') FROM private.delayed_incidents WHERE closed_at IS NULL");
 await db.query('UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()');await db.query('UPDATE private.delayed_release SET admission_enabled=true');await db.query('UPDATE private.delayed_recovery_state SET enabled=true');
 for(const id of [a,b]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[id,'RecoveryProof '+id]);}
 await role('authenticated');const parent=await val("SELECT public.delayed_create($1,$2,false,'[{\"game\":\"quintzee\",\"stake\":5},{\"game\":\"ptown-words\",\"stake\":5}]') v",[randomUUID(),b]);const home=await val('SELECT public.delayed_home($1) v',[parent]);
 await role('authenticated',b);await val("SELECT public.delayed_respond($1,$2,$3,'accept') v",[parent,randomUUID(),home.offerHash]);await role('owner');let child=(await db.query("SELECT * FROM private.delayed_children WHERE match_id=$1 AND game_type='quintzee'",[parent])).rows[0];
 await delayedOperation(rpc,child.actor,{op:'action',childId:child.id,requestId:randomUUID(),revision:1,segment:1,intent:{type:'start'}});
 await role('owner');const due=Date.now()-1000,expiry=due+500;
 await db.query("UPDATE private.delayed_children SET available_at=to_timestamp($2/1000.0)-interval '36 hours',last_call_at=to_timestamp($2/1000.0)-interval '12 hours',expires_at=to_timestamp($2/1000.0),gameplay_due_at=to_timestamp($3/1000.0),state=jsonb_set(jsonb_set(state,'{board,deadline}',to_jsonb($3::bigint)),'{board,startedAt}',to_jsonb($3::bigint-240000)) WHERE id=$1",[child.id,expiry,due]);
 await db.query("UPDATE private.delayed_words_health SET last_tick=clock_timestamp()-interval '30 seconds'");const before=await val('SELECT last_tick v FROM private.delayed_words_health');
 await db.query('SELECT private.delayed_words_recover()');assert.equal(await val('SELECT count(*)::int v FROM dispatch_proof'),1);assert.deepEqual(await val('SELECT last_tick v FROM private.delayed_words_health'),before);assert.equal(await val('SELECT terminal v FROM private.delayed_children WHERE id=$1',[child.id]),false);
 const token=await val("SELECT headers->>'x-delayed-dispatch' v FROM dispatch_proof");await role('authenticated');await rejected('SELECT public.delayed_recovery_claim($1)',[token]);await role('service_role');await rejected('SELECT public.delayed_recovery_claim($1)',[randomUUID()]);const rows=await val('SELECT public.delayed_recovery_claim($1) v',[token]);assert(rows.some(c=>c.id===child.id));await rejected('SELECT public.delayed_recovery_claim($1)',[token]);
 for(const row of rows)await synchronize(rpc,row,null);
 await rpc('delayed_recovery_complete',{p_token:token,p_failure:null});await role('owner');child=(await db.query('SELECT * FROM private.delayed_children WHERE id=$1',[child.id])).rows[0];
 assert.equal(child.terminal,false);assert.equal(child.state.attempts[0].board.result.reason,'timeout');assert.equal(child.segment,'2');assert(child.expires_at.getTime()>Date.now());assert.equal(await val('SELECT count(*)::int v FROM private.delayed_outcomes WHERE child_id=$1',[child.id]),0);
 checks.push('one dispatcher: earlier shared gameplay timeout wins availability expiry, advances exactly one segment, no child forfeiture or financial write; heartbeat waits for worker completion');
 await role('service_role');await rejected('SELECT public.delayed_recovery_complete($1,NULL)',[token]);checks.push('browser/wrong-token/duplicate-claim/duplicate-completion denied');
 await role('owner');const at=Date.now(),celebration={startedAt:at-2000,countAt:at-500,endsAt:at+5000};
 await db.query("UPDATE private.delayed_children SET state=jsonb_set(state,'{board}',jsonb_build_object('deadline',$2::bigint+30000,'startedAt',$2::bigint-5000,'celebration',$3::jsonb)),gameplay_due_at=to_timestamp(($2::bigint+30000)/1000.0) WHERE id=$1",[child.id,at,celebration]);
 const old=(await db.query('SELECT * FROM private.delayed_children WHERE id=$1',[child.id])).rows[0];const incident=await val("SELECT private.delayed_incident_open($1,'Synthetic outage proof') v",[parent]);await db.query("UPDATE private.delayed_incidents SET opened_at=clock_timestamp()-interval '1 second' WHERE id=$1",[incident]);await db.query("SELECT private.delayed_incident_close($1,'Synthetic outage resolved')",[incident]);const shifted=(await db.query('SELECT * FROM private.delayed_children WHERE id=$1',[child.id])).rows[0];const ms=shifted.expires_at-old.expires_at;
 assert(ms>0);assert.equal(shifted.state.board.deadline-old.state.board.deadline,ms);for(const key of ['startedAt','countAt','endsAt'])assert.equal(shifted.state.board.celebration[key]-celebration[key],ms);checks.push('incident close shifts availability, shared gameplay and Quintzee celebration by the same measured duration');
 await db.query('ROLLBACK');write('qualification.local/async-combined/recovery-proof.json',JSON.stringify({passed:true,checks},null,2));console.log('PASS',checks);
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
