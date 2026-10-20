import {readFileSync as read,writeFileSync as write,existsSync,mkdirSync} from 'node:fs';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
export async function connect(database){if(!/^(battle31_|money_qualification_|postgres$)/.test(database))throw Error('Local database only');const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await c.connect();return c;}
export const candidate=()=>['rules','multiplayer','commands','bots','recovery','registration','grants'].map(n=>read('supabase/battle31/'+n+'.sql','utf8')).join('\n');
const context='qualification.local/battle31/context.json';
export const localContext=()=>JSON.parse(read(context,'utf8'));
if(!existsSync(context)){mkdirSync('qualification.local/battle31',{recursive:true});const database='battle31_'+Date.now(),c=await connect('postgres');await c.query('CREATE DATABASE '+database+' TEMPLATE money_qualification_1792441147994');await c.end();write(context,JSON.stringify({database}));console.log('Created isolated '+database);}
