// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {ArcadeSwitchboard} from './ArcadeSwitchboard';
import {findGame} from '@/lib/gameCatalog';
vi.mock('@/hooks/useIsAdmin',()=>({useIsAdmin:()=>({isAdmin:false})}));
vi.mock('@/lib/arcade/artwork',()=>({loadArtwork:async()=>[]}));
vi.mock('@/lib/arcade/lobbyLayoutClient',()=>({loadLobbyLayout:async()=>({revision:0,layout:{originals:['horses-blitz','357-drop','crib-lab','chucky-showdown'],other:['run21','tri-towers','eleven-up','boxdrop','trip-flip','take-two','royal-flash','mega-card-golf','quintzee']}})}));
vi.mock('./ArcadeInfo',()=>({ArcadeArtwork:()=>null,ArcadeInfo:()=>null}));
afterEach(cleanup);
it('removes the cancelled Yahtzee placeholder while retaining every existing Arcade game and multiplayer Yahtzee',async()=>{
 const {container}=render(<MemoryRouter><ArcadeSwitchboard userId="fixture"/></MemoryRouter>);
 const links=await screen.findAllByRole('link',{name:/ leaderboard$/});
 expect(links.map(link=>link.getAttribute('href')).sort()).toEqual([
  'horses-blitz','357-drop','crib-lab','chucky-showdown','quintzee','boxdrop','eleven-up','mega-card-golf','royal-flash','run21','take-two','tri-towers','trip-flip','river-city-run','ship-cap-voyage',
 ].map(id=>'/arcade/'+id).sort());
 expect(container.querySelectorAll('.arcade-tile')).toHaveLength(15);
 expect(within(screen.getByRole('region',{name:'P-Town Originals'})).getAllByRole('link').map(link=>link.getAttribute('href'))).toEqual(['horses-blitz','357-drop','crib-lab','chucky-showdown','river-city-run','ship-cap-voyage'].map(id=>'/arcade/'+id));
 expect(screen.getAllByRole('region').map(region=>region.getAttribute('aria-labelledby'))).toEqual(['arcade-section-originals','arcade-section-other']);
 expect(screen.queryByText('Yahtzee')).toBeNull();
 expect(screen.queryByText('Coming Soon')).toBeNull();
 expect(findGame('yahtzee')).toMatchObject({modes:['multiplayer'],defaultsKey:'yahtzee',defaultsEditor:'legacy',rules:{kind:'traditional',key:'yahtzee'}});
});
