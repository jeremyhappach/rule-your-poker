import {readFileSync as read,writeFileSync as write,existsSync,mkdirSync} from 'node:fs';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
export async function connect(database){const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await c.connect();return c;}
export const candidate=()=>['rules','multiplayer','arcade','bots','recovery','registration'].map(n=>read('supabase/boxdrop/'+n+'.sql','utf8')).join('\n');
const context='qualification.local/boxdrop/context.json';
export const localContext=()=>JSON.parse(read(context,'utf8'));
if(!existsSync(context)){
 mkdirSync('qualification.local/boxdrop',{recursive:true});
 const database='boxdrop_'+Date.now(),admin=await connect('postgres');
 const source=JSON.parse(read('.codex/evidence/multiplayer-money/context.json','utf8')).database;
 await admin.query('CREATE DATABASE '+database+' TEMPLATE '+source);await admin.end();
 write(context,JSON.stringify({database}));console.log('Created isolated '+database);
}
