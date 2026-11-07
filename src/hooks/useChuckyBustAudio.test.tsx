// @vitest-environment jsdom
import {renderHook,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {run21FailureCueAt} from '@/lib/run21/failureCue';
const mock=vi.hoisted(()=>({follow:vi.fn((_event:unknown)=>vi.fn()),visible:true}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{follow:mock.follow}}));
vi.mock('@/lib/audio/presentationSound',()=>({isSoundSurfaceVisible:()=>mock.visible}));
import {useChuckyBustAudio} from './useChuckyBustAudio';
afterEach(()=>{cleanup();mock.follow.mockClear();mock.visible=true;});
it('reuses the Run21 give-up cue once for a live round bust and cancels on leaving it',()=>{
 const root={current:document.createElement('div')};
 const hook=renderHook(({busted,live})=>useChuckyBustAudio('user','run:round:1',busted,live,root),{initialProps:{busted:false,live:true}});
 expect(mock.follow).not.toHaveBeenCalled();
 hook.rerender({busted:true,live:true});expect(mock.follow).toHaveBeenCalledTimes(1);
 expect(mock.follow.mock.calls[0][0]).toMatchObject({userId:'user',id:'chucky-round-bust:run:round:1',cueAt:run21FailureCueAt});
 hook.rerender({busted:true,live:true});expect(mock.follow).toHaveBeenCalledTimes(1);
 hook.unmount();expect(mock.follow.mock.results[0].value).toHaveBeenCalledOnce();
});
it('restored rounds and invisible surfaces stay silent',()=>{
 const root={current:document.createElement('div')};
 const hook=renderHook(()=>useChuckyBustAudio('user','saved',true,false,root));hook.unmount();
 mock.visible=false;renderHook(()=>useChuckyBustAudio('user','hidden',true,true,root));expect(mock.follow).not.toHaveBeenCalled();
});
