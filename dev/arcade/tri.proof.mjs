import {connect} from '../tri-towers/bots-fixture.mjs';import {readFileSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createServer} from 'vite';import {resolve} from 'node:path';
const {database}=JSON.parse(readFileSync('qualification.local/tri-towers/solo-context.json','utf8')),db=await connect(database);
const migration=readFileSync('supabase/migrations/20261017001447_solo_tri_towers.sql','utf8'),proof=readFileSync('dev/arcade/tri.proof.sql','utf8');
const q=async(sql,args=[])=> (await db.query(sql,args)).rows[0]?.v;
const rpcFor=c=>async(name,args)=>{const keys=Object.keys(args);return(await c.query('SELECT public.'+name+'('+keys.map((key,i)=>key+'=>$'+(i+1)).join(',')+') v',Object.values(args))).rows[0].v;};
const rpc=rpcFor(db),cases=[];const pass=name=>{cases.push(name);console.log('PASS '+name);};
let peer,vite;
try{
 await db.query('DROP FUNCTION IF EXISTS public.arcade_leaderboard(uuid,text,text,uuid)');
 await db.query('BEGIN');await db.query(migration);await db.query(proof);await db.query('ROLLBACK');
 assert.equal(await q("SELECT count(*)::int v FROM private.arcade_rulesets WHERE id='tri-towers/2'"),0);pass('complete candidate rollback proof: admission, ownership, core parity, redaction, clocks, timeout catchup, bonuses, cumulative totals, PB/ranking, atomic failure, abandonment and non-Arcade write isolation');
 await db.query(migration);await db.query('BEGIN');await db.query(proof);await db.query('ROLLBACK');pass('installed candidate reruns same rollback proof');
 await db.query("UPDATE private.arcade_rulesets SET enabled=true WHERE id='tri-towers/2';UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp()");
 const user=randomUUID();await db.query('INSERT INTO auth.users(id) VALUES($1)',[user]);await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,'Solo concurrency',true)",[user]);
 let r=await rpc('arcade_start',{p_actor:user,p_request:randomUUID(),p_game:'tri-towers'});r=(await rpc('arcade_tri_step',{p_actor:user,p_run:r.id})).record;
 peer=await connect(database);const args={p_actor:user,p_run:r.id,p_revision:r.revision,p_round:r.state.roundId,p_request:randomUUID(),p_action:'draw'};
 let outcomes=await Promise.all([rpc('arcade_tri_step',args),rpcFor(peer)('arcade_tri_step',args)]);assert.deepEqual(outcomes.map(x=>x.outcome).sort(),['committed','duplicate']);pass('concurrent identical command applies once');
 r=outcomes[0].record;const args2={...args,p_revision:r.revision,p_request:randomUUID()};outcomes=await Promise.all([rpc('arcade_tri_step',args2),rpcFor(peer)('arcade_tri_step',{...args2,p_request:randomUUID()})]);assert.deepEqual(outcomes.map(x=>x.outcome).sort(),['committed','stale']);pass('concurrent distinct actions serialize with stale rejection');
 await db.query("UPDATE private.arcade_runs SET state=jsonb_set(state,'{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-40000)),due_at=0 WHERE id=$1",[r.id]);
 const tokens=[randomUUID(),randomUUID()];await db.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=true,expires_at=clock_timestamp()+interval '25 seconds'",[tokens[0]]);
 outcomes=await Promise.all([rpc('arcade_tri_step',{p_actor:null,p_run:r.id,p_token:tokens[0]}),rpcFor(peer)('arcade_tri_step',{p_actor:null,p_run:r.id,p_token:tokens[0]})]);assert(outcomes.every(x=>x.record.status==='completed'));assert.equal(await q('SELECT count(*)::int v FROM private.arcade_results WHERE run_id=$1',[r.id]),1);pass('concurrent zero-client recovery produces one verified completion');
 // A genuine no-browser run uses real 30-second Ready deadlines and five-second holds.
 r=await rpc('arcade_start',{p_actor:user,p_request:randomUUID(),p_game:'tri-towers'});const zeroRun=r.id;
 vite=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,entries:[]}});
 const {recoverArcade}=await vite.ssrLoadModule('/server/arcade/service.ts');const metrics=[];
 for(let n=0;n<70;n++){
  const token=randomUUID();await db.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=false,expires_at=clock_timestamp()+interval '25 seconds'",[token]);
  const begin=performance.now();const processed=await recoverArcade(rpc,token);metrics.push({ms:performance.now()-begin,processed});
  const status=await q('SELECT status v FROM private.arcade_runs WHERE id=$1',[zeroRun]);if(status==='completed')break;
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 assert.equal(await q('SELECT status v FROM private.arcade_runs WHERE id=$1',[zeroRun]),'completed');assert.equal(await q('SELECT count(*)::int v FROM private.arcade_results WHERE run_id=$1',[zeroRun]),1);pass('real-time no-browser two-round completion using existing recovery service');
 const evidence={at:new Date().toISOString(),database,cases,metrics,productionWrites:0,backlog:await q("SELECT count(*)::int v FROM private.arcade_runs WHERE status='active' AND due_at<=floor(extract(epoch FROM clock_timestamp())*1000)")};
 writeFileSync('dev/arcade/tri.evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({cases:cases.length,workerCalls:metrics.length,maxMs:Math.max(...metrics.map(x=>x.ms)),backlog:evidence.backlog}));
}finally{await peer?.end();await vite?.close();await db.end();}
