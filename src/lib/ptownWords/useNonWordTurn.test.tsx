// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {useNonWordTurn} from './useNonWordTurn';
import type {WordsSnapshot} from './model';
const v={identity:{dealerGameId:'game'},viewerId:'me',canAct:true,finished:false,paused:false,turn:2,players:[{id:'other',name:'mcrew81'}],moves:[{turn:1,playerId:'other',action:'exchange',count:5,points:0,words:[]}]} as WordsSnapshot;
afterEach(()=>{cleanup();sessionStorage.clear();});
it('shows the actual opponent action, survives unseen reentry, and retires only after viewing',()=>{
 const first=renderHook(()=>useNonWordTurn(v,true));expect(first.result.current.notice).toBe('mcrew81 exchanged 5 tiles');first.unmount();
 const second=renderHook(()=>useNonWordTurn(v,true));expect(second.result.current.notice).toBeTruthy();act(()=>second.result.current.dismiss());expect(second.result.current.notice).toBeNull();second.unmount();
 const third=renderHook(()=>useNonWordTurn(v,true));expect(third.result.current.notice).toBeNull();
});
it('excludes inspection, holds, own turns, old turns and placements without consuming their receipt',()=>{
 for(const [snapshot,enabled] of [[v,false],[{...v,paused:true},true],[{...v,playDeadline:5000},true],[{...v,canAct:false},true],[{...v,viewerId:'other'},true],[{...v,turn:3},true],[{...v,moves:[{...v.moves[0],action:'place'}]},true]] as [WordsSnapshot,boolean][]){
  const h=renderHook(()=>useNonWordTurn(snapshot,enabled));expect(h.result.current.notice).toBeNull();h.unmount();
 }
 expect(sessionStorage.length).toBe(0);
});
it('isolates the next turn, another game and another viewer',()=>{
 const h=renderHook(({view})=>useNonWordTurn(view,true),{initialProps:{view:v}});act(()=>h.result.current.dismiss());
 for(const view of [{...v,turn:3,moves:[{...v.moves[0],turn:2}]},{...v,identity:{...v.identity,dealerGameId:'new'}},{...v,viewerId:'new-viewer'}]){
  h.rerender({view});expect(h.result.current.notice).toBeTruthy();
 }
});
