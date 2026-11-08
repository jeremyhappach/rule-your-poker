// @vitest-environment jsdom
import {renderHook,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('./usePresentedScoreAudio',()=>({usePresentedScoreAudio:vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{present:vi.fn()}}));
vi.mock('@/lib/audio/approvedSounds',()=>({approvedSound:()=>undefined}));
vi.mock('@/lib/audio/presentationSound',()=>({presentSound:vi.fn(),isSoundSurfaceVisible:()=>true}));
import {useBankOffer} from './useBankOffer';
import {platformAudio} from '@/lib/audio/platformAudio';
const presentSound=platformAudio.present;
import {usePresentedScoreAudio} from './usePresentedScoreAudio';
const base={scope:'run:round:attempt',receipt:'1',points:395 as number|null,bankable:true,now:1000,live:true,userId:'user',surface:{current:document.createElement('div')}};
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('dings once, counts the full declining offer, leaves equals steady and resets after a bank',()=>{
 const h=renderHook(p=>useBankOffer(p),{initialProps:base});expect(h.result.current).toBe(395);expect(presentSound).toHaveBeenCalledTimes(1);
 h.rerender({...base,receipt:'2',points:335,now:2000});expect(h.result.current).toBe(395);
 h.rerender({...base,receipt:'2',points:335,now:2450});expect(h.result.current).toBe(365);expect(usePresentedScoreAudio).toHaveBeenLastCalledWith('user',expect.any(String),expect.objectContaining({from:395,to:335}),2450,true);
 h.rerender({...base,receipt:'2',points:335,now:2900});expect(h.result.current).toBe(335);
 h.rerender({...base,receipt:'3',points:335,now:3000});expect(h.result.current).toBe(335);expect(presentSound).toHaveBeenCalledTimes(1);
 h.rerender({...base,scope:'next-attempt',receipt:'4',points:null,now:4000});h.rerender({...base,scope:'next-attempt',receipt:'5',points:800,now:5000});expect(h.result.current).toBe(800);expect(presentSound).toHaveBeenCalledTimes(2);
});
it('counts rises, admits a first bankable offer after zero, and restores silently',()=>{
 const h=renderHook(p=>useBankOffer(p),{initialProps:{...base,points:0,bankable:false}});expect(presentSound).not.toHaveBeenCalled();
 h.rerender({...base,receipt:'2',points:225,now:2000});expect(h.result.current).toBe(225);expect(presentSound).toHaveBeenCalledTimes(1);
 h.rerender({...base,receipt:'3',points:650,now:3000});h.rerender({...base,receipt:'3',points:650,now:3450});expect(h.result.current).toBe(438);
 h.rerender({...base,receipt:'3',points:650,now:3500,live:false});expect(h.result.current).toBe(650);expect(presentSound).toHaveBeenCalledTimes(1);
});
