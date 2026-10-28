// Reuse the existing concurrency suite against the forward play-money candidate.
// All connections are restricted by database.mjs to the disposable local server.
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {connect} from './database.mjs';
const database='battle31_launch_race_'+Date.now();let c=await connect('postgres');await c.query('CREATE DATABASE '+database+' TEMPLATE battle31_package_1792613350794');await c.end();
c=await connect(database);await c.query(read('dev/battle31/evidence/launch-pause-preimage.sql','utf8'));await c.query(read('supabase/migrations/20261025192500_battle31_play_money_launch.sql','utf8'));await c.end();
process.env.BATTLE31_DATABASE=database;
const databaseUrl=new URL('./database.mjs',import.meta.url).href;
const fixtureSource=read('dev/battle31/fixture.mjs','utf8').replace("'./database.mjs'",JSON.stringify(databaseUrl)).replace('real_qualified=true','real_qualified=false');
const fixtureUrl='data:text/javascript;base64,'+Buffer.from(fixtureSource).toString('base64');
const suite=read('dev/battle31/concurrency.mjs','utf8').replace("'./database.mjs'",JSON.stringify(databaseUrl)).replace("'./fixture.mjs'",JSON.stringify(fixtureUrl)).replace('[false,true]','[false]');
await import('data:text/javascript;base64,'+Buffer.from(suite).toString('base64'));
write('dev/battle31/evidence/launch-concurrency.json',read('qualification.local/battle31/concurrency-recovery.json'));
