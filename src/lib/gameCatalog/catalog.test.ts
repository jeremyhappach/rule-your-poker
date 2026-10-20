// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {GAME_CATALOG,ARCADE_GAMES,findGame,eligibility,isDiscovered} from './index';
import {GAME_KEYS,enumerateAnchoredArtifacts,type GameKey} from '@/lib/geometryLab/descriptorIndex';
import fixture from '../../../dev/lobby-catalog/production-fixture.json';
import evidence from '../../../dev/lobby-catalog/admission-evidence.json';
describe('integrated catalog parity',()=>{
 it('covers exactly deployed defaults and enabled Arcade games without activating placeholders',()=>{
 expect(GAME_CATALOG.map(g=>g.defaultsKey).sort()).toEqual(fixture.defaults.map(g=>g.game_type).sort());
 expect(ARCADE_GAMES.map(g=>g.id).sort()).toEqual([...new Set(fixture.arcadeRules.filter(r=>r.enabled).map(r=>r.game))].sort());
 expect(new Set(GAME_CATALOG.map(g=>g.id)).size).toBe(GAME_CATALOG.length);
 expect(findGame('holm')?.id).toBe('holm-game');expect(findGame('357')?.defaultsKey).toBe('3-5-7');expect(findGame('six-card-golf')).toBeUndefined();
 });
 it('matches the deployed exact-two and range guards, not presentation-family guesses',()=>{
 for(const [id,rpc] of [['boxdrop','boxdrop_configure'],['trip-flip','trip_flip_configure']] as const){expect(evidence.constraints[rpc].join(' ')).toContain('<>2');expect(findGame(id)?.players).toMatchObject({min:2,max:2});}
 for(const [id,rpc] of [['tri-towers','tri_towers_configure'],['eleven-up','eleven_up_configure'],['royal-flash','royal_flash_configure'],['take-two','take_two_configure']] as const){expect(evidence.constraints[rpc].join(' ')).toContain('BETWEEN 2 AND 7');expect(findGame(id)?.players).toMatchObject({min:2,max:7});}
 expect(evidence.constraints.run21_configure.join(' ')).toContain('<>2');
 });
 it('retains only existing geometry keys with real descriptors',()=>{const keys=GAME_CATALOG.flatMap(g=>g.geometry?[g.geometry]:[]);expect(keys.sort()).toEqual([...GAME_KEYS].sort());for(const key of keys)expect(enumerateAnchoredArtifacts(key as GameKey).length).toBeGreaterThan(0);});
 it.each(GAME_CATALOG)('$id fails closed on invalid roster and unavailable capability',game=>{
 const access=Object.fromEntries(ARCADE_GAMES.map(g=>[g.id,true]));
 expect(eligibility(game,{players:0,humans:0},access)).not.toBeNull();
 expect(eligibility(game,{players:game.players.max+1,humans:2},access)).not.toBeNull();
 expect(eligibility(game,{players:game.players.min,humans:game.players.min},access)).toBeNull();
 if(game.availability!=='existing-setup'){expect(isDiscovered(game,{})).toBe(false);expect(eligibility(game,{players:2,humans:2},{})).toBe('Currently unavailable');}
 });
 it('keeps bot policy distinct from seat count and money mode',()=>{
 expect(eligibility(findGame('eleven-up')!,{players:2,humans:1},{'eleven-up':true})).toBe('Humans only');
 expect(eligibility(findGame('run21')!,{players:2,humans:1,realMoney:true},{run21:true})).toBe('Bots require fake money');
 expect(eligibility(findGame('run21')!,{players:2,humans:1,realMoney:false},{run21:true})).toBeNull();
 });
});
