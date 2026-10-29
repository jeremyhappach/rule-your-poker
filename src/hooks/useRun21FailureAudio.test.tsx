// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {StrictMode} from 'react';
import type {BoardProjection,Result} from '@/lib/run21/model';
import {DEFAULT_CONFIG} from '@/lib/run21/model';
const audio=vi.hoisted(()=>({follow:vi.fn(),cancel:vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{follow:audio.follow}}));
import {useRun21FailureAudio} from './useRun21FailureAudio';

function view(reason:Result['reason']|null=null,score=0,playerId='p',roundId='one'):BoardProjection {
  return {config:DEFAULT_CONFIG,roundId,roundNumber:1,viewerId:'p',players:[{id:'p',name:'Player'},{id:'q',name:'Opponent'}],
    liveBoards:true,active_player_id:playerId,revealed:false,cumulative:{p:score,q:0},
    scorePresentation:reason?{playerId,startedAt:5000,endsAt:10000,from:0,to:score}:null,
    boards:{[playerId]:{playerId,columns:[[],[],[],[],[]],passesUsed:0,presented:[],current:null,cardIndex:0,revision:1,startedAt:0,deadline:5000,
      result:reason?{reason,score,at:5000,aggregate:95,totals:[],aceElevations:[],multiplier:0,speed:0}:null}}};
}
const initial=()=>({view:view(),now:4900,epoch:0,enabled:true});
beforeEach(()=>{audio.follow.mockReturnValue(audio.cancel);vi.spyOn(document,'hidden','get').mockReturnValue(false);vi.spyOn(navigator,'onLine','get').mockReturnValue(true);});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.clearAllMocks();});

it.each(['arcade-run','session:dealer-game'])('sounds each confirmed bust and no-qualify once in %s, including another player and round',scope=>{
  const h=renderHook(p=>useRun21FailureAudio('user',scope,p.view,p.now,p.epoch,p.enabled),{initialProps:initial(),wrapper:StrictMode});
  for(const [i,reason] of (['bust','collect','timeout','exhausted'] as const).entries()){
    const next={view:view(reason,0,i%2?'q':'p',String(i)),now:5050,epoch:0,enabled:true};
    h.rerender(next);expect(audio.follow).toHaveBeenCalledTimes(i+1);
    h.rerender({...next,view:{...next.view},now:5200});expect(audio.follow).toHaveBeenCalledTimes(i+1);
    expect(audio.follow.mock.lastCall![0].id).toContain(scope);
  }
  h.unmount();expect(audio.cancel).toHaveBeenCalled();
});
it('does not play on fresh mount, recovery, paused/hidden results, old results or successful scores',()=>{
  const h=renderHook(p=>useRun21FailureAudio('user','run',p.view,p.now,p.epoch,p.enabled),{initialProps:{...initial(),view:view('bust'),now:5050}});
  expect(audio.follow).not.toHaveBeenCalled();
  h.rerender({...initial(),view:view('bust',0,'q'),now:5050,epoch:1});
  h.rerender({...initial(),view:view('collect',1000,'p','scored'),now:5050,epoch:1});
  h.rerender({...initial(),view:view('bust',1000,'p','legacy-score'),now:5050,epoch:1});
  h.rerender({...initial(),view:{...view('bust',0,'p','paused'),pausedAt:5000},now:5050,epoch:1});
  h.rerender({...initial(),view:view('bust',0,'p','hidden'),now:5050,epoch:1,enabled:false});
  h.rerender({...initial(),view:view('bust',0,'p','hidden'),now:5050,epoch:1});
  h.rerender({...initial(),view:view('bust',0,'p','late'),now:7000,epoch:1});
  expect(audio.follow).not.toHaveBeenCalled();
});
it.each(['visibilitychange','offline'])('cancels on %s and never replays after restoration',event=>{
  const h=renderHook(p=>useRun21FailureAudio('user','run',p.view,p.now,p.epoch,p.enabled),{initialProps:initial()});
  const failed={...initial(),view:view('bust'),now:5050};h.rerender(failed);
  expect(audio.follow).toHaveBeenCalledTimes(1);
  act(()=>{(event==='offline'?window:document).dispatchEvent(new Event(event));});
  expect(audio.cancel).toHaveBeenCalledTimes(1);
  h.rerender({...failed,now:5100});expect(audio.follow).toHaveBeenCalledTimes(1);
});
it('cancels when result visibility ends and does not restart when it returns',()=>{
  const h=renderHook(p=>useRun21FailureAudio('user','run',p.view,p.now,p.epoch,p.enabled),{initialProps:initial()});
  const failed={...initial(),view:view('bust'),now:5050};h.rerender(failed);
  h.rerender({...failed,enabled:false});expect(audio.cancel).toHaveBeenCalledTimes(1);
  h.rerender(failed);expect(audio.follow).toHaveBeenCalledTimes(1);
});
it('does not admit audio without sufficient authoritative hold remaining',()=>{
  const h=renderHook(p=>useRun21FailureAudio('user','run',p.view,p.now,p.epoch,p.enabled),{initialProps:initial()});
  const failed=view('bust');failed.scorePresentation!.endsAt=5500;
  h.rerender({...initial(),view:failed,now:5050});expect(audio.follow).not.toHaveBeenCalled();
});

it('explicit saved-result replay admits the shared failure cue without enabling ordinary fresh entry',()=>{renderHook(()=>useRun21FailureAudio('user','review', {...view('bust'),revealed:true},5050,0,true,true));expect(audio.follow).toHaveBeenCalledTimes(1);});
