// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render} from '@testing-library/react';
import {TriTowersBoard} from './TriTowersBoard';
import rules from '@/lib/triTowers/rules-v2.json';
const sound=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/audio/presentationSound',()=>({presentSound:sound}));
vi.mock('@/components/PlayingCard',()=>({PlayingCard:()=>null}));
vi.mock('@/hooks/useTriCardAudio',()=>({useTriCardAudio:()=>{}}));
vi.mock('./useTriTowerClearAudio',()=>({useTriTowerClearAudio:()=>{}}));
vi.mock('./TriTowersPresentation',()=>({TriScorePill:()=>null,TriRoundIntro:()=>null,useTriRoundPresentation:()=>({admitted:false,introAdmitted:false})}));
vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
const view={rules,phase:'playing' as const,cards:[5,6,9,null],waste:4,removed:[],stockRemaining:0,run:0,deadline:10000,highRun:0};
const props={view,now:1000,roundKey:'round',canAct:true,result:null,onIntent:vi.fn()};
beforeEach(()=>{sound.mockClear();props.onIntent.mockClear();});afterEach(cleanup);
it.each(['arcade','async','live'])('%s: one tone per invalid tap, no action; valid cards still dispatch',mode=>{
 const h=render(<TriTowersBoard {...props} roundKey={mode}/>),card=(i:number)=>h.container.querySelector(`[data-tri-card="${i}"]`)!;
 fireEvent.click(card(2));fireEvent.click(card(3));fireEvent.click(h.getByLabelText(/Draw stock/));
 expect(sound).toHaveBeenCalledTimes(3);expect(sound.mock.calls.every(c=>c[0]==='triInvalid')).toBe(true);expect(new Set(sound.mock.calls.map(c=>c[1])).size).toBe(3);expect(props.onIntent).not.toHaveBeenCalled();
 fireEvent.click(card(0));expect(props.onIntent).toHaveBeenCalledWith({type:'remove',index:0});expect(sound).toHaveBeenCalledTimes(3);
 h.rerender(<TriTowersBoard {...props} now={1100}/>);expect(sound).toHaveBeenCalledTimes(3);
});
it('checks against the queued upcard, preserving a rapid valid chain and ignoring duplicate pending taps',()=>{
 const input={busy:true,pendingCards:[0],interrupt:vi.fn()} as any,h=render(<TriTowersBoard {...props} input={input}/>),card=(i:number)=>h.container.querySelector(`[data-tri-card="${i}"]`)!;
 fireEvent.click(card(0));fireEvent.click(card(1));expect(sound).not.toHaveBeenCalled();expect(props.onIntent).toHaveBeenCalledExactlyOnceWith({type:'remove',index:1});
 fireEvent.click(card(2));expect(sound).toHaveBeenCalledTimes(1);expect(props.onIntent).toHaveBeenCalledTimes(1);
});
it.each([{replay:true},{paused:true},{connected:false},{presentationActive:false},{canAct:false},{view:{...view,phase:'intro' as const}}])('unavailable gameplay stays silent: %j',overrides=>{
 const h=render(<TriTowersBoard {...props} {...overrides}/>);fireEvent.click(h.container.querySelector('[data-tri-card="2"]')!);expect(sound).not.toHaveBeenCalled();expect(props.onIntent).not.toHaveBeenCalled();
});
