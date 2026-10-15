// @vitest-environment jsdom
import {act,render,screen,cleanup,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {create,project} from '@/lib/triTowers/referenceEngine';
import type {Projection} from '@/lib/triTowers/model';
const mock=vi.hoisted(()=>({view:null as Projection|null,rpc:vi.fn(),emit:vi.fn()}));
vi.mock('@/hooks/useTriTowers',()=>({useTriTowers:()=>({view:mock.view,now:0,pending:false,connected:true,error:'',act:vi.fn(),reconnect:vi.fn()})}));
vi.mock('@/lib/triTowers/client',()=>({triTowersRpc:mock.rpc}));
vi.mock('@/hooks/GameChatContext',()=>({useGameChatContext:()=>({allMessages:[]})}));
vi.mock('@/components/MobileChatPanel',()=>({MobileChatPanel:()=>null}));
vi.mock('@/lib/canonicalShell/announcements',()=>({useAnnouncements:()=>({emit:mock.emit})}));
vi.mock('./TriTowersView',()=>({TriTowersRules:()=>null,TriTowersView:({onContinue,sessionEnded}:{onContinue?:()=>void;sessionEnded:boolean})=><button disabled={!onContinue} onClick={onContinue}>{sessionEnded?'Session Ended':'Continue'}</button>}));
import {TriTowersGame} from './TriTowersGame';
const complete=vi.fn(),active=vi.fn();
const props={dealerGameId:'dealer',userId:'u1',activeTab:'cards' as const,setActiveTab:vi.fn(),sessionEnded:false,onTerminalActive:active,onTerminalComplete:complete};
beforeEach(()=>{vi.clearAllMocks();mock.rpc.mockResolvedValue(null);const state=create({sessionId:'session',dealerGameId:'dealer',roundId:'round'},[{id:'p1',userId:'u1',name:'One',seat:1},{id:'p2',userId:'u2',name:'Two',seat:2}],Array.from({length:52},(_,i)=>i),0);
 state.phase='complete';state.turnIndex=2;state.scores={p1:10,p2:0};mock.view={...project(state,'p1'),settlement:{p1:5,p2:-5}};
});
afterEach(cleanup);
it('uses the shared terminal announcement and releases the exact scope after authoritative close',async()=>{
 render(<TriTowersGame {...props}/>);expect(active).toHaveBeenCalledWith(true);expect(mock.emit).toHaveBeenCalledTimes(1);
 await act(()=>screen.getByRole('button',{name:'Continue'}).click());
 expect(mock.rpc).toHaveBeenCalledWith('tri_towers_close',{p_dealer_game_id:'dealer'});
 expect(complete).toHaveBeenCalledWith('tri-towers|winseq|session|dealer|1');expect(active).toHaveBeenLastCalledWith(false);
});
it('releases every connected viewer when another client closes, without another financial command',async()=>{
 const {rerender}=render(<TriTowersGame {...props}/>);mock.view={...mock.view!,finished:true,revision:2};rerender(<TriTowersGame {...props}/>);
 await waitFor(()=>expect(complete).toHaveBeenCalledTimes(1));expect(mock.rpc).not.toHaveBeenCalled();expect(active).toHaveBeenLastCalledWith(false);
 rerender(<TriTowersGame {...props}/>);expect(complete).toHaveBeenCalledTimes(1);
});
it('does not complete the local terminal presentation if close fails',async()=>{
 mock.rpc.mockRejectedValueOnce(new Error('offline'));render(<TriTowersGame {...props}/>);await act(()=>screen.getByRole('button',{name:'Continue'}).click());expect(complete).not.toHaveBeenCalled();expect(active).toHaveBeenLastCalledWith(true);
});
