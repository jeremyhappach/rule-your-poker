import {readFileSync as read, writeFileSync as write, existsSync, mkdirSync} from 'node:fs';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
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
