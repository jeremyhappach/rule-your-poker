import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const dir='qualification.local/farkle-audit-20261015/';
const files=['deployed-functions','deployed-shared-0','deployed-shared-1','deployed-deps-1','deployed-deps-2','deployed-deps-3'];
const defs=[...new Map(files.flatMap(f=>JSON.parse(readFileSync(dir+f+'.json'))).map(f=>[f.signature,f])).values()];
const current=JSON.parse(readFileSync(dir+'current-callers.json')).farkleCallers;
const get=name=>{const f=defs.find(f=>f.proname===name||f.signature.startsWith(name+'(')||f.signature.startsWith('private.'+name+'('));assert.ok(f,name);return f;};
const patches=[];
const modify=(f,from,to)=>{const text=f.definition.replaceAll('\r\n','\n');assert.equal(text.split(from).length,2,f.signature+' exact unique anchor');patches.push({...f,definition:text.replace(from,to)});};
const guard=`CREATE OR REPLACE FUNCTION private.farkle_require_active_actor_v1(p_game_id uuid DEFAULT NULL, p_dealer_game_id uuid DEFAULT NULL, p_force boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
 IF NOT p_force
 AND NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND game_type='farkle')
 AND NOT EXISTS(SELECT 1 FROM public.dealer_games WHERE id=p_dealer_game_id AND session_id=p_game_id AND game_type='farkle')
 THEN RETURN; END IF;
 -- Only a trusted service invocation can continue existing obligations without
 -- an active human caller. The stored profile, never JWT metadata, owns status.
 IF coalesce(auth.jwt()->>'role','')='service_role' THEN RETURN; END IF;
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active IS TRUE)
 THEN RAISE EXCEPTION 'farkle:active_account_required' USING ERRCODE='42501'; END IF;
END $function$;
REVOKE ALL ON FUNCTION private.farkle_require_active_actor_v1(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
`;
for(const name of ['farkle_apply_action','farkle_advance_postgame'])modify(current.find(f=>f.name===name),'BEGIN\n','BEGIN\n PERFORM private.farkle_require_active_actor_v1(NULL,NULL,true);\n');
const callers={configure_dealer_game:"p_game_id,NULL,p_game_type='farkle'",submit_ante_decision:'p_game_id,p_expected_dealer_game_id,false',advance_ante_phase:'p_game_id,p_expected_dealer_game_id,false',set_game_paused:'p_game_id,p_expected_dealer_game_id,false',set_automatic_play:'p_game_id,p_dealer_game_id,false',set_session_player_intent:'p_game_id,p_expected_dealer_game_id,false'};
for(const [name,args] of Object.entries(callers))modify(current.find(f=>f.name===name),'BEGIN\n',`BEGIN\n PERFORM private.farkle_require_active_actor_v1(${args});\n`);
modify(get('farkle_claim_v1'),'BEGIN\n',`BEGIN
 -- Human command entry rechecks eligibility. The sealed deferred financial
 -- trigger must finish the already-authorized transaction after deactivation.
 IF coalesce(auth.jwt()->>'role','')='authenticated' AND pg_trigger_depth()=0 THEN
  PERFORM private.farkle_require_active_actor_v1(p_game_id,p_dealer_id,true);
 END IF;
`);
const dispatcher=get('advance_due_canonical_game_timers');
let d=dispatcher.definition.replaceAll('\r\n','\n');
const old=`     FOR UPDATE OF timer SKIP LOCKED
  LOOP
    UPDATE private.game_timer_registry`;
assert.equal(d.split(old).length,2);
d=d.replace(old,`  LOOP
   BEGIN
    -- A Farkle action owns round -> session -> timer. Never hold its timer
    -- while waiting for either gameplay row. The subtransaction releases any
    -- partial acquisition on contention; the scheduled row stays due.
    IF v_timer.timer_kind IN ('farkle_turn','farkle_postgame') THEN
      PERFORM 1 FROM public.rounds WHERE id=v_timer.round_id FOR UPDATE NOWAIT;
      PERFORM 1 FROM public.games WHERE id=v_timer.game_id FOR UPDATE NOWAIT;
    END IF;
    -- Recheck after acquisition: another worker or action may retire this row.
    SELECT timer.* INTO v_timer FROM private.game_timer_registry timer
     WHERE timer.id=v_timer.id AND timer.state='scheduled'
       AND timer.due_at<=clock_timestamp()
       AND EXISTS(SELECT 1 FROM public.games g WHERE g.id=timer.game_id AND NOT coalesce(g.is_paused,false))
     FOR UPDATE OF timer SKIP LOCKED;
    IF NOT FOUND THEN RAISE lock_not_available; END IF;
    UPDATE private.game_timer_registry`);
const end='      v_failed:=v_failed+1;\n    END;\n  END LOOP;';assert.equal(d.split(end).length,2);
d=d.replace(end,`      v_failed:=v_failed+1;
    END;
   EXCEPTION WHEN lock_not_available THEN
    -- Bounded skip, not a retry loop or a failed financial attempt.
    NULL;
   END;
  END LOOP;`);patches.push({...dispatcher,definition:d});
writeFileSync('supabase/farkle/financial-correction/20261015/candidate.sql','-- Qualified correction candidate. Does not change admission or historical rows.\n'+guard+'\n'+patches.map(f=>f.definition.trim()+';').join('\n\n')+'\n');
writeFileSync(dir+'candidate-patches.json',JSON.stringify(patches,null,2));
console.log(patches.map(f=>f.signature).join('\n'));
