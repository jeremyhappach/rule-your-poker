import {connect} from './local.mjs';import {readFileSync as read,writeFileSync as write} from 'node:fs';
const root=await connect('postgres'),pre=JSON.parse(read('dev/async-words/polish-preimage.json','utf8'));
const candidates=(await root.query("SELECT datname FROM pg_database d WHERE (datname LIKE 'ptown_words_real_%' OR datname LIKE 'async_words_%') AND NOT EXISTS(SELECT FROM pg_stat_activity a WHERE a.datid=d.oid) ORDER BY oid DESC")).rows;
let template;
for(const {datname}of candidates){const c=await connect(datname);try{const differences=[];for(const f of pre.functions){const found=(await c.query("SELECT CASE WHEN to_regprocedure($1) IS NOT NULL THEN md5(replace(pg_get_functiondef(to_regprocedure($1)),chr(13),'')) END hash",[f.signature])).rows[0].hash;if(found!==f.hash)differences.push(f.signature);}if(!differences.length){template=datname;break;}}finally{await c.end();}}
if(!template)throw Error('No idle local fixture matches all deployed async/Words authority hashes');
const database='words_polish_'+Date.now();await root.query('CREATE DATABASE '+database+' TEMPLATE '+template);await root.end();
const c=await connect(database);try{await c.query(read('supabase/delayed/polish-local.sql','utf8'));}finally{await c.end();}
write('qualification.local/async-words/context.json',JSON.stringify({database,template}));
write('qualification.local/async-words/proof.json',JSON.stringify({passed:false,database,qualification:'deployed authority parity; original settlement qualification retained; polish proof pending'}));
console.log(JSON.stringify({database,template,authorityFunctionsMatched:pre.functions.length}));
