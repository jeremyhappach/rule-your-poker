// @vitest-environment jsdom
import {act,cleanup,render} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TakeTwoView} from './TakeTwoView';
import {audioHarness} from '@/lib/audio/audioTestHarness';
import {takeTwoRoundPresentation,takeTwoResultTimeline} from '@/lib/takeTwo/roundPresentation';
import type {TakeTwoSnapshot} from '@/lib/takeTwo/model';
const audio=vi.hoisted(()=>({follow:vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:audio}));
vi.mock('@/components/PlayingCard',()=>({PlayingCard:()=>null}));
let h:ReturnType<typeof audioHarness>;
const ready=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
beforeEach(async()=>{
 vi.useFakeTimers();vi.clearAllMocks();sessionStorage.clear();
 Object.defineProperty(document,'hidden',{configurable:true,value:false});
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});Element.prototype.scrollIntoView=vi.fn();
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
 h=audioHarness();h.env.now=()=>performance.now();audio.follow.mockImplementation(e=>h.manager.follow(e));await ready();
});
afterEach(()=>{cleanup();h.dispose();vi.useRealTimers();vi.unstubAllGlobals();});
const base:TakeTwoSnapshot={id:'game',scope:'round',revision:1,serverAt:1000,round:1,canAct:true,paused:false,finished:false,settled:false,solo:true,players:[{id:'user',name:'You',score:1234,active:true}],board:{rules:{version:'take-two/1',stageMs:100000,introMs:2500,holdMs:6000,meterMax:500,meterMin:50,meterHoldMs:1000,meterStepsPerSecond:30,meterStep:5},phase:'playing',slots:[0,1],current:9,layout:[0,1].map(column=>({row:0,column,x:column*2})),legalPairs:[[0,1]],exposed:[0,1],highScore:0,stockRemaining:2,samePairs:0,consecutivePairs:0,meterAt:1000,score:8000,deadline:101000,event:{label:'',points:0}}};
const result={reason:'full_clear',score:17345,scoreBefore:1234,displayScore:8000,stageScore:16111,clearBonus:6543,stockBonus:2000,timeBonus:802,completedAt:2000};
const props={userId:'user',now:1000,pending:false,error:'',epoch:0,onReconnect:()=>{},onIntent:vi.fn()};
const calls=(prefix:string)=>audio.follow.mock.calls.filter(([e])=>e.id.startsWith(prefix));
function start(solo=true,reason='full_clear'){
 const view={...base,solo,scope:`${solo?'arcade':'multi'}:round`},end={...view,board:{...view.board,phase:'stage_complete' as const,deadline:8000,result:{...result,reason},score:result.score}};
 const ui=render(<TakeTwoView {...props} view={view}/>);let last=0;
 const show=(elapsed:number,extra={})=>{act(()=>vi.advanceTimersByTime(elapsed-last));last=elapsed;ui.rerender(<TakeTwoView {...props} view={end} now={2000+elapsed} {...extra}/>);};
 return {ui,view,end,show};
}
it.each([true,false])('solo=%s: all-clear sound ends before count-up, actual bonus and final total occur once',solo=>{
 const {ui,show}=start(solo);show(0);
 expect(ui.getByLabelText('All clear! +6,543!')).toBeTruthy();expect(ui.getByLabelText('Score 1234')).toBeTruthy();
 expect(calls('take-two-clear:')).toHaveLength(1);expect(calls('take-two-count:')).toHaveLength(0);
 expect(h.nodes.some(n=>n.type==='triangle')).toBe(true);expect(h.ctx.createPeriodicWave).not.toHaveBeenCalled();
 show(2900);expect(ui.getByLabelText('All clear! +6,543!')).toBeTruthy();expect(calls('take-two-count:')).toHaveLength(0);
 show(3000);expect(ui.queryByText('ALL CLEAR!')).toBeNull();expect(calls('take-two-count:')).toHaveLength(0);
 show(3200);expect(document.querySelector('[data-centered=true]')).toBeTruthy();expect(calls('take-two-count:')).toHaveLength(1);
 const count=calls('take-two-count:')[0][0];expect(count.expiresAt-count.startedAt).toBeCloseTo(2000,5);
 show(4200);expect(ui.getByLabelText('Score 9290')).toBeTruthy();
 show(5200);expect(ui.getByLabelText('Score 17345')).toBeTruthy();
 show(5500);expect(document.querySelector('[data-centered=true]')).toBeNull();expect(ui.getByLabelText('Score 17345')).toBeTruthy();
 expect(ui.queryByText(/Pairs and draws|Undrawn stock|Time bonus/)).toBeNull();expect(calls('take-two-clear:')).toHaveLength(1);
 expect(props.onIntent).not.toHaveBeenCalled();expect(takeTwoResultTimeline(6000,true).progress).toBe(1);
});
it.each([true,false])('solo=%s: ordinary ending goes straight to the accepted score sequence',solo=>{
 const {ui,show}=start(solo,'take_score');show(200);expect(document.querySelector('[data-centered=true]')).toBeTruthy();expect(ui.queryByText('ALL CLEAR!')).toBeNull();
 show(1200);expect(calls('take-two-count:')).toHaveLength(1);expect(calls('take-two-clear:')).toHaveLength(0);
 const count=calls('take-two-count:')[0][0];expect(count.expiresAt-count.startedAt).toBeCloseTo(2800,5);
 show(4000);expect(ui.getByLabelText('Score 17345')).toBeTruthy();show(4300);expect(document.querySelector('[data-centered=true]')).toBeNull();
});
it('a reconnect seeks the score phase and never replays celebration or count audio',()=>{
 const {ui,end,show}=start();show(500);ui.unmount();const count=h.starts().length;
 const restored=render(<TakeTwoView {...props} view={end} now={6200} epoch={1}/>);
 expect(restored.queryByText('ALL CLEAR!')).toBeNull();expect(restored.getByLabelText('Score 9290')).toBeTruthy();expect(document.querySelector('[data-centered=true]')).toBeTruthy();
 expect(calls('take-two-clear:')).toHaveLength(1);expect(calls('take-two-count:')).toHaveLength(0);expect(h.starts()).toHaveLength(count);
});
it('a fresh mount during all-clear seeks the remaining visual without starting old audio',()=>{
 const end={...base,board:{...base.board,phase:'stage_complete' as const,deadline:8000,result}};
 const ui=render(<TakeTwoView {...props} view={end} now={3500} epoch={1}/>);
 expect(ui.getByLabelText('All clear! +6,543!')).toBeTruthy();expect(audio.follow).not.toHaveBeenCalled();
 ui.rerender(<TakeTwoView {...props} view={end} now={6200} epoch={1}/>);
 expect(ui.queryByText('ALL CLEAR!')).toBeNull();expect(ui.getByLabelText('Score 9290')).toBeTruthy();expect(audio.follow).not.toHaveBeenCalled();
});
it('connection recovery during counting seeks visually without replaying its sound',()=>{
 const {ui,show}=start();show(3300);expect(calls('take-two-count:')).toHaveLength(1);
 show(3600,{connected:false});show(4200,{connected:true,epoch:1});expect(ui.getByLabelText('Score 9290')).toBeTruthy();expect(calls('take-two-count:')).toHaveLength(1);
});
it('background/resume retires old audio while visuals seek the same authoritative window',()=>{
 const {ui,show}=start();show(500);const count=h.starts().length;
 act(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 act(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 show(4200,{epoch:1});expect(ui.getByLabelText('Score 9290')).toBeTruthy();expect(calls('take-two-count:')).toHaveLength(0);expect(h.starts()).toHaveLength(count);
});
it('uses the shifted server deadline on pause/resume, not wall time since completion',()=>{
 const paused={...base.board,phase:'stage_complete' as const,result,deadline:8000};
 expect(takeTwoRoundPresentation(paused,'scope',2500)?.elapsed).toBe(500);
 expect(takeTwoRoundPresentation({...paused,deadline:18000},'scope',12500)?.elapsed).toBe(500);
});
it('mute stays silent; switching Arcade→multiplayer→Arcade allows only new event audio',async()=>{
 h.manager.setPreference('user',false);const first=start();first.show(0);first.show(3200);expect(h.starts()).toHaveLength(0);first.ui.unmount();await ready();
 h.manager.setPreference('user',true);const second=start(false);second.show(0);expect(h.starts().length).toBeGreaterThan(0);second.show(3200);second.ui.unmount();await ready();const count=h.starts().length;
 render(<TakeTwoView {...props} view={first.end} now={6200} epoch={1}/>);expect(h.starts()).toHaveLength(count);expect(h.createContext).toHaveBeenCalledTimes(1);
});
it('reduced motion shows the authoritative total without motion or sound',()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 const {ui,show}=start();show(0);expect(ui.getByText('ALL CLEAR!')).toBeTruthy();show(4200);expect(ui.getByLabelText('Score 17345')).toBeTruthy();expect(audio.follow).not.toHaveBeenCalled();
});
