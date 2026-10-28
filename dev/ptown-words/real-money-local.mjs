import {pathToFileURL} from 'node:url';
import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const {default:pg}=await import(pathToFileURL('C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js').href);
export async function connect(database){const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database,connectionTimeoutMillis:3000});await c.connect();return c;}
export const path='qualification.local/ptown-words/real-money';
export const context=()=>JSON.parse(read(path+'/context.json','utf8'));
if(process.argv.includes('--setup')){
 mkdirSync(path,{recursive:true});const root=await connect('postgres');
 const template=(await root.query("SELECT datname FROM pg_database d WHERE datname LIKE 'async_words_%' AND NOT EXISTS(SELECT 1 FROM pg_stat_activity a WHERE a.datid=d.oid) ORDER BY oid DESC LIMIT 1")).rows[0]?.datname;
 assert.match(template,/^async_words_\d+$/);const database='ptown_words_real_'+Date.now();
 await root.query('CREATE DATABASE '+database+' TEMPLATE '+template);await root.end();
 const db=await connect(database);const pre=JSON.parse(read('dev/ptown-words/real-money-preimage.json','utf8'));const differences=[];
 for(const f of pre.functions){const hash=(await db.query('SELECT CASE WHEN to_regprocedure($1) IS NOT NULL THEN md5(pg_get_functiondef(to_regprocedure($1))) END hash',[f.signature])).rows[0].hash;if(hash!==f.md5)differences.push({signature:f.signature,expected:f.md5,local:hash});}
 await db.end();write(path+'/context.json',JSON.stringify({database,template,differences},null,2));console.log(JSON.stringify({database,template,differences}));
}
