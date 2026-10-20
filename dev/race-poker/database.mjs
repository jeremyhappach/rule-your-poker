import {readFileSync as read,writeFileSync as write,existsSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const primary=dirname(resolve(execFileSync('git',['rev-parse','--git-common-dir'],{encoding:'utf8'}).trim()));
const driver=process.env.RACE_POKER_PG_MODULE??resolve(primary,'qualification.local/tri-towers/tools/node_modules/pg/lib/index.js');
if(!existsSync(driver))throw Error('Set RACE_POKER_PG_MODULE to the existing local PostgreSQL test driver; do not install dependencies implicitly.');
const {default:pg}=await import(pathToFileURL(driver).href);
export async function connect(database){const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await c.connect();return c;}
export const candidate=()=>['rules','multiplayer','commands','registration'].map(n=>read('supabase/race-poker/'+n+'.sql','utf8')).join('\n');
const context='qualification.local/race-poker/context.json';
export const localContext=()=>JSON.parse(read(context,'utf8'));
if(!existsSync(context)||process.argv.includes('--fresh')){
 mkdirSync('qualification.local/race-poker',{recursive:true});
 const database='race_poker_'+Date.now(),admin=await connect('postgres');
 const source=JSON.parse(read(resolve(primary,'qualification.local/boxdrop/context.json'),'utf8')).database;
 await admin.query('CREATE DATABASE '+database+' TEMPLATE '+source);await admin.end();
 write(context,JSON.stringify({database}));console.log('Created isolated '+database);
}
