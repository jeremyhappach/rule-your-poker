import pg from 'file:///C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {readFileSync,writeFileSync} from 'node:fs';
const database=JSON.parse(readFileSync('qualification.local/golf-match-length/context.json')).database;
const config={host:'127.0.0.1',port:55439,user:'tri_test',database};
const a=new pg.Client(config),b=new pg.Client(config);await a.connect();await b.connect();
const query="SELECT round_row.id,round_row.game_id,defaults.bot_decision_delay_seconds\n    FROM public.rounds round_row CROSS JOIN public.games game_row\n    JOIN public.game_defaults defaults\n      ON defaults.game_type=game_row.game_type\n    JOIN public.players actor\n      ON actor.game_id=game_row.id AND actor.is_bot=true\n   WHERE round_row.game_id=game_row.id\n     AND game_row.game_type IN ('horses','ship-captain-crew')\n     AND game_row.status='in_progress'\n     AND NOT coalesce(game_row.is_paused,false)\n     AND game_row.current_game_uuid IS NOT DISTINCT FROM round_row.dealer_game_id\n     AND round_row.horses_state->>'gamePhase'='playing'\n     AND nullif(round_row.horses_state->>'turnDeadline','') IS NULL\n     AND actor.id::text=round_row.horses_state->>'currentTurnPlayerId'\n     AND EXISTS (\n       SELECT 1 FROM private.game_timer_cutover cutover\n        WHERE cutover.singleton=true\n          AND game_row.timer_generation>0\n     )\n     AND NOT private.recovery_session_deferred('canonical_timers',game_row.id)\n     ORDER BY round_row.id LIMIT 64";
try {await a.query('BEGIN');await a.query('ALTER TABLE public.game_defaults ADD COLUMN IF NOT EXISTS golf_holes integer NOT NULL DEFAULT 9');
const locks=(await a.query("select mode,granted from pg_locks where pid=pg_backend_pid() and relation='public.game_defaults'::regclass")).rows;
await b.query("SET lock_timeout='750ms'");let failure;try{await b.query(query);}catch(e){failure={code:e.code,message:e.message};}
if(failure?.code!=='55P03')throw Error('Expected exact canonical scan lock timeout');
await a.query('ROLLBACK');await b.query(query.replace(/AND NOT private\.recovery_session_deferred\('canonical_timers',game_row\.id\)/,'AND true'));const evidence={database,locks,failure,scanSucceedsAfterRollback:true};
writeFileSync('dev/six-card-golf/evidence/match-length-lock-repro.json',JSON.stringify(evidence,null,2));console.log(evidence);
}finally{await a.query('ROLLBACK');await a.end();await b.end();}
