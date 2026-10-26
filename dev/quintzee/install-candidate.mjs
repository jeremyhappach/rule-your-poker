import {readFileSync as read} from 'node:fs';
export async function installCandidate(c){
const paths=['defaults','version-one','adapter-functions','multiplayer','arcade','bots','recovery','registration'];
 for(const [name,path] of [['arcade_boxdrop_valid_completion','supabase/boxdrop/arcade.sql'],['arcade_trip_flip_valid_completion','supabase/trip-flip/arcade.sql'],['arcade_take_two_valid_completion','supabase/take-two/arcade.sql'],['arcade_royal_valid_completion','supabase/royal-flash/arcade.sql'],['arcade_eleven_valid_completion','supabase/eleven-up/arcade.sql'],['arcade_tri_valid_completion','supabase/arcade/tri-towers.sql']]){
  if((await c.query('SELECT to_regprocedure($1) present',[`private.${name}(jsonb)`])).rows[0].present)continue;
  const source=read(path,'utf8'),start=source.indexOf(`CREATE OR REPLACE FUNCTION private.${name}(`),end=source.indexOf('REVOKE ALL ON FUNCTION',start);
  if(start<0||end<start)throw Error('Missing validator source boundary: '+name);
  await c.query(source.slice(start,end));
 }
 // Candidate authority and synthetic fixtures are rolled back together. The
 // running local preview and all existing fixture rows remain unchanged.
 for(const p of paths){console.log('Checking '+p);await c.query(read('supabase/quintzee/'+p+'.sql','utf8'));}
}
