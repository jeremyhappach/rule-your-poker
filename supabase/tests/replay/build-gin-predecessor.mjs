import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='supabase/tests/replay/';
const defs=JSON.parse(readFileSync(root+'gin-predecessor-originals.json','utf8'));
const owner=defs.find(d=>d.identity==='private.gin_start_next_hand_core(uuid)');
const before="UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=v_previous.id;";
const after=before.slice(0,-1)+` RETURNING * INTO v_previous;
  IF v_game.replay_contract_version=1 THEN
    PERFORM private.replay_gin_predecessor_close_v1(v_previous,v_next.id);
  END IF;`;
if(owner.definition.split(before).length!==2)throw Error('Predecessor update anchor drift');
const helper=readFileSync(root+'gin-predecessor-helper.sql','utf8');
const sql=`SET LOCAL lock_timeout='5s';
SET LOCAL check_function_bodies=false;
DO $guard$ BEGIN
 IF md5(pg_get_functiondef('private.gin_start_next_hand_core(uuid)'::regprocedure)) IS DISTINCT FROM '${createHash('md5').update(owner.definition).digest('hex')}' THEN
  RAISE EXCEPTION 'Gin predecessor owner drift';
 END IF;
END $guard$;
`+helper+'\n'+owner.definition.replace(before,after)+';\n';
writeFileSync(root+'gin-predecessor-v1.sql',sql);
console.log('One existing owner, one private helper; no schema/index/game-rule changes.');
