// Check the exact packaged Edge entrypoint. SQL ownership/recovery is proved separately.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const token=randomUUID(),id=randomUUID(),calls=[],rawFetch=globalThis.fetch;
let handler,claimed=false;
globalThis.Deno={env:{get:name=>name==='SUPABASE_URL'?'http://127.0.0.1':'local-only'},serve:fn=>{handler=fn;}};
globalThis.fetch=async(url,options)=>{
 const endpoint=new URL(url);assert.equal(endpoint.hostname,'127.0.0.1');
 const rpc=endpoint.pathname.split('/').at(-1),args=JSON.parse(options.body);calls.push(rpc);
 assert.equal(args.p_token,token);
 if(rpc==='arcade_recovery_claim'){if(claimed)return new Response('denied',{status:403});claimed=true;return Response.json([{id,game:'ship-cap-voyage'}]);}
 if(rpc==='arcade_ship_cap_voyage_step'){assert.deepEqual(args,{p_actor:null,p_run:id,p_token:token});return Response.json({record:{id,game:'ship-cap-voyage',state:{roll:0,dice:[]}}});}
 assert.equal(rpc,'arcade_recovery_complete');assert.equal(args.p_failure,null);return Response.json(null);
};
try{
 await import('../../qualification.local/ship-cap-voyage/worker-release.mjs');
 const req=t=>new Request('http://127.0.0.1',{headers:{'x-arcade-dispatch':t}});
 assert.equal((await handler(req('invalid'))).status,401);assert.deepEqual(calls,[]);
 assert.deepEqual(await(await handler(req(token))).json(),{processed:1});
 assert.deepEqual(calls,['arcade_recovery_claim','arcade_ship_cap_voyage_step','arcade_recovery_complete']);
 assert.equal((await handler(req(token))).status,403);
 console.log('PASS: exact packaged worker dispatch, delegated ownership, no action/roll, completion and rejected replay.');
}finally{globalThis.fetch=rawFetch;delete globalThis.Deno;}
