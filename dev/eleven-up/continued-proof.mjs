import {readFileSync,writeFileSync} from 'node:fs';
let wrappers='';
for(const name of ['eleven_up_configure','tri_towers_configure','run21_configure_local']){
 const args='p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamptz';
 wrappers+=`CREATE FUNCTION pg_temp.${name}(${args}) RETURNS jsonb LANGUAGE plpgsql AS $wrap$
 DECLARE v jsonb;p record;actor text:=current_setting('request.jwt.claim.sub',true);claims text:=current_setting('request.jwt.claims',true);role_i text:=current_setting('request.jwt.claim.role',true);
 BEGIN v:=public.${name}(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_game_type,p_config,p_expected_config_deadline);
 FOR p IN SELECT id,user_id FROM public.players WHERE game_id=p_game_id AND status='active' AND NOT sitting_out AND NOT is_bot AND ante_decision IS NULL LOOP
 PERFORM set_config('request.jwt.claim.sub',p.user_id::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p.user_id,'role','authenticated')::text,true);PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM public.submit_ante_decision(p_game_id,(v#>>'{dealer_game,id}')::uuid,p.id,'ante_up');END LOOP;
 PERFORM public.advance_ante_phase(p_game_id,(v#>>'{dealer_game,id}')::uuid);
 PERFORM set_config('request.jwt.claim.sub',coalesce(actor,''),true);PERFORM set_config('request.jwt.claims',coalesce(claims,''),true);PERFORM set_config('request.jwt.claim.role',coalesce(role_i,''),true);RETURN v;END $wrap$;\n`;
}
let base=readFileSync('supabase/eleven-up/smoke-production-proof.sql','utf8')+'\n'+readFileSync('supabase/eleven-up/smoke-proof.sql','utf8');
for(const name of ['eleven_up_configure','tri_towers_configure','run21_configure_local'])base=base.replaceAll('public.'+name,'pg_temp.'+name);
const proof=readFileSync('supabase/eleven-up/continued-proof.sql','utf8')+'\n'+wrappers+base;
writeFileSync(process.argv[2]??'.codex/evidence/continued-smoke/complete-proof.sql', 'BEGIN;\n'+proof+'\nROLLBACK;\n');
