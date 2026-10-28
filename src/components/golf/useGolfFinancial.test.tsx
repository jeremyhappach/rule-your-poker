// @vitest-environment jsdom
import {renderHook} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import type {GolfSnapshot} from '@/lib/golf/model';
const s=vi.hoisted(()=>({admit:null as any}));
vi.mock('@/lib/canonicalShell/ChipTransportProvider',()=>({useChipTransferPresentationAdmission:(f:any)=>{s.admit=f;},useChipPresentationCursorState:()=> 'settled'}));
import {useGolfFinancial} from './useGolfFinancial';
it('also blocks a settlement notification arriving before the first Golf snapshot',()=>{
 renderHook(()=>useGolfFinancial(null,false,false,'d'));
 expect(s.admit({dealer_game_id:'d'})).toBe(false);
});
it('keeps the exact committed financial batch closed until scoring presentation releases it',()=>{
 const batch={id:'b',cursor:1,game_id:'g',dealer_game_id:'d',transfers:[{from:{kind:'player',playerId:'a'},to:{kind:'player',playerId:'b'},amount:5}]};
 const v={id:'d',identity:{sessionId:'g'},players:[{id:'a'},{id:'b'}],settlement:{a:-5,b:5},financial:{resultId:'r',batch}} as unknown as GolfSnapshot;
 const h=renderHook(({ready})=>useGolfFinancial(v,false,ready),{initialProps:{ready:false}});
 expect(s.admit(batch)).toBe(false);expect(v.settlement).toEqual({a:-5,b:5});
 h.rerender({ready:true});expect(s.admit(batch)).toBe(true);expect(h.result.current).toBe(true);
 expect(s.admit({...batch,id:'wrong'})).toBe(false);
});
