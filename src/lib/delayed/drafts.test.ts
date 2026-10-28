import {describe,it,expect} from 'vitest';
import {restoreDraft,draftIdentity} from './drafts';
import type {WordsSnapshot} from '@/lib/ptownWords/model';
const view={identity:{dealerGameId:'child'},viewerId:'owner',turn:4,phase:'playing',canAct:true,board:Array(225).fill(null),rack:[{id:1,face:'?',value:0},{id:2,face:'A',value:1}]} as WordsSnapshot;
const placements=[{tileId:1,square:112,letter:'Z'}];
const saved=JSON.stringify({identity:draftIdentity(view),placements});
describe('private async drafts',()=>{
 it('restores exact authoritative identity including blank choice',()=>expect(restoreDraft(saved,view)).toEqual(placements));
 it('rejects another player, turn, changed board/rack and terminal state',()=>{
 for(const v of [{...view,viewerId:'other'},{...view,turn:5},{...view,rack:[]},{...view,board:[]},{...view,phase:'complete'},{...view,canAct:false}])expect(restoreDraft(saved,v as WordsSnapshot)).toEqual([]);
 });
 it('rejects corrupt, repeated, unowned and invalid placement data',()=>{
 for(const p of [[...placements,...placements],[{tileId:99,square:112,letter:'Z'}],[{tileId:2,square:112,letter:'Z'}],[{tileId:1,square:225,letter:'Z'}]])expect(restoreDraft(JSON.stringify({identity:draftIdentity(view),placements:p}),view)).toEqual([]);
 expect(restoreDraft('broken',view)).toEqual([]);
 });
});
