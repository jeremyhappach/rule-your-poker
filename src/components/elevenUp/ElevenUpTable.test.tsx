// @vitest-environment jsdom
import {cleanup,render,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ElevenUpTable} from './ElevenUpTable';
const probe=vi.hoisted(()=>({view:null as any,now:1000,ready:false,reconnect:vi.fn(),rpc:vi.fn(),emit:vi.fn(),celebrate:vi.fn()}));
vi.mock('@/hooks/useElevenUp',()=>({useElevenUp:()=>({snapshot:probe.view,now:probe.now,epoch:0,reconnect:probe.reconnect})}));
vi.mock('@/lib/elevenUp/client',()=>({elevenTransport:()=>({}),elevenRpc:probe.rpc}));
vi.mock('./useElevenFinancial',()=>({useElevenFinancial:()=>probe.ready}));
vi.mock('@/hooks/GameChatContext',()=>({useGameChatContext:()=>({})}));
vi.mock('@/components/MobileChatPanel',()=>({MobileChatPanel:()=>null}));
vi.mock('@/lib/canonicalShell/announcements',()=>({useAnnouncements:()=>({emit:probe.emit})}));
vi.mock('@/lib/canonicalShell/ChipTransportProvider',()=>({usePresentationPlayerChipBalance:()=>100}));
vi.mock('@/lib/canonicalShell/winnerCelebration',()=>({celebrateCanonicalWinner:probe.celebrate}));
vi.mock('./ElevenUpView',()=>({ElevenUpView:()=>null,ElevenUpRules:()=>null}));
const props=()=>({dealerGameId:'dealer',userId:'account',activeTab:'cards' as const,setActiveTab:vi.fn(),sessionEnded:false,onTerminalActive:vi.fn(),onTerminalComplete:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();probe.rpc.mockResolvedValue(null);probe.now=1000;probe.ready=false;probe.view={id:'dealer',identity:{sessionId:'session',roundId:'round'},players:[{id:'player',name:'Hap',score:103000}],viewerId:'player',settled:false,finished:false,settlement:{player:5},financial:{resultId:'receipt'},terminal:{resultId:'receipt',score:103000,winnerIds:['player'],startedAt:1000,deadline:4000,achievements:{}}};});
afterEach(cleanup);
it('waits for the authoritative hold and completed chip transfer, then closes once and waits for acknowledgement',async()=>{
 const p=props(),ui=render(<ElevenUpTable {...p}/>);
 probe.view={...probe.view,settled:true};probe.ready=true;probe.now=2000;ui.rerender(<ElevenUpTable {...p}/>);
 expect(probe.celebrate).toHaveBeenCalledExactlyOnceWith('receipt','player',['player'],true);expect(probe.rpc).not.toHaveBeenCalled();
 probe.ready=false;probe.now=5000;ui.rerender(<ElevenUpTable {...p}/>);expect(probe.rpc).not.toHaveBeenCalled();
 probe.ready=true;ui.rerender(<ElevenUpTable {...p}/>);await waitFor(()=>expect(probe.reconnect).toHaveBeenCalledTimes(1));
 expect(p.onTerminalComplete).not.toHaveBeenCalled();ui.rerender(<ElevenUpTable {...p}/>);expect(probe.rpc).toHaveBeenCalledTimes(1);
 probe.view={...probe.view,finished:true};ui.rerender(<ElevenUpTable {...p}/>);
 expect(p.onTerminalComplete).toHaveBeenCalledExactlyOnceWith('eleven-up|winseq|session|dealer|1|receipt|round');expect(probe.emit).toHaveBeenCalledTimes(1);
});
it('seeks past an expired result on reconnect without replaying confetti or restarting its hold',()=>{
 probe.view={...probe.view,settled:true,finished:true};probe.ready=true;probe.now=9000;const p=props();render(<ElevenUpTable {...p}/>);
 expect(probe.celebrate).not.toHaveBeenCalled();expect(probe.emit).not.toHaveBeenCalled();expect(probe.rpc).not.toHaveBeenCalled();expect(p.onTerminalComplete).toHaveBeenCalledTimes(1);
});
