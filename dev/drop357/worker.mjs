// Exercise the bundled Edge entry point and live RPC contracts on loopback PostgreSQL.
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connect} from '../quintzee/database.mjs';
const db=process.argv[2];if(!/^drop357_v[12]_\d+$/.test(db??''))throw Error('Expected Crib Lab fixture database');
const c=await connect(db),user=randomUUID(),token=randomUUID(),rawFetch=globalThis.fetch;
let handler;
try{
  await c.query('begin');
  await c.query('insert into auth.users(id) values($1)',[user]);
  await c.query('insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true',[user]);
  await c.query('insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true',[user,'Lab '+user.slice(0,8)]);
  const carry=process.argv.includes('--carry'),polish=db.includes('_v2_');
  await c.query("update private.arcade_rulesets set enabled=false where game='357-drop' and enabled");
  await c.query('update private.arcade_rulesets set enabled=true where id=$1',[carry?'357-drop/3':polish?'357-drop/2':'357-drop/1']);
  await c.query("update private.arcade_recovery_state set failure=null,last_completed_at=clock_timestamp(),claimed=false,token=$1,expires_at=clock_timestamp()+interval '1 minute'",[token]);
  const {id}=(await c.query("select public.arcade_start($1,$2,'357-drop')->>'id' id",[user,randomUUID()])).rows[0];
  await c.query('select public.arcade_drop357_step($1,$2)',[user,id]);
  if(polish){
    await c.query("update private.arcade_runs set state=private.drop357_deal_dispatch(jsonb_build_object('runId',id,'userId',user_id,'status','active','config',config),floor(extract(epoch FROM clock_timestamp())*1000)::bigint-400000,1),due_at=0 where id=$1",[id]);
  }else await c.query("update private.arcade_runs set state=jsonb_set(state,'{deadline}','0'),due_at=0 where id=$1",[id]);
  globalThis.Deno={env:{get:name=>name==='SUPABASE_URL'?'http://127.0.0.1':'local-only'},serve:fn=>{handler=fn;}};
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    const path=new URL(url);assert.equal(path.hostname,'127.0.0.1');
    const rpc=path.pathname.split('/').at(-1),entries=Object.entries(JSON.parse(options.body));
    assert.ok(['arcade_recovery_claim','arcade_drop357_step','arcade_recovery_complete'].includes(rpc));calls.push(rpc);
    if(rpc==='arcade_drop357_step')assert.equal(JSON.parse(options.body).p_run,id);
    try{
      const {rows}=await c.query('select public.'+rpc+'('+entries.map(([k],i)=>k+'=> $'+(i+1)).join(',')+') r',entries.map(([,v])=>v));
      // This clone also has older unrelated fixtures. Expose only the test run from the real due batch.
      const value=rpc==='arcade_recovery_claim'?rows[0].r.filter(r=>r.id===id):rows[0].r;
      return Response.json(value);
    }catch{return new Response('denied',{status:403});}
  };
  const compiled=await build({entryPoints:['supabase/functions/arcade-recovery/index.ts'],bundle:true,write:false,format:'esm',platform:'node',target:'es2022'});
  await import('../../qualification.local/drop357/worker-release.mjs');
  const req=t=>new Request('http://127.0.0.1',{headers:{'x-arcade-dispatch':t}});
  assert.equal((await handler(req('invalid'))).status,401);
  assert.deepEqual(await (await handler(req(token))).json(),{processed:1});
  assert.deepEqual(calls,['arcade_recovery_claim','arcade_drop357_step','arcade_recovery_complete']);
  assert.equal((await c.query('select count(*)::int n from private.arcade_results where run_id=$1',[id])).rows[0].n,1);
  assert.equal((await handler(req(token))).status,403);
  console.log('PASS — bundled Edge worker, valid claim, secure dispatch, unattended run, atomic result and consumed-token replay.');
}finally{globalThis.fetch=rawFetch;delete globalThis.Deno;await c.query('rollback');await c.end();}
