// Local qualification only: reconstruct the released Race Poker + 11 Up owners.
// Never included in the Battle 31 migration payload.
import {execFileSync} from 'node:child_process';
import {definition,installCanonicalLifecycle} from './canonical-lifecycle.mjs';

export const releasedMain='bb1ec308030065d1aa30fc79a18efd493315291e';
export const source=path=>execFileSync('git',['show',releasedMain+':'+path],{encoding:'utf8',maxBuffer:8e6});
export async function installReleasedBaseline(c) {
 await installCanonicalLifecycle(c);
 await c.query(definition('20260914214838_gin_replay_waiting_lifecycle.sql','public.create_session_bot'));
 for(const name of ['rules','multiplayer','commands','registration','v2'])await c.query(source('supabase/race-poker/'+name+'.sql'));
 for(const file of ['20261021002901_eleven_up_bots.sql','20261021181947_eleven_up_human_ready.sql']) {
  const sql=source('supabase/migrations/'+file).replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,'');
  await c.query(sql);
 }
}
