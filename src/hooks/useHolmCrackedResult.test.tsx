// @vitest-environment jsdom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {isHolmCrackedResult,useHolmCrackedResult,type HolmCrackedResult} from './useHolmCrackedResult';
const db=vi.hoisted(()=>({read:vi.fn(),eq:vi.fn(),table:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{
 db.table(table);const query:any={select:()=>query,eq:(...v:unknown[])=>{db.eq(...v);return query;},in:()=>query,abortSignal:()=>query,maybeSingle:()=>db.read()};return query;
}}}));
const row:HolmCrackedResult={id:'result-uuid',game_id:'game-uuid',dealer_game_id:'dealer-uuid',hand_number:3,event_kind:'chucky_loss_pot_match',player_chip_changes:{'player-uuid':-20,'other-uuid':0}};
beforeEach(()=>{vi.clearAllMocks();db.read.mockResolvedValue({data:row,error:null});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it.each(['chucky_loss_pot_match','chucky_tiebreak_pot_match'])('recognizes structured loss %s without names/text',event_kind=>{
 expect(isHolmCrackedResult({...row,event_kind},'game-uuid','dealer-uuid',3,'player-uuid')).toBe(true);
});
it.each([{event_kind:'showdown_final_award'},{event_kind:'chucky_final_award'},{event_kind:null},{hand_number:2},{dealer_game_id:'old'},{game_id:'old'},{player_chip_changes:{'player-uuid':20}},{player_chip_changes:{'player-uuid':'-20'}},{player_chip_changes:{Jeremy:-20}},{player_chip_changes:null}])('rejects wrong result or identity %j',patch=>{
 expect(isHolmCrackedResult({...row,...patch},'game-uuid','dealer-uuid',3,'player-uuid')).toBe(false);
});
const mount=(status='betting')=>renderHook(({status,enabled})=>useHolmCrackedResult('game-uuid','dealer-uuid',3,'player-uuid',status,enabled),{initialProps:{status,enabled:true}});
it('reads exactly one committed identity after a live hand; stable rerenders do not query again',async()=>{
 const ui=mount();expect(db.read).not.toHaveBeenCalled();ui.rerender({status:'completed',enabled:true});
 await waitFor(()=>expect(ui.result.current).toBe('result-uuid'));
 ui.rerender({status:'completed',enabled:true});expect(db.read).toHaveBeenCalledTimes(1);
 expect(db.table).toHaveBeenCalledWith('game_results');expect(db.eq.mock.calls).toEqual([['game_id','game-uuid'],['dealer_game_id','dealer-uuid'],['hand_number',3]]);
});
it('never reads on completed mount/reconnect or return from a hidden panel',()=>{
 const ui=mount('completed');ui.rerender({status:'completed',enabled:false});ui.rerender({status:'completed',enabled:true});expect(db.read).not.toHaveBeenCalled();
});
it('drops pending result delivery after interruption',async()=>{
 let resolve!:(v:unknown)=>void;db.read.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const ui=mount();ui.rerender({status:'completed',enabled:true});act(()=>window.dispatchEvent(new Event('offline')));
 await act(async()=>resolve({data:row,error:null}));expect(ui.result.current).toBeNull();
});
