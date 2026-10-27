import {afterEach,describe,expect,it,vi} from 'vitest';
import {boardTapGate,playedWord,wordPresentation,wordSquares} from './presentation';
import type {WordsSnapshot} from './model';
afterEach(()=>vi.useRealTimers());
describe('board tap disambiguation',()=>{
 it('defers a single placement and cancels both taps of a double tap',()=>{vi.useFakeTimers();const single=vi.fn(),double=vi.fn(),gate=boardTapGate(single,double);gate.tap(112,100,100);vi.advanceTimersByTime(150);expect(single).not.toHaveBeenCalled();gate.tap(112,103,102);vi.advanceTimersByTime(500);expect(double).toHaveBeenCalledTimes(1);expect(single).not.toHaveBeenCalled();gate.tap(113,120,100);vi.advanceTimersByTime(301);expect(single).toHaveBeenCalledWith(113);});
 it('cancels delayed placement on pan, identity reset or disposal',()=>{vi.useFakeTimers();const single=vi.fn(),gate=boardTapGate(single,vi.fn());gate.tap(112,0,0);gate.cancel();vi.advanceTimersByTime(400);expect(single).not.toHaveBeenCalled();});
});
const view={identity:{dealerGameId:'match'},viewerId:'human',turn:2,finished:false,paused:false,moves:[{turn:1,playerId:'bot',action:'place',points:23,words:[{word:'CATS',square:112,direction:0,points:12},{word:'AT',square:98,direction:1,points:11}]}],movePresentation:{version:1,turn:1,playerId:'bot',squares:[112,113,114,115],startedAt:1000,announceAt:2240,readyAt:4190,flipMs:260,focusMs:200,noticeMs:1600}} as WordsSnapshot;
it('resumes the fixed interval without extending it on repeated snapshots or reconnect',()=>{expect(wordPresentation(view,2000)?.readyAt).toBe(4190);expect(wordPresentation({...view,revision:30},3500)?.at).toBe(3500);expect(wordPresentation(view,4190)).toBeNull();expect(wordPresentation({...view,turn:3},2000)).toBeNull();expect(wordPresentation({...view,finished:true},2000)).toBeNull();});
it('uses the authoritative total including crosses and highlights only public formed words',()=>{expect(wordPresentation(view,2300)?.move.points).toBe(23);expect(playedWord(view)?.word).toBe('CATS');expect(wordSquares(view)).toEqual([112,113,114,115,98]);});
it('freezes visual progress at the authoritative pause instant',()=>{expect(wordPresentation({...view,paused:true,pausedAt:2000},9000)?.at).toBe(2000);});
