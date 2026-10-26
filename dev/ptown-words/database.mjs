import {readFileSync as read,writeFileSync as write,existsSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const pgPath=process.env.PTOWN_PG_MODULE||'C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
const {default:pg}=await import(pathToFileURL(pgPath).href);
export async function connect(database){const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database,connectionTimeoutMillis:3000});await c.connect();return c;}
export const candidate=()=>['rules','authority','commands','registration'].map(n=>read('supabase/ptown-words/'+n+'.sql','utf8')).join('\n')+'\n'+read('qualification.local/ptown-words/lexicon.sql','utf8');
const file='qualification.local/ptown-words/database.json';
const admin=await connect('postgres');
const template=(await admin.query("SELECT datname FROM pg_database d WHERE datname LIKE 'quintzee_%' AND NOT EXISTS(SELECT 1 FROM pg_stat_activity a WHERE a.datid=d.oid) ORDER BY oid DESC LIMIT 1")).rows[0]?.datname;
if(!template||!/^quintzee_[a-z_0-9]+$/.test(template))throw Error('No idle qualified local reference database');
if(!existsSync(file)){
 mkdirSync('qualification.local/ptown-words',{recursive:true});const database='ptown_words_'+Date.now();
 await admin.query('CREATE DATABASE '+database+' TEMPLATE '+template);write(file,JSON.stringify({database,template}));
}
await admin.end();
export const context=()=>JSON.parse(read(file,'utf8'));
