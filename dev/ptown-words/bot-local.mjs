import {readFileSync as read,writeFileSync as write} from 'node:fs';import {connect,context} from './database.mjs';
const baseline=context().database,database='ptown_words_bots_'+Date.now(),root=await connect('postgres');
if(!/^ptown_words_\d+$/.test(baseline))throw Error('Unexpected local fixture database');
await root.query('CREATE DATABASE '+database+' TEMPLATE '+baseline);await root.end();const c=await connect(database);
// The historical clone predates these unrelated games. Empty structural tables
// let the captured shared pause helper resolve its inactive-game branches.
await c.query('CREATE TABLE IF NOT EXISTS private.battle31_matches (LIKE private.ptown_words_matches); CREATE TABLE IF NOT EXISTS private.golf_matches (LIKE private.ptown_words_matches)');
const source=read('supabase/migrations/20260905025936_isolate_recovery_sessions_and_restore_context.sql','utf8');
for(const signature of ['private.capture_recovery_context()','private.restore_recovery_context(p_context jsonb)']){const start=source.indexOf('CREATE FUNCTION '+signature);const end=source.indexOf('$$;',start)+3;await c.query(source.slice(start,end).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));}
for(const f of JSON.parse(read('dev/ptown-words/bot-contract.json','utf8')).functions)await c.query(f.definition);
try{await c.query('BEGIN');await c.query(read('qualification.local/ptown-words/bot-migration.sql','utf8'));await c.query(read('supabase/ptown-words/bot-human-guard.sql','utf8'));await c.query('COMMIT');write('qualification.local/ptown-words/bot-database.json',JSON.stringify({database}));console.log(database);
await c.query('BEGIN');await c.query(read('supabase/ptown-words/core-proof.sql','utf8'));await c.query(read('supabase/ptown-words/bot-proof.sql','utf8'));await c.query('ROLLBACK');console.log('Bot rule/admission/recovery proof PASS');
}catch(e){console.error(e.message,e.where,e.position);await c.query('ROLLBACK');process.exitCode=1;}finally{await c.end();}
