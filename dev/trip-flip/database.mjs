import {readFileSync as read,writeFileSync as write,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const primaryRoot=process.env.PTOWN_QUALIFICATION_ROOT??dirname(resolve(execFileSync('git',['rev-parse','--git-common-dir'],{encoding:'utf8'}).trim()));
const {default:pg}=await import(pathToFileURL(resolve(primaryRoot,'qualification.local/tri-towers/tools/node_modules/pg/lib/index.js')).href);
export async function connect(database){const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await c.connect();return c;}
export const candidate=()=>['rules','multiplayer','arcade','bots','recovery','registration'].map(n=>read('supabase/trip-flip/'+n+'.sql','utf8')).join('\n');
const context='qualification.local/trip-flip/context.json';
export const localContext=()=>JSON.parse(read(context,'utf8'));
if(!existsSync(context)){
 const database='trip_flip_'+Date.now(),admin=await connect('postgres');
 const source=JSON.parse(read(resolve(primaryRoot,'.codex/evidence/multiplayer-money/context.json'),'utf8')).database;
 await admin.query('CREATE DATABASE '+database+' TEMPLATE '+source);await admin.end();
 write(context,JSON.stringify({database}));console.log('Created isolated '+database);
}
