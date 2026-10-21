import {describe,it,expect} from 'vitest';
import {acceptRacePokerSnapshot,racePokerPlayWindow,type RacePokerSnapshot} from './model';
const frame=(revision=1)=>({id:'a',revision,serverAt:10,players:[{id:'p',chips:100}],board:{phase:'playing',deadline:30000}} as RacePokerSnapshot);
describe('Race Poker client authority',()=>{
 it('rejects another game and regressive or conflicting snapshots',()=>{const a=frame(2);expect(()=>acceptRacePokerSnapshot(a,{...a,id:'b'},'a')).toThrow();expect(acceptRacePokerSnapshot(a,frame(1),'a')).toBe(a);expect(()=>acceptRacePokerSnapshot(a,{...a,round:9},'a')).toThrow('conflicting');});
 it('accepts equal progress only with semantically identical gameplay',()=>{const a=frame(),b={...a,serverAt:50};expect(acceptRacePokerSnapshot(a,b,'a')).toBe(b);});
 it('stops new input exactly at the server deadline without advancing game state',()=>{const b=frame().board;expect(racePokerPlayWindow(b,29999)).toEqual({remaining:1,playable:true});expect(racePokerPlayWindow(b,30000)).toEqual({remaining:0,playable:false});expect(racePokerPlayWindow({...b,phase:'stage_complete'},29999)).toEqual({remaining:0,playable:false});expect(b.phase).toBe('playing');});
});
