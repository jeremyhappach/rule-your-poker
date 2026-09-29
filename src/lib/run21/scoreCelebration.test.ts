import {describe,it,expect} from 'vitest';
import {ScoreCelebrations} from './scoreCelebration';
import {act,fixtureMatch,PLAYERS} from './fixtures';
import {project} from './engine';
import {visibleHistory} from './history';
import type {Run21Snapshot} from './localClient';

function snapshot(score=105,sequence=20):Run21Snapshot{
  let match=fixtureMatch();match=act(match,PLAYERS[0].id,{type:'ready'},0);match=act(match,PLAYERS[0].id,{type:'collect'},1);
  const view=project(match,PLAYERS[0].id),event=visibleHistory(match,PLAYERS[0].id).find(e=>e.type==='score_presentation_started')!;
  // Presentation input boundary fixture, never used by gameplay.
  view.boards[PLAYERS[0].id]!.result={...view.boards[PLAYERS[0].id]!.result!,aggregate:score,score:1000};
  return {view,revision:sequence,serverAt:10,balances:{},finished:false,eventSequence:sequence,events:[{...event,sequence,frame:view}]};
}
function baseline(p:ScoreCelebrations){const first=snapshot(103,1);first.events=[];p.accept(first,true);}
describe('receipt-bound special score presentation',()=>{
  it.each([104,105])('holds %i before normal scoring without mutating authoritative data',score=>{
    const p=new ScoreCelebrations();baseline(p);const s=snapshot(score),copy=structuredClone(s);p.accept(s);
    const key=p.receipt!.key;expect(p.receipt?.aggregate).toBe(score);
    expect(p.frame(s,9000,100).now).toBe(s.view.scorePresentation!.startedAt);
    p.retire(key,100);expect(p.receipt).toBeNull();
    expect(p.frame(s,9000,600).now).toBe(s.view.scorePresentation!.startedAt+500);
    expect(p.frame(s,9000,5100)).toEqual({snapshot:s,now:9000});expect(p.pending).toBe(false);expect(s).toEqual(copy);
  });
  it('does not replay mounted, reconnected or duplicate receipts',()=>{
    const p=new ScoreCelebrations(),s=snapshot();p.accept(s);expect(p.receipt).toBeNull();
    p.accept(s);expect(p.receipt).toBeNull();p.accept(snapshot(104,30),true);expect(p.receipt).toBeNull();
    p.accept(snapshot(105,31));expect(p.receipt).not.toBeNull();const key=p.receipt!.key;
    p.accept(snapshot(105,31),true);expect(p.receipt!.key).toBe(key);
  });
  it('rejects stale retirement across newer receipts and identity resets',()=>{
    const p=new ScoreCelebrations();baseline(p);const s=snapshot();p.accept(s);const old=p.receipt!.key;
    p.accept(snapshot(104,30));p.retire(old,0);p.frame(s,9000,5000);const current=p.receipt!.key;
    p.retire(old,5100);expect(p.receipt!.key).toBe(current);
    const other=snapshot(104,40);other.view.identity={...other.view.identity,handNumber:2};p.accept(other);
    expect(p.receipt).toBeNull();expect(p.pending).toBe(false);
  });
  it('keeps the accepted board until the local count-up finishes while authority advances to another round',()=>{
    const p=new ScoreCelebrations();baseline(p);const receipt=snapshot();p.accept(receipt);
    const current=structuredClone(receipt);current.events=[];current.eventSequence=40;
    current.view.roundId='00000000-0000-4000-8000-000000000099';current.view.scorePresentation=null;
    p.accept(current);expect(p.frame(current,12000,100).snapshot.view.roundId).toBe(receipt.view.roundId);
    p.retire(p.receipt!.key,100);expect(p.frame(current,17000,5099).snapshot.view.scorePresentation).toEqual(receipt.view.scorePresentation);
    expect(p.frame(current,17001,5100).snapshot).toBe(current);
  });
  it.each([0,97,103,106])('leaves ordinary aggregate %i unchanged',score=>{
    const p=new ScoreCelebrations();baseline(p);const s=snapshot(score);p.accept(s);expect(p.receipt).toBeNull();expect(p.frame(s,400,40)).toEqual({snapshot:s,now:400});
  });
  it('does not celebrate a timeout or other zero award',()=>{
    const p=new ScoreCelebrations();baseline(p);const s=snapshot();s.view.boards[PLAYERS[0].id]!.result!.score=0;p.accept(s);expect(p.receipt).toBeNull();
  });
});
