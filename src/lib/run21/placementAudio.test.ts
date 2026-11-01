import {describe,it,expect} from 'vitest';
import {PlacementAudio} from './placementAudio';
import {DEFAULT_CONFIG} from './model';
import type {BoardFeedbackEvent} from './exact21Feedback';
const event=(sequence:number,type='card_placed')=>({sequence,type,actorId:'player',operands:{column:2},frame:{config:DEFAULT_CONFIG,boards:{}}} as BoardFeedbackEvent);
describe('confirmed placement audio',()=>{
 it('distinguishes each new play/pass, with no mount, recovery or hidden backlog sounds',()=>{
  const p=new PlacementAudio();
  expect(p.accept('round',0,[event(1)],true)).toBeNull();
  expect(p.accept('round',0,[event(1),event(2)],true)).toEqual({key:JSON.stringify(['round','player',2]),kind:'play'});
  expect(p.accept('round',0,[event(2)],true)).toBeNull();
  expect(p.accept('round',0,[{...event(3,'pass_used'),operands:{}}],true)).toEqual({key:JSON.stringify(['round','player',3]),kind:'pass'});
  expect(p.accept('round',0,[event(3,'pass_used')],true)).toBeNull();
  expect(p.accept('round',1,[event(4)],true)).toBeNull();
  expect(p.accept('round',1,[event(5)],false)).toBeNull();
  expect(p.accept('round',1,[event(5)],true)).toBeNull();
  expect(p.accept('round',1,[event(6)],true)).not.toBeNull();
  expect(p.accept('new-round',1,[event(1)],true)).toBeNull();
 });
 it('ignores invalid placements, non-action feedback and regressive events',()=>{
  const p=new PlacementAudio();p.accept('round',0,[],true);
  expect(p.accept('round',0,[{...event(1),operands:{}}],true)).toBeNull();
  expect(p.accept('round',0,[{...event(2,'pass_used'),actorId:null}],true)).toBeNull();
  expect(p.accept('round',0,[event(3,'column_cleared')],true)).toBeNull();
  expect(p.accept('round',0,[event(2,'pass_used')],true)).toBeNull();
 });
});
