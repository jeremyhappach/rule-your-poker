import {expect,it} from 'vitest';
import {distinctActionMatches,inviteGroups} from './inviteGroups';
it('groups only exact configurations without changing entries or their order',()=>{
 const lineup=[{key:'a',game:'run21',stake:'3',config:{version:1,rounds:3}},{key:'b',game:'run21',stake:'5',config:{version:1,rounds:3}},{key:'c',game:'run21',stake:'3',config:{rounds:3,version:1}},{key:'d',game:'run21',stake:'3',config:{version:2,rounds:3}},{key:'e',game:'boxdrop',stake:'3',config:{version:1,rounds:3}}];
 const before=structuredClone(lineup),groups=inviteGroups(lineup);expect(groups.map(g=>g.indices)).toEqual([[0,2],[1],[3],[4]]);expect(groups[0].entries[0]).toBe(lineup[0]);expect(lineup).toEqual(before);
});
it('distinguishes absent, null and explicitly frozen settings',()=>expect(inviteGroups([{key:'a',game:'run21',stake:'3'},{key:'b',game:'run21',stake:'3',config:null},{key:'c',game:'run21',stake:'3',config:{}}])).toHaveLength(3));
it('counts distinct actionable match IDs across invite, turn and result notices, excluding approvals',()=>{
 expect(distinctActionMatches([{match_id:'a',kind:'invitation',actionable:true},{match_id:'a',kind:'turn',actionable:true},{match_id:'b',kind:'results',actionable:true},{match_id:'c',kind:'settled',actionable:true},{match_id:'d',kind:'accepted',actionable:false},{match_id:null,kind:'registration',actionable:true}])).toBe(3);
});
