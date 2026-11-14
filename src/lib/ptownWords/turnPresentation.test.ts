import {expect,it} from 'vitest';
import {lastTurn,nonWordTurn,turnLabel,type WordsMove} from './turnPresentation';
import type {WordsSnapshot} from './model';
const word:WordsMove={turn:1,playerId:'other',action:'place',words:[{word:'CAT',points:10}],points:10,count:3};
it.each([
 ['pass',undefined,0,'PASS','passed'],
 ['pass','timeout',0,'TIMED OUT','timed out'],
 ['timeout',undefined,0,'TIMED OUT','timed out'],
 ['exchange',undefined,4,'EXCHANGED 4','exchanged 4 tiles'],
 ['exchange',undefined,1,'EXCHANGED 1','exchanged 1 tile'],
] as const)('labels recorded %s / %s without using an earlier word', (action,reason,count,label,description)=>{
 const move={...word,turn:2,action,reason,count,words:[]};
 expect(nonWordTurn(move)).toEqual({label,description});
 expect(lastTurn({moves:[word,move]} as WordsSnapshot,'other')).toBe(`Last: ${label}`);
});
it('never infers a pass or timeout from an empty word or zero score',()=>{
 expect(nonWordTurn({...word,words:[],points:0})).toBeNull();
 expect(turnLabel({...word,action:'unknown',words:[]})).toBe('UNKNOWN');
 expect(lastTurn({moves:[{...word,points:0}]} as WordsSnapshot,'other')).toBe('Last: CAT (0)');
});
