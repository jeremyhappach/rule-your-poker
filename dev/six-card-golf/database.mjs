import {readFileSync as read, writeFileSync as write, existsSync, mkdirSync} from 'node:fs';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {installReleasedBaseline} from '../battle31/released-baseline.mjs';
export async function connect(database) {
  const client = new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});
  await client.connect();
  return client;
}
const context = 'qualification.local/six-card-golf/context.json';
export const localContext = () => JSON.parse(read(context,'utf8'));
export const candidate = () => ['rules','multiplayer','lifecycle','bots','recovery','registration','grants'].map(name => read(`supabase/six-card-golf/${name}.sql`,'utf8')).join('\n');
if (!existsSync(context)) {
  mkdirSync('qualification.local/six-card-golf',{recursive:true});
  const database = 'golf_'+Date.now(), admin = await connect('postgres');
  const source = JSON.parse(read('qualification.local/boxdrop/context.json','utf8')).database;
  await admin.query('CREATE DATABASE '+database+' TEMPLATE '+source);
  await admin.end();
  write(context,JSON.stringify({database}));
  console.log('Created isolated '+database);
}

export async function installLocalReference(c){
 await c.query(read('supabase/six-card-golf/local-reference.sql','utf8'));
 // Local reconstruction only: current-main Race Poker v2, 11 Up bots/Ready,
 // then Battle 31 sources. Never include this bootstrap in a hosted package.
 await installReleasedBaseline(c);
 for(const part of ['rules','multiplayer','commands','bots','recovery','registration','grants'])await c.query(read('supabase/battle31/'+part+'.sql','utf8'));
 // Reconstruct the subsequently released 11 Up smoke controls locally only.
 await c.query(read('supabase/eleven-up/smoke-controls.sql','utf8').replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,''));

 // installReleasedBaseline owns canonical lifecycle reconstruction, including
 // the newer 11 Up Ready safeguard. Never reinstall an older pause helper here.
}
