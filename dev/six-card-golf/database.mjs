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

export async function installLocalReference(c){
 await c.query(read('supabase/six-card-golf/local-reference.sql','utf8'));
 // Match the deployed pause owner (hash 1fa2220c33734d1cf14c11f3eaef432b).
 // The older isolated template predates this overload; never replace production.
 const pauseReference=read('supabase/migrations/20261015212154_farkle_active_account_and_recovery_lock_order.sql','utf8');
 const pauseStart=pauseReference.indexOf('CREATE OR REPLACE FUNCTION public.set_game_paused(p_game_id uuid, p_paused boolean, p_expected_dealer_game_id uuid, p_expected_pause_version bigint)');
 const pauseEnd=pauseReference.indexOf('$function$;',pauseStart)+'$function$;'.length;
 if(pauseStart<0||pauseEnd<pauseStart)throw Error('Missing exact canonical pause reference');
 await c.query(pauseReference.slice(pauseStart,pauseEnd));
 const autoPause=read('supabase/migrations/20261009231202_restore_all_human_auto_fold_pause.sql','utf8');
 await c.query(autoPause.slice(autoPause.indexOf('CREATE OR REPLACE FUNCTION private.pause_all_humans_auto_fold'),autoPause.indexOf('$guard$;')+'$guard$;'.length));
}
