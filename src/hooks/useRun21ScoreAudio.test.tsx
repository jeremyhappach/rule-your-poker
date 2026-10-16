// @vitest-environment jsdom
import {renderHook,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {StrictMode} from 'react';
const audio=vi.hoisted(()=>({follow:vi.fn(),cancel:vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{follow:audio.follow}}));
import {useRun21ScoreAudio} from './useRun21ScoreAudio';
import type {BoardProjection} from '@/lib/run21/model';
afterEach(()=>{cleanup();vi.clearAllMocks();});
it.each(['arcade-run','session:dealer-game'])('follows only the visible transfer once in %s and cancels at its end',scope=>{
 audio.follow.mockReturnValue(audio.cancel);
 const view={roundId:'three',scorePresentation:{playerId:'p',from:10,to:100,startedAt:5000,endsAt:10000}} as BoardProjection;
 const h=renderHook(({now,enabled})=>useRun21ScoreAudio('user',scope,view,now,enabled),{initialProps:{now:5000,enabled:false}});
 expect(audio.follow).not.toHaveBeenCalled();
 h.rerender({now:5100,enabled:true});expect(audio.follow).toHaveBeenCalledTimes(1);
 expect(audio.follow.mock.calls[0][0].id).toContain(scope);
 h.rerender({now:6000,enabled:true});expect(audio.follow).toHaveBeenCalledTimes(1);
 h.rerender({now:10000,enabled:true});expect(audio.cancel).toHaveBeenCalledTimes(1);
});
it('does not sound before the medal hold, for zero points, or while paused',()=>{
 audio.follow.mockReturnValue(audio.cancel);
 const view={roundId:'one',scorePresentation:{playerId:'p',from:100,to:100,startedAt:5000,endsAt:10000}} as BoardProjection;
 const h=renderHook(()=>useRun21ScoreAudio('user','scope',view,5100),{wrapper:StrictMode});expect(audio.follow).not.toHaveBeenCalled();h.unmount();
 view.scorePresentation!.to=200;view.pausedAt=5100;
 renderHook(()=>useRun21ScoreAudio('user','scope',view,5100));expect(audio.follow).not.toHaveBeenCalled();
});
