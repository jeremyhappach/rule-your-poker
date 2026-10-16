// Cold process proof of the exact bundled Edge worker against a disposable local DB.
import pg from '../../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import assert from 'node:assert/strict';
const [database,token]=process.argv.slice(2);
assert.match(database,/^run21_release_proof_[0-9]+$/);
const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await c.connect();
const signatures={run21_recovery_claim:['p_token'],run21_recovery_load:['p_token','p_game_id'],run21_recovery_finish:['p_token','p_dealer_game_id'],run21_server_commit:['p_dealer_game_id','p_expected_revision','p_state','p_bot_due_at'],run21_recovery_complete:['p_token','p_failure']};
let handler;
globalThis.Deno={env:{get:key=>key==='SUPABASE_URL'?'https://isolated.invalid':'local-proof-only'},serve:fn=>{handler=fn;}};
globalThis.fetch=async(url,init)=>{
 assert.equal(new URL(url).origin,'https://isolated.invalid');
 const name=new URL(url).pathname.split('/').at(-1),keys=signatures[name];assert(keys);
 const args=JSON.parse(init.body);
 try{const {rows}=await c.query('SELECT public.'+name+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+') v',keys.map(k=>args[k]));return Response.json(rows[0].v??null);}
 catch{return new Response(null,{status:409});}
};
try{
 await c.query('SET ROLE service_role');
 await import('../../../qualification.local/run21-production/fairness-recovery-bundle.js');
 const response=await handler(new Request('https://isolated.invalid/worker',{method:'POST',headers:{'x-run21-dispatch':token}}));
 assert.equal(response.status,200);console.log(await response.text());
}finally{await c.end();}
