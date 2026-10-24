// @vitest-environment jsdom
import {act,cleanup,render} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
const signals=vi.hoisted(()=>({settled:false,proof:null as any,sweep:null as any}));
vi.mock('@/lib/canonicalShell/cardTransport/DealRuntime',()=>({useDealRuntime:()=>({dealSettled:signals.settled,handContextId:'round'})}));
vi.mock('@/components/ThreeFiveSevenProofCardsAnimation',()=>({ThreeFiveSevenProofCardsAnimation:(props:any)=>{signals.proof=props;return null;}}));
vi.mock('@/components/SweepTheLegsAnimation',()=>({SweepTheLegsAnimation:(props:any)=>{signals.sweep=props;return null;}}));
vi.mock('@/lib/threeFiveSeven/runtimeDiag',()=>({emit357RuntimeDiag:vi.fn()}));
import {ThreeFiveSevenTerminalController} from './ThreeFiveSevenTerminalController';
import type {Terminal357Descriptor} from '@/lib/threeFiveSeven/terminalDescriptor';
const descriptor:Terminal357Descriptor={
 gameId:'game',dealerGameId:'dealer',roundId:'round',handNumber:3,handContextId:'round',
 terminalResultIdentity:'357_SWEEP:winner:24',terminalGenerationId:'generation',
 source:'instant-357',winnerId:'winner',winnerName:'Winner',winnerPosition:2,targetLegs:null,
 proofCards:[{rank:'3',suit:'♠'},{rank:'5',suit:'♥'},{rank:'7',suit:'♦'}],
 hadAuthoritativeLegs:true,
};
afterEach(()=>{cleanup();signals.settled=false;signals.proof=null;signals.sweep=null;});
describe('instant 357 terminal sequencing',()=>{
 it.each(['overlay','legs'])('waits for both receipts when %s finishes first',first=>{
  signals.settled=true;let legs:()=>void=()=>{};const handoff=vi.fn();
  render(<ThreeFiveSevenTerminalController descriptor={descriptor} onOwnershipChange={()=>{}} onEnterCanonical={handoff} renderSweepFlights={done=>{legs=done;return null;}}/>);
  act(()=>signals.proof.onComplete());expect(signals.sweep.show).toBe(true);expect(signals.sweep.holdUntilDismissed).toBe(true);
  act(()=>first==='overlay'?signals.sweep.onComplete():legs());expect(handoff).not.toHaveBeenCalled();
  act(()=>first==='overlay'?legs():signals.sweep.onComplete());expect(handoff).toHaveBeenCalledTimes(1);
  act(()=>{legs();signals.sweep.onComplete();});expect(handoff).toHaveBeenCalledTimes(1);
 });
 it.each([false,true])('waits for deal and proof, sweeps only funded legs=%s, hands off once',legs=>{
  const handoff=vi.fn(),ownership=vi.fn(),d={...descriptor,hadAuthoritativeLegs:legs};
  const view=render(<ThreeFiveSevenTerminalController descriptor={d} onOwnershipChange={ownership} onEnterCanonical={handoff}/>);
  expect(signals.proof.show).toBe(false);expect(signals.sweep.show).toBe(false);expect(handoff).not.toHaveBeenCalled();
  signals.settled=true;
  view.rerender(<ThreeFiveSevenTerminalController descriptor={d} onOwnershipChange={ownership} onEnterCanonical={handoff}/>);
  expect(signals.proof.show).toBe(true);expect(signals.proof.cards).toEqual(d.proofCards);
  expect(signals.proof.winnerPosition).toBe(2);expect(signals.sweep.show).toBe(false);
  act(()=>signals.proof.onComplete());
  expect(signals.sweep.show).toBe(legs);
  if(legs){expect(handoff).not.toHaveBeenCalled();act(()=>signals.sweep.onComplete());}
  expect(handoff).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({winnerId:'winner',winnerPosition:2,terminalGenerationId:'generation'}));
  act(()=>{signals.proof.onComplete();signals.sweep.onComplete();});
  expect(handoff).toHaveBeenCalledTimes(1);
  view.rerender(<ThreeFiveSevenTerminalController descriptor={null} onOwnershipChange={ownership} onEnterCanonical={handoff}/>);
  expect(ownership).toHaveBeenLastCalledWith(null);
 });
 it('leaves normal wins to the canonical normal-win owner',()=>{
  const handoff=vi.fn(),ownership=vi.fn();
  render(<ThreeFiveSevenTerminalController descriptor={{...descriptor,source:'normal-win'}} onOwnershipChange={ownership} onEnterCanonical={handoff}/>);
  expect(signals.sweep).toBeNull();expect(handoff).not.toHaveBeenCalled();
 });
});
