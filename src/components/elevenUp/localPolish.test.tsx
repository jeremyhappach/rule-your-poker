// @vitest-environment jsdom
import {StrictMode} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render} from '@testing-library/react';
import {ElevenUpView} from './ElevenUpView';
import {platformAudio} from '@/lib/audio/platformAudio';
import {audioHarness} from '@/lib/audio/audioTestHarness';
import {elevenSelectCue,elevenDeselectCue,elevenLandingCue} from '@/lib/elevenUp/ballSounds';
import type {ElevenSnapshot} from '@/lib/elevenUp/model';
import {elevenScoreSequence} from '@/lib/elevenUp/scorePresentation';
vi.mock('@/lib/canonicalShell/FullscreenGameShell',()=>({FullscreenGameShell:(p:any)=><main data-fullscreen-board-slot>{p.children}<div data-canonical-felt-interaction-layer=""/></main>}));
let audio:ReturnType<typeof audioHarness>;
beforeEach(async()=>{
 sessionStorage.clear();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
 Object.defineProperty(document,'hidden',{configurable:true,value:false});
 audio=audioHarness();audio.env.now=()=>performance.now();for(let i=0;i<6;i++)await Promise.resolve();
 vi.spyOn(platformAudio,'present').mockImplementation((...args)=>audio.manager.present(...args));
 vi.spyOn(platformAudio,'request').mockImplementation((...args)=>audio.manager.request(...args));
 vi.spyOn(platformAudio,'follow').mockReturnValue(()=>{});
});
afterEach(()=>{cleanup();audio.dispose();vi.restoreAllMocks();vi.unstubAllGlobals();});
const snapshot=():ElevenSnapshot=>({id:'run',scope:'round:1',revision:1,serverAt:1000,round:1,solo:true,canAct:true,paused:false,finished:false,settled:false,players:[{id:'user',name:'You',score:25200,active:true}],board:{rules:{version:'eleven-up/3',stageMs:180000,introMs:2500,readyMs:30000,holdMs:5000,clearCelebrationMs:3000},phase:'playing',slots:[16,20,null],current:44,exposed:[0,1],passSlot:2,canPass:true,stockRemaining:3,groups:0,score:25200,deadline:181000,event:{label:'',points:0}}});
const props=(view=snapshot())=>({view,userId:'user',now:1000,pending:false,error:'',epoch:0,onIntent:vi.fn(),onReconnect:vi.fn()});
it('rapid select/deselect including re-tapping the same ball emits exactly one distinct cue per accepted tap',()=>{
 const p=props(),ui=render(<StrictMode><ElevenUpView {...p}/></StrictMode>),ball=ui.getByRole('button',{name:/^Ball 2,/});
 act(()=>{for(let i=0;i<6;i++)fireEvent.click(ball);});
 expect(platformAudio.request).toHaveBeenCalledTimes(6);
 expect(vi.mocked(platformAudio.request).mock.calls.map(([e])=>e.cue)).toEqual([elevenSelectCue,elevenDeselectCue,elevenSelectCue,elevenDeselectCue,elevenSelectCue,elevenDeselectCue]);
 expect(new Set(vi.mocked(platformAudio.request).mock.calls.map(([e])=>e.id)).size).toBe(6);
 expect(audio.starts()).toHaveLength(6);expect(p.onIntent).not.toHaveBeenCalled();
 audio.manager.setPreference('user',false);fireEvent.click(ball);expect(audio.starts()).toHaveLength(6);
 audio.manager.setPreference('user',true);expect(audio.starts()).toHaveLength(6);
 ui.rerender(<ElevenUpView {...p} pending/>);fireEvent.click(ball);expect(platformAudio.request).toHaveBeenCalledTimes(7);
});
it('only confirmed placement makes contact, exactly once across rerenders; mute consumes it',()=>{
 const p=props(),ui=render(<StrictMode><ElevenUpView {...p}/></StrictMode>);
 fireEvent.click(ui.getByRole('button',{name:/^Pass,/}));expect(platformAudio.present).not.toHaveBeenCalled();
 const next={...p.view,revision:2,board:{...p.view.board,slots:[16,20,44],current:17}};
 ui.rerender(<StrictMode><ElevenUpView {...p} view={next}/></StrictMode>);
 expect(platformAudio.present).toHaveBeenCalledTimes(1);expect(vi.mocked(platformAudio.present).mock.calls[0][0].cue).toBe(elevenLandingCue);
 ui.rerender(<StrictMode><ElevenUpView {...p} view={{...next}} now={1100}/></StrictMode>);expect(platformAudio.present).toHaveBeenCalledTimes(1);
 audio.manager.setPreference('user',false);
 const second={...next,revision:3,board:{...next.board,slots:[17,20,44],current:18}};
 ui.rerender(<StrictMode><ElevenUpView {...p} view={second}/></StrictMode>);
 expect(audio.starts()).toHaveLength(1);audio.manager.setPreference('user',true);
 ui.rerender(<StrictMode><ElevenUpView {...p} view={{...second}}/></StrictMode>);expect(audio.starts()).toHaveLength(1);
});
it.each(['epoch','scope','inactive','paused','mount'])('does not replay a landing after %s',reason=>{
 const p=props(),ui=render(<ElevenUpView {...p}/>),next={...p.view,revision:2,board:{...p.view.board,slots:[16,20,44],current:17}};
 if(reason==='mount'){ui.unmount();render(<ElevenUpView {...p} view={next}/>);}
 else ui.rerender(<ElevenUpView {...p} view={{...next,...(reason==='scope'?{scope:'round:2'}:{}),...(reason==='paused'?{paused:true}:{})}} epoch={reason==='epoch'?1:0} activeTab={reason==='inactive'?'lobby':'cards'}/>);
 expect(platformAudio.present).not.toHaveBeenCalled();
});
it('centers one existing pill, counts to authority, holds 900ms, returns, and does not replay the result',()=>{
 const p=props(),ui=render(<ElevenUpView {...p}/>),pill=ui.container.querySelector('.eleven-score-pill');
 const end:ElevenSnapshot={...p.view,revision:2,players:[{...p.view.players[0],score:31200}],board:{...p.view.board,phase:'stage_complete',deadline:7000,result:{id:'result',reason:'take_score',score:31200,scoreBefore:25200,displayScore:25200,stageScore:31200,groupBonus:1000,clearBonus:0,stockBonus:0,timeBonus:5000,completedAt:2000}}};
 const show=(elapsed:number)=>ui.rerender(<ElevenUpView {...p} view={{...end}} now={2000+elapsed}/>);
 show(250);expect(ui.container.querySelector('.eleven-score-pill')).toBe(pill);expect(pill?.getAttribute('data-centered')).toBe('true');
 expect(ui.queryByText('Elevens')).toBeTruthy();expect(ui.queryByText('Speed')).toBeTruthy();expect(ui.container.querySelector('.eleven-result')).toBeNull();
 show(2000);expect(ui.getByLabelText('Score 28200')).toBeTruthy();show(3300);expect(ui.getByLabelText('Score 31200')).toBeTruthy();
 show(4150);expect(pill?.getAttribute('data-centered')).toBe('true');show(4500);expect(pill?.getAttribute('data-centered')).toBe('false');
 show(4700);expect(pill?.getAttribute('data-centered')).toBe('false');expect(p.onIntent).not.toHaveBeenCalled();
 ui.unmount();const recovered=render(<ElevenUpView {...p} view={end} now={3000} epoch={1}/>);expect(recovered.getByLabelText('Score 31200')).toBeTruthy();expect(recovered.container.querySelector('[data-centered=true]')).toBeNull();
});
it('same-tick repeated Take Score cannot submit twice or admit another play',()=>{
 const p=props(),ui=render(<ElevenUpView {...p}/>),take=ui.getByRole('button',{name:'Take Score'});
 act(()=>{fireEvent.click(take);fireEvent.click(take);fireEvent.click(ui.getByRole('button',{name:/^Pass,/}));fireEvent.click(ui.getByRole('button',{name:/^Ball 2,/}));});
 expect(p.onIntent).toHaveBeenCalledExactlyOnceWith({type:'take_score'});expect(platformAudio.present).not.toHaveBeenCalled();
});
it('first-gesture unlock plays its waiting tap once, and rerender cannot enqueue it again',()=>{
 audio.state('suspended');const p=props(),ui=render(<ElevenUpView {...p}/>);
 fireEvent.click(ui.getByRole('button',{name:/^Ball 2,/}));expect(audio.starts()).toHaveLength(0);
 audio.state('running');expect(audio.starts()).toHaveLength(1);
 ui.rerender(<ElevenUpView {...p} now={1050}/>);expect(audio.starts()).toHaveLength(1);
});
it.each([0,3000])('all-clear retains its frozen %sms celebration and finishes inside the existing hold',clearMs=>{
 const sequence=elevenScoreSequence(clearMs);
 expect(sequence.countWindow(true)).toEqual({start:clearMs+700,end:clearMs+3300});
 expect(sequence.timeline(clearMs+3300,true)).toMatchObject({progress:1,center:1});
 expect(sequence.timeline(clearMs+4200,true)).toMatchObject({progress:1,center:1});
 expect(sequence.timeline(clearMs+4500,true)).toMatchObject({progress:1,center:0});
});
it('reduced motion shows the settled total and supporting bonuses without translating',()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 const p=props(),ui=render(<ElevenUpView {...p}/>);
 const end:ElevenSnapshot={...p.view,revision:2,board:{...p.view.board,phase:'stage_complete',deadline:7000,result:{id:'result',reason:'take_score',score:31200,scoreBefore:25200,displayScore:25200,stageScore:31200,groupBonus:1000,clearBonus:0,stockBonus:0,timeBonus:5000,completedAt:2000}}};
 ui.rerender(<ElevenUpView {...p} view={end} now={3000}/>);
 expect(ui.getByLabelText('Score 31200')).toBeTruthy();expect(ui.queryByText('Elevens')).toBeTruthy();expect(ui.container.querySelector('[data-centered=true]')).toBeNull();expect(platformAudio.follow).not.toHaveBeenCalled();
});
