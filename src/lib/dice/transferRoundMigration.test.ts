import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/20261028184338_dice_transfer_round_identity.sql','utf8');
it('preserves initial admission accounting and adds only the exact created round destination',()=>{
 const original=readFileSync('supabase/migrations/20260820185615_canonical_game_timer_ownership.sql','utf8');
 const extract=(s:string)=>s.slice(s.indexOf('CREATE OR REPLACE FUNCTION private.start_horses_scc_initial_round(')).split('$function$;')[0].replace(/\r/g,'');
 const normalize=(s:string)=>s.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n').replace(/\n\s*\n/g,'\n');
 const candidate=extract(sql).replace(/  UPDATE public\.gameplay_transfer_pending_changes[\s\S]*?AND reason = 'ante' AND source_round_id IS NULL;/,'');
 expect(normalize(candidate)).toBe(normalize(extract(original)));
 expect(sql).toContain('r.hand_number = 1 AND r.round_number = 1');
});
it('preserves the existing settlement body except scoped metadata context',()=>{
 const original=readFileSync('supabase/migrations/20260812002322_horses_scc_disconnect_safe_settlement.sql','utf8');
 const extract=(s:string)=>s.slice(s.indexOf('CREATE OR REPLACE FUNCTION public.horses_settle_game(')).split('$function$;')[0].replace(/\r/g,'');
 const candidate=extract(sql).split('\n').filter(line=>!line.includes('v_previous_round_context')&&!line.includes("set_config('ptown.transfer_source_round_id'")).join('\n').replace(/\n\s*\n/g,'\n');
 expect(candidate).toBe(extract(original).replace(/\n\s*\n/g,'\n'));
});
it('keeps unknown and mixed journal ownership unassigned and does not backfill historical batches',()=>{
 expect(sql).toContain('count(p.source_round_id) = count(*)');
 expect(sql).toContain('count(DISTINCT p.source_round_id) = 1');
 expect(sql).toContain('OLD.source_round_id IS DISTINCT FROM NEW.source_round_id');
 expect(sql).toContain('r.dealer_game_id = NEW.dealer_game_id');
 expect(sql).not.toMatch(/UPDATE public\.gameplay_transfer_batches/);
});
it('preserves rollover accounting and progression statements while adding explicit lineage',()=>{
 const original=readFileSync('supabase/migrations/20260823173530_horses_scc_connected_authority.sql','utf8');
 const extract=(s:string)=>s.slice(s.indexOf('CREATE OR REPLACE FUNCTION private.horses_scc_rollover_abandoned_round(')).split('$function$;')[0].replace(/\r/g,'');
 const candidate=extract(sql).replace(/  UPDATE public\.gameplay_transfer_pending_changes[\s\S]*?AND reason = 'ante';/,'').replace(') RETURNING id INTO v_successor_round_id;',');').split('\n').filter(line=>!line.includes('v_previous_round_context')&&!line.includes('v_successor_round_id')&&!line.includes("set_config('ptown.transfer_source_round_id'")).join('\n').replace(/\n\s*\n/g,'\n');
 expect(candidate).toBe(extract(original).replace(/\n\s*\n/g,'\n'));
});
