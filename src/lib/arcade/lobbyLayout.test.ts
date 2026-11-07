import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {ARCADE_GAMES} from '@/lib/gameCatalog';
import {completeLayout,visibleSections,moveGame,parseLayout,type ArcadeLayout} from './lobbyLayout';
const seed:ArcadeLayout = {
  originals:['horses-blitz','357-drop','crib-lab','chucky-showdown'],
  other:['run21','tri-towers','eleven-up','boxdrop','trip-flip','take-two','royal-flash','mega-card-golf','quintzee'],
};
describe('Arcade layout',()=>{
  it('seeds existing designations and preserves current relative order within each section',()=>{
    expect(ARCADE_GAMES.filter(g=>g.arcadeSection==='originals').map(g=>g.id)).toEqual([...seed.originals,'ship-cap-voyage']);
    expect(ARCADE_GAMES.filter(g=>g.arcadeSection!=='originals').map(g=>g.id)).toEqual(seed.other);
    const migration=readFileSync('supabase/migrations/20261107220812_arcade_lobby_ordering.sql','utf8');
    const stored=JSON.parse(migration.match(/'({"originals":[\s\S]*?})'/)![1]);
    expect(stored).toEqual(seed);
    expect(completeLayout(seed,ARCADE_GAMES)).toEqual({...seed,originals:[...seed.originals,'ship-cap-voyage']});
  });
  it('does not expose hidden, removed or multiplayer-only placements',()=>{
    const layout={originals:['yahtzee','hidden','crib-lab'],other:['run21']};
    const visible=ARCADE_GAMES.filter(g=>['run21','crib-lab'].includes(g.id));
    expect(visibleSections(layout,visible).map(s=>s.games.map(g=>g.id))).toEqual([['crib-lab'],['run21']]);
    expect(completeLayout(layout,visible).originals).toEqual(layout.originals);
  });
  it('appends new games to their defaults in stable key order after saved placements',()=>{
    const games=[{id:'z',arcadeSection:'originals' as const},{id:'a',arcadeSection:'originals' as const},{id:'new'}];
    expect(completeLayout(seed,games)).toEqual({...seed,originals:[...seed.originals,'a','z'],other:[...seed.other,'new']});
    expect(completeLayout(seed,[...games].reverse())).toEqual(completeLayout(seed,games));
  });
  it('moves between sections and within a section without changing hidden positions',()=>{
    const moved=moveGame(seed,'run21','originals');
    expect(moved.originals).toEqual([...seed.originals,'run21']);
    expect(moved.other).toEqual(seed.other.slice(1));
    expect(moveGame(moved,'run21','originals','horses-blitz').originals).toEqual(['run21',...seed.originals]);
    expect(seed.originals).not.toContain('run21');
  });
  it('allows empty sections and rejects duplicate or malformed placements',()=>{
    expect(parseLayout({originals:[],other:[]})).toEqual({originals:[],other:[]});
    for(const value of [null,{}, {originals:['x'],other:['x']},{originals:[],other:[1]},{originals:[],other:[],extra:[]}])
      expect(()=>parseLayout(value)).toThrow();
  });
});
