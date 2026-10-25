// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {ArcadeSwitchboard} from './ArcadeSwitchboard';
import {findGame} from '@/lib/gameCatalog';
vi.mock('@/hooks/useIsAdmin',()=>({useIsAdmin:()=>({isAdmin:false})}));
vi.mock('@/lib/arcade/artwork',()=>({loadArtwork:async()=>[]}));
vi.mock('./ArcadeInfo',()=>({ArcadeArtwork:()=>null,ArcadeInfo:()=>null}));
afterEach(cleanup);
it('removes the cancelled Yahtzee placeholder while retaining every existing Arcade game and multiplayer Yahtzee',async()=>{
 const {container}=render(<MemoryRouter><ArcadeSwitchboard userId="fixture"/></MemoryRouter>);
 const links=await screen.findAllByRole('link',{name:/ leaderboard$/});
 expect(links.map(link=>link.getAttribute('href')).sort()).toEqual([
  'boxdrop','eleven-up','mega-card-golf','royal-flash','run21','take-two','tri-towers','trip-flip',
 ].map(id=>'/arcade/'+id).sort());
 expect(container.querySelectorAll('.arcade-tile')).toHaveLength(8);
 expect(screen.queryByText('Yahtzee')).toBeNull();
 expect(screen.queryByText('Coming Soon')).toBeNull();
 expect(findGame('yahtzee')).toMatchObject({modes:['multiplayer'],defaultsKey:'yahtzee',defaultsEditor:'legacy',rules:{kind:'traditional',key:'yahtzee'}});
});
