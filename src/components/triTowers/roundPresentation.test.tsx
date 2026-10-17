// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,render,renderHook} from '@testing-library/react';
import {TriTowersBoard} from './TriTowersBoard';
import {useTriLiveEntry} from '@/hooks/useTriLiveEntry';
import {triDealProgress,triResultTimeline} from '@/lib/triTowers/roundTimeline';
import rulesV2 from '@/lib/triTowers/rules-v2.json';
import type {TriTowersBoardView} from './TriTowersBoard';
const audio=vi.hoisted(()=>({follow:vi.fn((_event:any)=>vi.fn())}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:audio}));
vi.mock('@/components/PlayingCard',()=>({PlayingCard:({isHidden}:any)=><span data-card-back={isHidden}/> }));
globalThis.ResizeObserver=class{observe(){}disconnect(){}unobserve(){}} as any;
const rules={...rulesV2,version:'tri-towers/3',roundIntroMs:2500};
const base:TriTowersBoardView={rules,phase:'playing',cards:Array.from({length:28},(_,i)=>i<18?null:i),removed:[2,0],waste:3,stockRemaining:17,run:2,deadline:121000,highRun:7};
const props={canAct:true,onIntent:vi.fn(),roundKey:'game:round:player:1',now:1000,userId:'user',scores:[{id:'player',score:1000,active:true}],result:null};
const result={id:'result-1',stage:1,reason:'cleared',scoreBefore:100,score:1000,stageScore:900,timeBonus:20,stockBonus:3000,completedAt:2000,elapsed:600,displayScore:0};
const calls=(prefix:string)=>audio.follow.mock.calls.filter(([e]:any)=>e.id.startsWith(prefix));
beforeEach(()=>{vi.clearAllMocks();Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(window,'matchMedia',{configurable:true,value:vi.fn(()=>({matches:false,addEventListener(){},removeEventListener(){}}))});});
afterEach(cleanup);

describe('shared v3 round presentation in both adapters',()=>{
 it('keeps the title visible well past the former 550ms cutoff',()=>{
  const ui=render(<TriTowersBoard {...props} now={1700} view={{...base,phase:'intro',deadline:2500}} roundLabel="BONUS ROUND" turnLabel="YOUR TURN"/>);
  expect(ui.getByText('BONUS ROUND')).toBeTruthy();expect(ui.container.querySelector<HTMLElement>('.tri-deal-title')?.style.opacity).not.toBe('0');expect(ui.container.querySelector('[data-run21-round-intro]')?.getAttribute('data-fading')).toBe('false');
 });
 it('travels for 120ms on confirmation without disabling input; old completion cannot replace a newer upcard',()=>{
  const animations:any[]=[];vi.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(this:Element){return this.closest('.tri-waste')?new DOMRect(20,400,60,90):new DOMRect(100,100,40,60);});
  Object.defineProperty(Element.prototype,'animate',{configurable:true,value:vi.fn((_frames,options)=>{const animation={cancel:vi.fn(),onfinish:null,options};animations.push(animation);return animation;})});
  const ui=render(<TriTowersBoard {...props} view={{...base,waste:18}}/>);
  ui.rerender(<TriTowersBoard {...props} view={{...base,removed:[...base.removed,19],waste:19}}/>);expect(animations[0].options.duration).toBe(120);expect(Element.prototype.animate).toHaveBeenCalledWith([{transform:'translate(0,0)'},{transform:'translate(-80px,300px) scale(1.5,1.5)'}],expect.objectContaining({duration:120}));expect(ui.getByRole('button',{name:'Remove 8 of hearts'}).hasAttribute('disabled')).toBe(false);
  ui.rerender(<TriTowersBoard {...props} view={{...base,removed:[...base.removed,19],waste:19}}/>);expect(animations[0].cancel).not.toHaveBeenCalled();expect(animations).toHaveLength(1);
  ui.rerender(<TriTowersBoard {...props} view={{...base,removed:[...base.removed,19,20],waste:20}}/>);expect(animations[0].cancel).toHaveBeenCalled();act(()=>animations[0].onfinish());expect(ui.container.querySelector('.tri-card-flight')).toBeTruthy();act(()=>animations[1].onfinish());expect(ui.container.querySelector('.tri-card-flight')).toBeNull();expect(ui.getByLabelText('Waste 8 of hearts')).toBeTruthy();
  delete (Element.prototype as any).animate;vi.restoreAllMocks();
 });
 it.each(['arcade','multiplayer'])('%s: Ready has only text; accepted playing snapshot reveals the full clock',mode=>{
  const ui=render(<TriTowersBoard {...props} scores={mode==='arcade'?props.scores:[...props.scores,{id:'other',score:500,active:false}]} view={{...base,phase:'ready',deadline:31000}}/>);
  expect(ui.getByText('Play a card or draw · 30s')).toBeTruthy();expect(ui.queryByRole('progressbar')).toBeNull();expect(ui.container.querySelector('.tri-dots')).toBeNull();
  // Rejected/stale intent returns Ready: it cannot create a playing presentation.
  ui.rerender(<TriTowersBoard {...props} view={{...base,phase:'ready',deadline:31000}}/>);expect(ui.queryByRole('progressbar')).toBeNull();
  ui.rerender(<TriTowersBoard {...props} view={base}/>);expect(ui.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('120');
 });
 it('deals in board order, then stock and the public upcard; late mount seeks and never hides a Ready card',()=>{
  const ui=render(<TriTowersBoard {...props} now={1300} view={{...base,phase:'intro',deadline:2500,removed:[]}}/>);
  expect(ui.container.querySelector('[data-tri-card="0"]')?.getAttribute('style')).toContain('opacity: 1');
  expect(ui.container.querySelector('[data-tri-card="27"]')?.getAttribute('style')).toContain('opacity: 0');
  expect(ui.container.querySelectorAll('[data-card-back=true]')).toHaveLength(20);
  expect(ui.container.querySelector('.tri-stock')?.getAttribute('style')).toContain('opacity: 0');
  ui.rerender(<TriTowersBoard {...props} now={1950} view={{...base,phase:'intro',deadline:2500}}/>);
  expect(ui.container.querySelector('.tri-stock')?.getAttribute('style')).toContain('opacity: 1');expect(ui.container.querySelector('.tri-waste [data-card-back=true]')).toBeTruthy();
  ui.rerender(<TriTowersBoard {...props} now={2250} view={{...base,phase:'intro',deadline:2500}}/>);expect(ui.container.querySelector('.tri-waste [data-card-back=false]')).toBeTruthy();
  ui.rerender(<TriTowersBoard {...props} now={2600} view={{...base,phase:'ready',deadline:32500}}/>);expect(ui.container.querySelector('[data-tri-card="27"]')?.getAttribute('style')).toContain('opacity: 1');
  expect(triDealProgress(1580,27)).toBe(1);expect(triDealProgress(2200,'upcard')).toBe(1);
 });
 it('admits first and bonus bells after ordinary delivery latency, not mount/reconnect/background restoration',()=>{
  const intro={...base,phase:'intro' as const,deadline:2500};
  const ui=render(<TriTowersBoard {...props} view={intro} now={600} liveEntry/>);
  expect(calls('run21-bell:tri:')).toHaveLength(1);
  ui.rerender(<TriTowersBoard {...props} view={intro} now={800} liveEntry recoveryEpoch={1}/>);expect(calls('run21-bell:tri:')).toHaveLength(1);
  ui.rerender(<TriTowersBoard {...props} view={base} recoveryEpoch={1}/>);
  ui.rerender(<TriTowersBoard {...props} view={{...intro,deadline:9500}} now={7400} roundKey="bonus" recoveryEpoch={1}/>);expect(calls('run21-bell:tri:')).toHaveLength(2);
  act(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  act(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});expect(calls('run21-bell:tri:')).toHaveLength(2);
  ui.unmount();render(<TriTowersBoard {...props} view={intro} now={600}/>);expect(calls('run21-bell:tri:')).toHaveLength(2);
 });
 it('finishes score, sound and remaining-time drain together before returning; awards/cards persist',()=>{
  const ui=render(<TriTowersBoard {...props} view={base}/>),cards=ui.container.querySelectorAll('[data-tri-card]').length;
  const end={...base,phase:'stage_complete' as const,deadline:7000};
  ui.rerender(<TriTowersBoard {...props} view={end} now={2600} result={result}/>);
  expect(ui.getByLabelText('Score 100')).toBeTruthy();expect(calls('tri-clear:')).toHaveLength(1);expect(calls('tri-count:')).toHaveLength(0);
  ui.rerender(<TriTowersBoard {...props} view={end} now={4900} result={{...result,elapsed:2900}}/>);
  expect(ui.getByLabelText('Score 550')).toBeTruthy();expect(Number(ui.getByRole('progressbar').getAttribute('aria-valuenow'))).toBe(59.5);expect(ui.container.querySelector('[data-centered=true]')).toBeTruthy();
  const count=calls('tri-count:')[0]?.[0] as any;expect(count.expiresAt-count.startedAt).toBeCloseTo(2200,6);
  ui.rerender(<TriTowersBoard {...props} view={end} now={6000} result={{...result,elapsed:4000}}/>);
  expect(ui.getByLabelText('Score 1000')).toBeTruthy();expect(ui.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');expect(ui.container.querySelector('[data-centered=true]')).toBeTruthy();
  expect(ui.queryByLabelText('All three towers cleared')).toBeNull();
  ui.rerender(<TriTowersBoard {...props} view={end} now={6300} result={{...result,elapsed:4300}}/>);expect(ui.container.querySelector('[data-centered=true]')).toBeNull();
  expect(ui.container.querySelectorAll('[data-tri-card]')).toHaveLength(cards);expect(ui.container.querySelectorAll('[data-tower-award]')).toHaveLength(2);
  expect(calls('tri-clear:')).toHaveLength(1);expect(triResultTimeline(5000)).toEqual({progress:1,center:0,crest:0});
 });
 it.each([100,50])('does not count or sound unchanged/reduced totals (%i), but waits for the drain',score=>{
  const ui=render(<TriTowersBoard {...props} view={base}/>);
  ui.rerender(<TriTowersBoard {...props} view={{...base,phase:'stage_complete'}} result={{...result,reason:'take_score',score,elapsed:2600}}/>);
  expect(ui.getByLabelText(`Score ${score}`)).toBeTruthy();expect(calls('tri-count:')).toHaveLength(0);expect(calls('tri-clear:')).toHaveLength(0);expect(ui.container.querySelector('[data-centered=true]')).toBeTruthy();
 });
 it('retires result effects on recovery and settles both values immediately for reduced motion',()=>{
  const ui=render(<TriTowersBoard {...props} view={base}/>),end={...base,phase:'stage_complete' as const};
  ui.rerender(<TriTowersBoard {...props} view={end} result={result}/>);
  ui.rerender(<TriTowersBoard {...props} view={end} result={result} recoveryEpoch={1}/>);expect(ui.container.querySelector('[data-centered=true]')).toBeNull();expect(ui.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  ui.unmount();vi.clearAllMocks();vi.mocked(window.matchMedia).mockReturnValue({matches:true,addEventListener(){},removeEventListener(){}} as any);
  const reduced=render(<TriTowersBoard {...props} view={base}/>);reduced.rerender(<TriTowersBoard {...props} view={end} result={result}/>);
  expect(reduced.getByLabelText('Score 1000')).toBeTruthy();expect(reduced.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');expect(audio.follow).not.toHaveBeenCalled();
 });
 it('classifies first multiplayer mount as recovery and a witnessed dealer transition as live',()=>{
  const hook=renderHook(({dealer,status})=>useTriLiveEntry('session',dealer,'tri-towers',status),{initialProps:{dealer:'old',status:'playing'}});
  expect(hook.result.current).toBe(false);hook.rerender({dealer:'new',status:'playing'});expect(hook.result.current).toBe(true);
 });
});
