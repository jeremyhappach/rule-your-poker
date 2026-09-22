import {describe,it,expect} from 'vitest';
import {Exact21Feedback} from './exact21Feedback';
import {act,fixtureMatch,PLAYERS} from './fixtures';
import {visibleHistory} from './history';
import {legalColumns} from './rules';
const self=PLAYERS[0].id;
describe('accepted exact-21 feedback',()=>{
 it('ignores mount/history, optimism, repeated and regressive snapshots; soft 21 remains playable',()=>{
  let m=act(fixtureMatch(undefined,[{rank:'A',suit:'clubs'},{rank:'K',suit:'clubs'},{rank:'2',suit:'clubs'},{rank:'8',suit:'clubs'}]),self,{type:'ready'},0);
  const tracker=new Exact21Feedback();
  expect(tracker.accept('round1',self,visibleHistory(m,self))).toEqual({});
  m=act(m,self,{type:'place',column:0},1);
  expect(tracker.accept('round1',self,visibleHistory(m,self))).toBeNull();
  // No accepted event changes while an optimistic card is being rendered.
  expect(tracker.accept('round1',self,visibleHistory(m,self))).toBeNull();
  m=act(m,self,{type:'place',column:0},2);
  const first=tracker.accept('round1',self,visibleHistory(m,self));expect(first?.[0]).toBeGreaterThan(0);
  expect(legalColumns(m.rounds[0].boards[self],m.config)).toContain(0);
  expect(tracker.accept('round1',self,visibleHistory(m,self))).toBeNull();
  expect(tracker.accept('round1',self,visibleHistory(m,self).slice(0,2))).toBeNull();
  m=act(m,self,{type:'place',column:0},3);
  expect(tracker.accept('round1',self,visibleHistory(m,self))).toBeNull();
  m=act(m,self,{type:'place',column:0},4);
  expect(tracker.accept('round1',self,visibleHistory(m,self))?.[0]).toBeGreaterThan(first![0]);
  expect(tracker.accept('round2',self,visibleHistory(m,self))).toEqual({});
 });
 it('never celebrates Pass, other players, or a column staying at 21',()=>{
  let m=act(fixtureMatch(undefined,[{rank:'A',suit:'clubs'},{rank:'K',suit:'clubs'}]),self,{type:'ready'},0);
  const tracker=new Exact21Feedback();tracker.accept('round1',self,visibleHistory(m,self));
  m=act(m,self,{type:'pass'},1);expect(tracker.accept('round1',self,visibleHistory(m,self))).toBeNull();
  const event=visibleHistory(act(m,self,{type:'place',column:0},2),self).filter(e=>e.type==='card_placed').at(-1)!;
  event.frame.boards[self]!.columns[0]=[{rank:'A',suit:'clubs'},{rank:'K',suit:'clubs'},{rank:'10',suit:'clubs'}];
  expect(tracker.accept('round1',self,[event])).toBeNull();
  event.sequence++;event.actorId=PLAYERS[1].id;
  expect(tracker.accept('round1',self,[event])).toBeNull();
 });
});
