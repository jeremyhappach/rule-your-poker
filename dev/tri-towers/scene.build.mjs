import {readFileSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const rows=JSON.parse(readFileSync('qualification.local/tri-towers/scene-installed.json','utf8'));
const original=n=>rows.find(f=>f.proname===n).definition;
const change=(s,a,b)=>{assert(s.includes(a),'missing '+a);return s.replaceAll(a,b);};
const v2=JSON.parse(readFileSync('src/lib/triTowers/rules-v2.json','utf8')),v3={...v2,version:'tri-towers/3',roundIntroMs:2500};
writeFileSync('src/lib/triTowers/rules-v3.json',JSON.stringify(v3,null,2)+'\n');
let sql=`-- Shared lifecycle version. Scoring, dealing and financial reducers remain unchanged.
ALTER TABLE private.tri_towers_release ADD COLUMN IF NOT EXISTS intro_enabled boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION private.tri_towers_rules() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN intro_enabled THEN '${JSON.stringify(v3)}'::jsonb ELSE '${JSON.stringify(v2)}'::jsonb END FROM private.tri_towers_release WHERE singleton
$$;
CREATE OR REPLACE FUNCTION private.tri_towers_board_deal(b jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
BEGIN
 b:=private.tri_towers_board_deal_v2(b,at_ms);
 IF b#>>'{rules,version}'='tri-towers/3' THEN b:=b||jsonb_build_object('phase','intro','deadline',at_ms+(b#>>'{rules,roundIntroMs}')::bigint);END IF;
 RETURN b;
END $$;
CREATE OR REPLACE FUNCTION private.tri_towers_board_reduce(b jsonb,action text,idx integer,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF b#>>'{rules,version}'='tri-towers/3' AND b->>'phase'='intro' THEN
  IF at_ms<(b->>'deadline')::bigint THEN
   IF action='tick' THEN RETURN b;END IF;
   RAISE EXCEPTION 'tri_towers:round_intro';
  END IF;
  b:=b||jsonb_build_object('phase','ready','deadline',(b->>'deadline')::bigint+(b#>>'{rules,readyMs}')::bigint);
 END IF;
 RETURN private.tri_towers_board_reduce_v2(b,action,idx,at_ms);
END $$;
REVOKE ALL ON FUNCTION private.tri_towers_board_deal(jsonb,bigint),private.tri_towers_board_reduce(jsonb,text,integer,bigint) FROM PUBLIC,anon,authenticated,service_role;
`;
for(const name of ['tri_towers_deal','tri_towers_reduce','tri_towers_bot_choice']){
 let def=change(original(name),"<>'tri-towers/2'","NOT IN ('tri-towers/2','tri-towers/3')");
 def=def.replaceAll('private.tri_towers_board_deal_v2(','private.tri_towers_board_deal(').replaceAll('private.tri_towers_board_reduce_v2(','private.tri_towers_board_reduce(');sql+=def+';\n';
}
for(const name of ['arcade_tri_step','arcade_tri_advance']){
 let def=original(name).replaceAll('private.tri_towers_board_deal_v2(','private.tri_towers_board_deal(').replaceAll('private.tri_towers_board_reduce_v2(','private.tri_towers_board_reduce(');
 if(name==='arcade_tri_advance')def=change(def,'1..6','1..9');sql+=def+';\n';
}
let present=original('tri_towers_present').replace('FUNCTION public.tri_towers_present(','FUNCTION public.tri_towers_present_scene(');
present=change(present,"RETURN v||jsonb_build_object('highRun',high_i);","RETURN v||jsonb_build_object('highRun',high_i)||CASE WHEN v#>>'{rules,version}'='tri-towers/3' THEN jsonb_build_object('pausedAt',(SELECT paused_at FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id)) ELSE '{}'::jsonb END;");
sql+=present+';\nREVOKE ALL ON FUNCTION public.tri_towers_present_scene(uuid,uuid,bigint,text,integer) FROM PUBLIC,anon,service_role;\nGRANT EXECUTE ON FUNCTION public.tri_towers_present_scene(uuid,uuid,bigint,text,integer) TO authenticated;\n';
sql+=change(original('tri_towers_present'),'BEGIN',`BEGIN
 IF (SELECT state#>>'{rules,version}' FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id)='tri-towers/3' THEN
  PERFORM public.tri_towers_snapshot(p_dealer_game_id);
  RAISE EXCEPTION 'TriTowers updated. Refresh to continue.';
 END IF;`)+`;\n`;
sql+=`-- Explicit compatibility: the only v3 difference is a pre-Ready introduction.
CREATE OR REPLACE FUNCTION private.arcade_score_group(game text,ruleset text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN game='tri-towers' AND ruleset IN ('tri-towers/2','tri-towers/3') THEN 'tri-towers/2' ELSE ruleset END
$$;
REVOKE ALL ON FUNCTION private.arcade_score_group(text,text) FROM PUBLIC,anon,authenticated,service_role;
`;
sql+=change(original('arcade_commit'),'ruleset=run.ruleset','private.arcade_score_group(game,ruleset)=private.arcade_score_group(run.game,run.ruleset)')+';\n';
let leader=change(original('arcade_leaderboard'),'ruleset=version_i','private.arcade_score_group(game,ruleset)=private.arcade_score_group(p_game,version_i)');
leader=change(leader,'ruleset<>version_i','private.arcade_score_group(game,ruleset)<>private.arcade_score_group(p_game,version_i)');
leader=change(leader,"'currentRuleset',current_i,","'currentRuleset',current_i,'compatibleRulesets',(SELECT jsonb_agg(id ORDER BY id) FROM private.arcade_rulesets WHERE game=p_game AND private.arcade_score_group(game,id)=private.arcade_score_group(p_game,version_i)),");
leader=change(leader,'SELECT jsonb_agg(id ORDER BY id DESC) FROM private.arcade_rulesets WHERE game=p_game',"SELECT jsonb_agg(id ORDER BY id DESC) FROM(SELECT max(id) id FROM private.arcade_rulesets WHERE game=p_game AND (p_game<>'tri-towers' OR enabled OR EXISTS(SELECT 1 FROM private.arcade_results r WHERE r.ruleset=private.arcade_rulesets.id)) GROUP BY private.arcade_score_group(game,id)) groups");
sql+=leader+';\n';
sql+=`INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('tri-towers/3','tri-towers','${JSON.stringify(v3)}',false) ON CONFLICT(id) DO NOTHING;\nNOTIFY pgrst,'reload schema';\n`;
writeFileSync('supabase/tri-towers/scene.sql',sql);
writeFileSync('supabase/tri-towers/activate-scene.sql',`BEGIN;\nUPDATE private.tri_towers_release SET intro_enabled=true WHERE singleton;\nUPDATE private.arcade_rulesets SET enabled=true WHERE id='tri-towers/3';\nCOMMIT;\n`);
console.log('Built staged v3 lifecycle and explicit v2/v3 leaderboard compatibility');
