import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {connect} from '../async-words/local.mjs';
export {connect};
if(process.argv.includes('--bonus-setup')){
 const template='async_tri_step_1793921264326',database='optional_bonus_'+Date.now();
 const root=await connect('postgres');
 try{await root.query('CREATE DATABASE '+database+' TEMPLATE '+template);}finally{await root.end();}
 write('.polish-authority/context.json',JSON.stringify({database,template}));
 const db=await connect(database);
 try{
  await db.query('BEGIN');
  await db.query(read('supabase/boxdrop/multiplayer.sql','utf8'));
  const originals=read('supabase/originals-competition/gameplay.sql','utf8');
  await db.query(originals.slice(0,originals.indexOf('CREATE FUNCTION')));
  await db.query('ALTER TABLE private.eleven_up_matches ADD COLUMN IF NOT EXISTS bot_due_at bigint');
  await db.query('INSERT INTO private.arcade_rulesets SELECT (jsonb_populate_record(NULL::private.arcade_rulesets,$1)).* ON CONFLICT(id) DO NOTHING',[read('.polish-authority/boxdrop-ruleset.json','utf8')]);
  // Use captured production authority at the changed live action/settlement boundary.
  for(const game of ['tri_towers','boxdrop','eleven_up','royal_flash'])for(const fn of ['action','snapshot','reduce','settle'])await db.query(read('.polish-authority/'+game+'_'+fn+'.sql','utf8'));
  for(const d of JSON.parse(read('.polish-authority/current-authority.json')))await db.query(d.definition);
  for(const name of ['eleven-ready','eleven-bot'])await db.query(read('.polish-authority/'+name+'.sql','utf8'));
  for(const file of ['policy','async'])await db.query(read('supabase/optional-bonus/'+file+'.sql','utf8'));
  await db.query('COMMIT');
  console.log('Installed candidate in disposable clone',database);
 }catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}
}
