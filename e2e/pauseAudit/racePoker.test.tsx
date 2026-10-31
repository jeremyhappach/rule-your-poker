import {act,cleanup,render} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {appendFileSync} from 'node:fs';
import {RacePokerTable} from '@/components/racePoker/RacePokerTable';
const probe=vi.hoisted(()=>({view:null as any,now:1000,ready:false,reconnect:vi.fn(),rpc:vi.fn(),emit:vi.fn(),celebrate:vi.fn(),viewProps:null as any}));
vi.mock('@/hooks/useRacePoker',()=>({useRacePoker:()=>({snapshot:probe.view,now:probe.now,epoch:0,connected:true,error:'',reconnect:probe.reconnect})}));
vi.mock('@/lib/racePoker/client',()=>({racePokerTransport:()=>({}),racePokerRpc:probe.rpc}));
vi.mock('@/components/racePoker/useRacePokerFinancial',()=>({useRacePokerFinancial:()=>probe.ready}));
vi.mock('@/hooks/GameChatContext',()=>({useGameChatContext:()=>({})}));
vi.mock('@/components/MobileChatPanel',()=>({MobileChatPanel:()=>null}));
vi.mock('@/lib/canonicalShell/announcements',()=>({useAnnouncements:()=>({emit:probe.emit,dismiss:()=>{}})}));
vi.mock('@/lib/canonicalShell/ChipTransportProvider',()=>({usePresentationPlayerChipBalance:()=>100}));
vi.mock('@/lib/canonicalShell/winnerCelebration',()=>({celebrateCanonicalWinner:probe.celebrate}));
vi.mock('@/lib/battle31/presentation',()=>({battleFrame:()=>({winner:true}),battleResultText:()=>''}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{follow:()=>()=>{},play:()=>{}}}));
vi.mock('@/lib/audio/platformCues',()=>({knockCue:()=>null}));
vi.mock('@/components/racePoker/RacePokerView',()=>({RacePokerView:(p:any)=>{probe.viewProps=p;return null;},RacePokerRules:()=>null,RacePokerLoading:()=>null}));
const props=()=>({dealerGameId:'dealer',userId:'nonhost',activeTab:'cards' as const,setActiveTab:vi.fn(),sessionEnded:false,onTerminalActive:vi.fn(),onTerminalComplete:vi.fn()});
const record=(scenario:string,extra:any)=>appendFileSync('e2e/pauseAudit/evidence/close-observations.jsonl',JSON.stringify({game:'RacePoker',source:'candidate-uncommitted',layer:'actual table component; mocked hook, authority, finance and visual children',scenario,...extra})+'\n');
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();probe.rpc.mockReset().mockResolvedValue(null);probe.now=1000;probe.ready=false;probe.view={id:'dealer',scope:'dealer:1',identity:{sessionId:'session',roundId:'round'},players:[{id:'player',name:'Nonhost',score:103000}],viewerId:'player',paused:false,settled:false,finished:false,settlement:{player:5},financial:{resultId:'receipt'},results:[],rules:{turnMs:30000,version:'audit'},board:{phase:'complete',rules:{version:'audit'},event:{}},terminal:{resultId:'receipt',score:103000,winnerIds:['player'],startedAt:1000,deadline:4000,achievements:{}}};});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('healthy close waits for authoritative finished and emits completion once',async()=>{
 const p=props(),ui=render(<RacePokerTable {...p}/>);probe.view={...probe.view,settled:true};probe.ready=true;probe.now=5000;
 await act(async()=>ui.rerender(<RacePokerTable {...p}/>));expect(probe.rpc).toHaveBeenCalledTimes(1);expect(probe.rpc.mock.calls[0][1]).toEqual({p_dealer_game_id:'dealer'});expect(probe.rpc.mock.calls[0][0]).toMatch(/_close$/);expect(p.onTerminalComplete).not.toHaveBeenCalled();
 probe.view={...probe.view,finished:true};await act(async()=>ui.rerender(<RacePokerTable {...p}/>));ui.rerender(<RacePokerTable {...p}/>);
 expect(p.onTerminalComplete).toHaveBeenCalledTimes(1);record('healthy',{closeCalls:probe.rpc.mock.calls.length,completionCalls:p.onTerminalComplete.mock.calls.length});
});
for(const role of ['nonhost-actor','nonhost-observer'])it('CONTRACT '+role+' automatically retries delayed close rejection after resume',async()=>{
 if(role.endsWith('observer'))probe.view.viewerId=null;
 let reject!:(e:Error)=>void;probe.rpc.mockImplementationOnce(()=>new Promise((_r,j)=>reject=j));const p=props(),ui=render(<RacePokerTable {...p}/>);
 probe.view={...probe.view,settled:true};probe.ready=true;probe.now=5000;await act(async()=>ui.rerender(<RacePokerTable {...p}/>));expect(probe.rpc).toHaveBeenCalledTimes(1);expect(probe.rpc.mock.calls[0][1]).toEqual({p_dealer_game_id:'dealer'});expect(probe.rpc.mock.calls[0][0]).toMatch(/_close$/);
 probe.view={...probe.view,paused:true,revision:2};ui.rerender(<RacePokerTable {...p}/>);
 probe.view={...probe.view,paused:false,revision:3};ui.rerender(<RacePokerTable {...p}/>);
 await act(async()=>reject(Error('game_paused: delayed response from paused authority')));await act(()=>vi.advanceTimersByTimeAsync(1000));
 for(let n=0;n<3;n++){probe.now+=5000;probe.view={...probe.view,revision:4+n};await act(async()=>ui.rerender(<RacePokerTable {...p}/>));}
 record('delayed-paused-rejection',{role,virtualClockMs:probe.now,closeCalls:probe.rpc.mock.calls.length,completionCalls:p.onTerminalComplete.mock.calls.length,announcementCalls:probe.emit.mock.calls.length});
 expect(p.onTerminalComplete).not.toHaveBeenCalled();expect(probe.rpc).toHaveBeenCalledTimes(2);
});
it('explicit reconnect clears failed close latch; server completion releases once',async()=>{
 probe.rpc.mockRejectedValueOnce(Error('game_paused'));const p=props(),ui=render(<RacePokerTable {...p}/>);probe.view={...probe.view,settled:true};probe.ready=true;probe.now=5000;
 await act(async()=>ui.rerender(<RacePokerTable {...p}/>));await act(async()=>probe.viewProps.onReconnect());probe.now++;
 await act(async()=>ui.rerender(<RacePokerTable {...p}/>));expect(probe.rpc).toHaveBeenCalledTimes(2);expect(p.onTerminalComplete).not.toHaveBeenCalled();
 probe.view={...probe.view,finished:true};await act(async()=>ui.rerender(<RacePokerTable {...p}/>));expect(p.onTerminalComplete).toHaveBeenCalledTimes(1);
 record('explicit-reconnect-control',{closeCalls:2,completionCalls:1});
});

for(const outcome of ['resolve','reject'])it('stale close '+outcome+' cannot retire or reconnect successor identity',async()=>{
 let resolve!:(v:any)=>void,reject!:(e:any)=>void;probe.rpc.mockImplementationOnce(()=>new Promise((r,j)=>{resolve=r;reject=j;}));
 const p=props(),ui=render(<RacePokerTable {...p}/>);probe.view={...probe.view,settled:true};probe.ready=true;probe.now=5000;await act(async()=>ui.rerender(<RacePokerTable {...p}/>));expect(probe.rpc).toHaveBeenCalledTimes(1);
 const next={...p,dealerGameId:'successor'};await act(async()=>ui.rerender(<RacePokerTable {...next}/>));
 await act(async()=>{if(outcome==='resolve')resolve(null);else reject(Error('late old failure'));});
 probe.view={...probe.view,finished:true,closed:true};await act(async()=>ui.rerender(<RacePokerTable {...next}/>));await act(()=>vi.advanceTimersByTimeAsync(2000));
 expect(probe.rpc).toHaveBeenCalledTimes(1);expect(probe.reconnect).not.toHaveBeenCalled();expect(p.onTerminalComplete).not.toHaveBeenCalled();
});
