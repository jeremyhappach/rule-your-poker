// Disposable local clones lack these canonical definitions. Install exact
// repository owners for qualification only; never include this in release.sql.
import {readFileSync as read} from 'node:fs';
export function definition(file,name) {
 const sql=read('supabase/migrations/'+file,'utf8');
 const start=sql.search(new RegExp('CREATE (?:OR REPLACE )?FUNCTION '+name.replaceAll('.','\\.')+'\\('));
 if(start<0)throw Error('Missing canonical owner '+name);
 const tail=sql.slice(start),as=/AS\s+(\$\w*\$)/i.exec(tail);
 if(!as)throw Error('Missing function body '+name);
 const end=tail.indexOf(as[1],as.index+as[0].length)+as[1].length;
 return tail.slice(0,tail.indexOf(';',end)+1).replace(/^CREATE FUNCTION/,'CREATE OR REPLACE FUNCTION');
}
export async function installCanonicalLifecycle(c) {
 const context='20260905025936_isolate_recovery_sessions_and_restore_context.sql';
 const pause='20260905022955_seven_game_pause_resume_envelope.sql';
 const current='20261015212154_farkle_active_account_and_recovery_lock_order.sql';
 for(const [file,name] of [[context,'private.capture_recovery_context'],[context,'private.restore_recovery_context'],
  [pause,'private.shift_pause_timestamp'],[pause,'private.stamp_pause_version'],
  ['20260905015218_session_participation_intent_and_setup_handoff.sql','private.stamp_session_intent_version'],
  [current,'private.farkle_require_active_actor_v1'],
  ['20261009231202_restore_all_human_auto_fold_pause.sql','private.pause_all_humans_auto_fold'],
  [current,'public.set_game_paused'],[current,'public.set_automatic_play']])await c.query(definition(file,name));
 await c.query(`ALTER TABLE public.games ADD COLUMN IF NOT EXISTS pause_version bigint NOT NULL DEFAULT 0;
 DROP TRIGGER IF EXISTS stamp_pause_version ON public.games;
 CREATE TRIGGER stamp_pause_version BEFORE INSERT OR UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION private.stamp_pause_version();
 DROP TRIGGER IF EXISTS stamp_session_intent_version ON public.players;
 CREATE TRIGGER stamp_session_intent_version BEFORE INSERT OR UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION private.stamp_session_intent_version();
 REVOKE ALL ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint),public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) FROM PUBLIC,anon;
 GRANT EXECUTE ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint),public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) TO authenticated;`);
}
