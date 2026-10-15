import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import pg from '../../../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {createClient} from '@supabase/supabase-js';
const dir='qualification.local/farkle-full-stack/';
const status=JSON.parse(fs.readFileSync(dir+'status.json'));
assert.equal(status.API_URL,'http://127.0.0.1:57321');
const url=new URL(status.DB_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'57322');
const c=new pg.Client({connectionString:status.DB_URL});await c.connect();
try{
 const full=JSON.parse(fs.readFileSync(dir+'full-schema.json'));
 const mismatches=[];
 for(const f of full.functions){const {rows}=await c.query('SELECT md5(pg_get_functiondef($1::regprocedure)) hash',[f.signature]);if(rows[0].hash!==f.hash)mismatches.push(f.signature);}
 assert.deepEqual(mismatches,[]);
 const candidate=fs.readFileSync('supabase/farkle/financial-correction/20261015/candidate.sql','utf8');
 assert.equal(createHash('sha256').update(candidate).digest('hex'),'f38c212b9170c729ad26fffee90ecade00a35dee2cbe2046b158a6e18078f185');
 await c.query('BEGIN');await c.query(candidate);
 await c.query('UPDATE private.farkle_release SET creation_enabled=true,admin_only=false,production_defaults_approved=true WHERE singleton');
 await c.query("SELECT cron.schedule('advance-due-game-state-1s','1 second','CALL private.run_game_recovery_batch();')");
 await c.query('COMMIT');
 const api=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const accounts=[];
 for(let i=0;i<2;i++){
  const email=`farkle-proof-${randomUUID()}@local.test`,password=randomUUID();
  const {data,error}=await api.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username:'Farkle Proof '+(i+1)}});
  if(error)throw error;
  await c.query("BEGIN;SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
  await c.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[data.user.id]);await c.query('COMMIT');
  assert.equal((await c.query('select count(*) n from user_roles where user_id=$1',[data.user.id])).rows[0].n,'0');
  accounts.push({id:data.user.id,email,password});
 }
 fs.writeFileSync(dir+'accounts.json',JSON.stringify(accounts,null,2));
 await c.query("NOTIFY pgrst,'reload schema'");
 fs.writeFileSync(dir+'browser-preparation.json',JSON.stringify({sourceFunctions:full.functions.length,sourceDefinitionMismatches:mismatches,candidateAppliedLocally:true,ordinaryUsers:accounts.map(x=>x.id),localAdmissionEnabled:true,productionWrites:0},null,2));
 console.log('453 source routine hashes match; candidate applied locally; two ordinary active test accounts created.');
}finally{await c.end();}
