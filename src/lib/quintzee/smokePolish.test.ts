import {describe,it,expect} from 'vitest';
import {QUINTZEE_CATEGORIES,quintzeeNeedsZeroConfirmation,quintzeeRoundLabel,type QuintzeeBoard} from './model';
const board=(scores:QuintzeeBoard['scores']={}):QuintzeeBoard=>({phase:'playing',dice:[2,2,3,4,5],scores,potentials:{}} as QuintzeeBoard);
describe('private zero confirmation policy',()=>{
 it('asks only for a zero with another open positive-scoring option',()=>{expect(quintzeeNeedsZeroConfirmation(board(),'ones')).toBe(true);expect(quintzeeNeedsZeroConfirmation(board(),'twos')).toBe(false);});
 it('does not treat filled positive categories as alternatives',()=>{const scores=Object.fromEntries(QUINTZEE_CATEGORIES.filter(c=>!['ones','sixes','yahtzee'].includes(c)).map(c=>[c,0]));expect(quintzeeNeedsZeroConfirmation(board(scores),'ones')).toBe(false);});
 it('does not ask when the only remaining category scores zero',()=>{const scores=Object.fromEntries(QUINTZEE_CATEGORIES.filter(c=>c!=='ones').map(c=>[c,0]));expect(quintzeeNeedsZeroConfirmation(board(scores),'ones')).toBe(false);});
 it('uses canonical dice scoring rather than prospective display data',()=>{expect(quintzeeNeedsZeroConfirmation({...board(),potentials:{ones:99}},'ones')).toBe(true);expect(quintzeeNeedsZeroConfirmation({...board(),dice:[]},'ones')).toBe(false);});
 it('does not select filled categories or ready boards',()=>{expect(quintzeeNeedsZeroConfirmation(board({ones:0}),'ones')).toBe(false);expect(quintzeeNeedsZeroConfirmation({...board(),phase:'ready'},'ones')).toBe(false);});
});
it('labels only authoritative expiry as Time’s Up',()=>{expect(quintzeeRoundLabel('timeout')).toBe("Time's Up");expect(quintzeeRoundLabel('all_categories')).toBe('Round Complete');expect(quintzeeRoundLabel('no_matches')).toBe('No more matches');});
