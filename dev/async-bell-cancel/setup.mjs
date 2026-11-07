import {connect} from '../../dev/async-words/local.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
const root=await connect('postgres'),database='async_bell_cancel_'+Date.now();
await root.query('CREATE DATABASE '+database+' TEMPLATE async_latency_1793976343175');await root.end();
const c=await connect(database);
console.log(JSON.stringify((await c.query("SELECT to_regclass('private.push_events') pushes,to_regprocedure('private.async_opponent_name(uuid,uuid)') opponent,to_regprocedure('private.delayed_words_check_health()') health")).rows));
writeFileSync('qualification.local/async-bell-cancel/context.json',JSON.stringify({database}));
await c.end();

