import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {readFileSync as read,writeFileSync as write,existsSync,readdirSync} from 'node:fs';
export async function connect(database){const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await c.connect();return c;}
export const candidate=()=>['rules','multiplayer','arcade','bots','recovery','registration'].map(n=>read('supabase/royal-flash/'+n+'.sql','utf8')).join('\n');
const context='qualification.local/royal-flash/context.json';
export const localContext=()=>JSON.parse(read(context,'utf8'));
if(!existsSync(context)){
 const database='royal_flash_'+Date.now(),admin=await connect('postgres');
 await admin.query('CREATE DATABASE '+database+' TEMPLATE eleven_up_1792271272711');await admin.end();
 const c=await connect(database);
 // The local reference predates the four installed October 18 corrections.
 for(const f of readdirSync('supabase/migrations').filter(n=>n.startsWith('20261018')&&n<'20261018183121').sort()){
  let sql=read('supabase/migrations/'+f,'utf8');
  // Local qualification has no cron extension. Scheduling is verified on production.
  sql=sql.replace(/SELECT cron\.schedule\([^;]+;/gs,'').replace(/SELECT cron\.unschedule\([^;]+;/gs,'');
  await c.query(sql);
 }
 await c.end();write(context,JSON.stringify({database}));console.log('Created '+database);
}
