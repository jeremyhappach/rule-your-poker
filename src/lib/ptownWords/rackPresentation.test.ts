import {expect,it} from 'vitest';
import {invalidWordMessage,isInvalidWord,reorderRack} from './rackPresentation';
it('reorders exact tile IDs without mutating the rack or conflating repeated letters/blanks',()=>{
 const ids=[1,2,3,4,5,6,7];
 expect(reorderRack(ids,1,3)).toEqual([2,3,4,1,5,6,7]);
 expect(reorderRack(ids,7,0)).toEqual([7,1,2,3,4,5,6]);
 expect(reorderRack(ids,4,999)).toEqual([1,2,3,5,6,7,4]);
 expect(reorderRack(ids,99,0)).toEqual(ids);expect(ids).toEqual([1,2,3,4,5,6,7]);
});
it('names all authoritative invalid words and does not label structural errors as dictionary failures',()=>{
 expect(invalidWordMessage('ptown_words:invalid_word:QWERTY')).toBe('Invalid word: QWERTY');
 expect(invalidWordMessage('ptown_words:invalid_word:QWERTY,ZXCV,QWERTY')).toBe('Invalid words: QWERTY, ZXCV');
 for(const error of ['ptown_words:gap','ptown_words:disconnected','ptown_words:one_line','Connection uncertain.']){
  expect(isInvalidWord(error)).toBe(false);expect(invalidWordMessage(error)).toBe('');
 }
});
