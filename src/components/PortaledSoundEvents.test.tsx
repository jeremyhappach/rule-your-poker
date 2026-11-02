// @vitest-environment jsdom
import {act,cleanup,render} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TakeTwoView} from './takeTwo/TakeTwoView';
import {TripFlipView} from './tripFlip/TripFlipView';
import {QuintzeeView} from './quintzee/QuintzeeView';
import type {TakeTwoSnapshot} from '@/lib/takeTwo/model';
import type {TripFlipSnapshot} from '@/lib/tripFlip/model';
import type {QuintzeeSnapshot} from '@/lib/quintzee/model';
import {QUINTZEE_RUMBLE_MS} from './quintzee/useQuintzeeRumble';
const sound=vi.hoisted(()=>vi.fn());
const roll=vi.hoisted(()=>({start:vi.fn(),stop:vi.fn()}));
vi.mock('@/lib/audio/presentationSound',()=>({presentSound:sound}));
vi.mock('@/lib/audio/diceRollSound',()=>({startRollSound:roll.start}));
vi.mock('@/components/PlayingCard',()=>({PlayingCard:()=>null}));
vi.mock('@/components/triTowers/TriTowersPresentation',()=>({useTriRoundPresentation:()=>({fraction:0}),TriRoundIntro:()=>null,TriScorePill:()=>null}));
vi.mock('@/lib/canonicalShell/FullscreenGameShell',()=>({FullscreenGameShell:({children}:any)=><main data-fullscreen-board-slot>{children}<div data-canonical-felt-interaction-layer/></main>}));
beforeEach(()=>{vi.useFakeTimers();sound.mockClear();roll.start.mockReset().mockReturnValue(roll.stop);roll.stop.mockClear();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(navigator,'onLine',{configurable:true,value:true});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
const take:TakeTwoSnapshot={id:'game',scope:'round-1',revision:1,serverAt:1000,round:1,canAct:true,paused:false,finished:false,settled:false,solo:true,players:[{id:'u',name:'You',score:0,active:true}],board:{rules:{version:'take-two/1',stageMs:100000,introMs:2500,holdMs:6000,meterMax:500,meterMin:50,meterHoldMs:1000,meterStepsPerSecond:30,meterStep:5},phase:'playing',slots:[1,2,4,5],current:9,layout:[0,1,2,3].map(column=>({row:0,column,x:column*2})),legalPairs:[[0,1],[2,3]],exposed:[0,1,2,3],highScore:0,stockRemaining:23,samePairs:0,consecutivePairs:0,meterAt:1000,score:0,deadline:101000,event:{label:'',points:0}}};
const trip:TripFlipSnapshot={id:'game',scope:'round-1',revision:1,serverAt:1000,round:1,canAct:true,paused:false,finished:false,settled:false,solo:true,players:[{id:'u',name:'You',score:0,active:true}],board:{rules:{version:'trip-flip/1',stageMs:180000,introMs:2500,holdMs:6000,dots:30,dotMs:6000,timePerDot:125},phase:'playing',columns:[[0,13],[],[],[]],cells:[null,null,null],fan:[26,5,52],special:[0,1,2],specialClaimed:false,legalMoves:[[7,0,26],[7,4,26],[0,1,13]],highScore:0,stockRemaining:49,trips:0,runs:0,suitedTotal:0,specialTotal:0,score:0,deadline:181000,event:{label:'',points:0}}};
const snap=(ready=false):QuintzeeSnapshot=>({id:'run',scope:'round',revision:1,theme:'modern',pausedAt:null,status:'active',outcome:'current',serverAt:1000,state:{rules:{} as any,players:['p'],scores:{p:0},round:1,turnIndex:0,qualified:[],results:[],finished:false,board:{rules:{version:'quintzee/2',durationMs:180000,clearBonus:35,upperThreshold:63,upperBonus:35} as any,phase:ready?'ready':'playing',deadline:31000,dice:ready?[]:[2,2,3,4,5],held:[],rollsRemaining:2,rollSerial:ready?0:1,scores:{twos:4},potentials:{chance:16},scoreBefore:0,score:0,result:null}}});
const props={userId:'u',now:1000,pending:false,error:'',epoch:0,onReconnect:()=>{},onIntent:()=>{}};
it('Take 2 uses the actual portaled cards and never sounds initial/recovery snapshots',()=>{
 const ui=render(<TakeTwoView {...props} view={take}/>);expect(sound).not.toHaveBeenCalled();
 const next={...take,revision:2,board:{...take.board,current:10,stockRemaining:22}};
 ui.rerender(<TakeTwoView {...props} view={next}/>);expect(sound).toHaveBeenCalledTimes(1);
 expect(sound.mock.calls[0][0]).toBe('flip');expect(sound.mock.calls[0][2].className).toBe('take-plane');
 ui.rerender(<TakeTwoView {...props} view={next}/>);expect(sound).toHaveBeenCalledTimes(1);
 ui.rerender(<TakeTwoView {...props} epoch={1} view={{...next,revision:3,board:{...next.board,current:11}}}/>);expect(sound).toHaveBeenCalledTimes(1);
});
it('Trip Flip uses its portaled plane; hidden-tab changes never catch up',()=>{
 const ui=render(<TripFlipView {...props} view={trip}/>);
 const next={...trip,revision:2,board:{...trip.board,fan:[5,52]}};
 ui.rerender(<TripFlipView {...props} view={next}/>);expect(sound).toHaveBeenCalledTimes(1);
 expect(sound.mock.calls[0][0]).toBe('slide');expect(sound.mock.calls[0][2].className).toBe('trip-plane');
 const hidden={...next,revision:3,board:{...next.board,fan:[52]}};
 ui.rerender(<TripFlipView {...props} activeTab="lobby" view={hidden}/>);
 ui.rerender(<TripFlipView {...props} activeTab="cards" view={hidden}/>);expect(sound).toHaveBeenCalledTimes(1);
});
it.each([1,5])('Quintzee sounds %i moving tiles on its visible plane and stops without a landing',count=>{
 const before=snap(),ui=render(<QuintzeeView {...props} actor="p" snapshot={before}/>);
 const next=structuredClone(before);next.revision++;next.state.board.rollSerial++;next.state.board.held=Array.from({length:5-count},(_,i)=>i);
 ui.rerender(<QuintzeeView {...props} actor="p" snapshot={next}/>);
 expect(roll.start).toHaveBeenCalledTimes(1);expect(roll.start.mock.calls[0][0]).toBe('quintzeeRoll');expect(roll.start.mock.calls[0][2].className).toBe('quintzee-plane');
 act(()=>vi.advanceTimersByTime(QUINTZEE_RUMBLE_MS-1));expect(roll.stop).not.toHaveBeenCalled();
 act(()=>vi.advanceTimersByTime(1));expect(roll.stop).toHaveBeenCalledTimes(1);expect(sound).not.toHaveBeenCalled();
 ui.rerender(<QuintzeeView {...props} actor="p" snapshot={next}/>);expect(roll.start).toHaveBeenCalledTimes(1);
});
it('Quintzee saved replay never sounds a changing roll',()=>{
 const before=snap(),ui=render(<QuintzeeView {...props} actor="p" snapshot={before} replay/>);
 const next=structuredClone(before);next.revision++;next.state.board.rollSerial++;
 ui.rerender(<QuintzeeView {...props} actor="p" snapshot={next} replay/>);act(()=>vi.advanceTimersByTime(QUINTZEE_RUMBLE_MS));expect(sound).not.toHaveBeenCalled();
});
