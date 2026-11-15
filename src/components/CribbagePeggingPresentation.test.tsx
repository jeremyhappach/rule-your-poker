// @vitest-environment jsdom
import {useEffect, useLayoutEffect, useMemo} from 'react';
import {act, cleanup, render, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {useCribbagePeggingPresentation} from '@/hooks/useCribbagePeggingPresentation';
import {CribbagePegBoard} from './CribbagePegBoard';
import {CribbagePlayCardAnimation} from './CribbagePlayCardAnimation';
import {CanonicalAnnouncementProvider, useAnnouncements, useAnnouncementContext} from '@/lib/canonicalShell/announcements/CanonicalAnnouncementProvider';
import {CanonicalAnnouncementLayer} from '@/lib/canonicalShell/announcements/CanonicalAnnouncementLayer';
import {publishCribbageScoringNotice} from '@/lib/cribbage/scoringPresentation';
import type {CribbageState} from '@/lib/cribbageTypes';
const audio = vi.hoisted(() => ({play: vi.fn(), go: vi.fn()}));
vi.mock('@/lib/cribbage/sounds', async original => ({...await original<object>(), presentCribbageScore: audio.play, presentCribbageGo: audio.go}));
vi.mock('@/lib/debugEventLogger', () => ({logDebugEvent: vi.fn()}));
vi.mock('@/lib/wave5GameplayGeometry/CribbageGameplayGeometryProvider', () => ({useCribbageGameplayGeometry: () => ({placementsById: new Map(), lastValidPlacementsById: new Map()})}));
vi.mock('@/lib/wave4LayoutResolver/useLiveGeometryConstraints', () => ({useLiveGeometryConstraints: () => ({vminInPx: 3.9})}));
vi.mock('./CribbagePlayingCard', () => ({CribbagePlayingCard: () => <span>card</span>}));
const players = [{id:'p1', user_id:'u1', position:0}, {id:'p2', user_id:'u2', position:1}];
const card = {rank:'7', suit:'clubs' as const, value:7};
const base = {phase:'pegging', pegging:{playedCards:[]}, playerStates:{p1:{pegScore:10},p2:{pegScore:0}}} as unknown as CribbageState;
const award = (points:number, phase='pegging', id='award') => ({...base, phase, pegging:{playedCards:[{playerId:'p1',card}]},
  lastEvent:{id,type:'pegging_points',playerId:'p1',points,label:points===1?'Last':'Pair',createdAt:''},
  playerStates:{p1:{pegScore:10+points},p2:{pegScore:0}}}) as unknown as CribbageState;
function Scene({state, scope='hand', active=true, mode='self'}:{state:CribbageState;scope?:string;active?:boolean;mode?:'self'|'opponent'}) {
  const presentation = useCribbagePeggingPresentation({scope,state,admitted:true,active});
  const rail = useAnnouncements();
  useLayoutEffect(() => {
    const event = presentation.event;
    if (event) publishCribbageScoringNotice(rail,{gameId:'g',roundId:scope,id:event.id,title:event.label+' +'+event.points,
      ttlMs:3000,onRetired:()=>presentation.retired(event.id)});
  }, [presentation.event?.id]);
  const visible = useAnnouncementContext()?.active?.id === presentation.event?.id && !!presentation.event;
  useEffect(()=>{if(visible&&presentation.event)presentation.presented(presentation.event.id);},[visible,presentation.event?.id]);
  const intent = useMemo(()=>state.lastEvent ? {id:scope+'-flight',mode,card,sourceRect:{x:0,y:200,width:40,height:60},destRect:{x:100,y:0,width:40,height:60}} : null,[scope,mode,state.lastEvent?.id]);
  return <><CanonicalAnnouncementLayer/><output>{presentation.pending?'held':'ready'}</output>
    <CribbagePlayCardAnimation intent={intent} onSettled={()=>presentation.landed(scope,card)}/>
    <CribbagePegBoard players={players} playerStates={state.playerStates} winningScore={121} audioActive={active}
      goDeclaration={presentation.go}
      audioAward={visible&&presentation.event?{id:scope+':'+presentation.event.id,points:presentation.event.points}:null}/></>;
}
const ui = (state:CribbageState, props:Partial<Parameters<typeof Scene>[0]>={}) =>
  <CanonicalAnnouncementProvider dealerGameId="g"><Scene state={state} {...props}/></CanonicalAnnouncementProvider>;
beforeEach(()=>{vi.useFakeTimers();audio.play.mockReset();audio.go.mockReset();vi.spyOn(console,'log').mockImplementation(()=>{});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
it.each(['self','opponent'] as const)('waits for the %s card handoff before publishing its callout and clicks', async mode=>{
  const view=render(ui(base,{mode})); view.rerender(ui(award(2),{mode}));
  expect(audio.play).not.toHaveBeenCalled();
  expect(document.querySelector('[data-canonical-announcement-content]')?.textContent??'').not.toContain('Pair');
  await act(async()=>vi.advanceTimersByTime(619)); expect(audio.play).not.toHaveBeenCalled();
  await act(async()=>vi.advanceTimersByTime(1));
  expect(audio.play).toHaveBeenCalledOnce(); expect(audio.play.mock.lastCall?.[0]).toBe(2);
  expect(document.querySelector('[data-canonical-announcement-content]')?.textContent).toContain('Pair +2');
  view.rerender(ui(award(2),{mode})); expect(audio.play).toHaveBeenCalledOnce();
});
it('sounds Last +1 in the counting snapshot and holds counting until the final notice retires',async()=>{
  const view=render(ui(base)); view.rerender(ui(award(1,'counting')));
  await act(async()=>vi.advanceTimersByTime(620)); expect(audio.play.mock.lastCall?.[0]).toBe(1);
  await act(async()=>vi.advanceTimersByTime(120)); expect(view.container.querySelector('output')?.textContent).toBe('held');
  await act(async()=>vi.advanceTimersByTime(2880)); expect(view.container.querySelector('output')?.textContent).toBe('ready');
  expect(audio.play).toHaveBeenCalledOnce();
});
it('consumes historical and interrupted awards without replay',async()=>{
  const view=render(ui(award(1,'counting')));
  await act(async()=>vi.advanceTimersByTime(4000)); expect(audio.play).not.toHaveBeenCalled();
  view.rerender(ui(base,{scope:'next'})); view.rerender(ui(award(2),{scope:'next'}));
  view.rerender(ui(award(2),{scope:'next',active:false}));
  await act(async()=>vi.advanceTimersByTime(1000));
  view.rerender(ui(award(2),{scope:'next'})); expect(audio.play).not.toHaveBeenCalled();
});
it('a new Go after interruption does not wait for an old card to fly again',()=>{
  const hook=renderHook(({state,active})=>useCribbagePeggingPresentation({scope:'hand',state,active,admitted:true}),
    {initialProps:{state:base,active:false}});
  hook.rerender({state:award(2),active:false});
  hook.rerender({state:award(2),active:true});expect(hook.result.current.event).toBeNull();
  const go=award(1,'pegging','fresh-go');go.lastEvent!.type='go_point';go.lastEvent!.label='Go';
  hook.rerender({state:go,active:true});expect(hook.result.current.event?.id).toBe('fresh-go');
});
it('rebases the first offline recovery receipt silently, then admits the next live award',()=>{
  const hook=renderHook(({state})=>useCribbagePeggingPresentation({scope:'hand',state,active:true,admitted:true}),{initialProps:{state:base}});
  act(()=>window.dispatchEvent(new Event('offline')));
  hook.rerender({state:award(2)});expect(hook.result.current.event).toBeNull();expect(hook.result.current.pending).toBe(false);
  hook.rerender({state:award(1,'pegging','fresh-go')});expect(hook.result.current.event?.id).toBe('fresh-go');
});

it('sounds a Go declaration once without a point award, including its reset-surviving latch',()=>{
  const view=render(ui(base));
  const go={...base,pegging:{...base.pegging,eventSequence:2,goCalledBy:['p2']}} as CribbageState;
  view.rerender(ui(go));
  expect(audio.go).toHaveBeenCalledOnce();expect(audio.play).not.toHaveBeenCalled();
  expect(go.playerStates).toEqual(base.playerStates);
  view.rerender(ui({...go,pegging:{...go.pegging,goCalledBy:[],pendingGoBubblePlayerIds:['p2']}}));
  expect(audio.go).toHaveBeenCalledOnce();expect(audio.play).not.toHaveBeenCalled();
  view.rerender(ui({...base,pegging:{...base.pegging,eventSequence:3,goCalledBy:[]}}));
  view.rerender(ui({...go,pegging:{...go.pegging,eventSequence:4}}));
  expect(audio.go).toHaveBeenCalledTimes(2);
  expect(audio.go.mock.calls[1][0]).not.toBe(audio.go.mock.calls[0][0]);
});

it('waits for the triggering card before sounding an automatic Go and rebases recovery silently',()=>{
  const hook=renderHook(({state})=>useCribbagePeggingPresentation({scope:'hand',state,active:true,admitted:true}),{initialProps:{state:base}});
  const go={...base,pegging:{playedCards:[{playerId:'p1',card}],eventSequence:2,goCalledBy:['p2']}} as CribbageState;
  hook.rerender({state:go});expect(hook.result.current.go).toBeNull();
  act(()=>hook.result.current.landed('old-hand',card));expect(hook.result.current.go).toBeNull();
  act(()=>hook.result.current.landed('hand',card));expect(hook.result.current.go?.playerIds).toEqual(['p2']);
  act(()=>window.dispatchEvent(new Event('offline')));expect(hook.result.current.go).toBeNull();
  hook.rerender({state:{...go,pegging:{...go.pegging,eventSequence:3}}});expect(hook.result.current.go).toBeNull();
  const point={...go,lastEvent:{id:'run-end',type:'go_point',playerId:'p1',points:1,label:'Go',createdAt:''}} as CribbageState;
  hook.rerender({state:point});expect(hook.result.current.event?.points).toBe(1);
  expect(hook.result.current.go).toBeNull();
});
