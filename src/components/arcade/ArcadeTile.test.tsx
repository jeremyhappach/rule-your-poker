// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {ArcadeTile} from './ArcadeTile';
vi.mock('@/components/rules/RulesContent',()=>({RulesContent:({game}:{game:string})=><p>{game} existing rules</p>}));
vi.mock('@/lib/arcade/artwork',()=>({downloadArtwork:()=>Promise.resolve(new Blob()),validateArtwork:vi.fn(),replaceArtwork:vi.fn()}));
afterEach(cleanup);
function Location(){return <output data-testid="location">{useLocation().pathname}</output>;}
it('opens accessible rules without navigating, then launches through the original leaderboard link',()=>{
  render(<MemoryRouter initialEntries={['/arcade']}><ArcadeTile game="run21" name="Run21"/><Location/></MemoryRouter>);
  const info=screen.getByRole('button',{name:'Run21 rules and info'});
  expect(info.closest('a')).toBeNull();
  fireEvent.click(info);
  expect(screen.getByRole('dialog').textContent).toContain('run21 existing rules');
  expect(screen.getByTestId('location').textContent).toBe('/arcade');
  fireEvent.click(screen.getByRole('button',{name:'Close'}));
  fireEvent.click(screen.getByRole('link',{name:'Run21 leaderboard'}));
  expect(screen.getByTestId('location').textContent).toBe('/arcade/run21');
});
it('supersedes old artwork while allowing subsequent admin replacements',()=>{
  const row={game:'run21' as const,object_path:'run21/old.png',updated_at:'2026-10-20T00:00:00Z'};
  const {container,rerender}=render(<MemoryRouter><ArcadeTile game="run21" name="Run21" artwork={row}/></MemoryRouter>);
  expect(container.querySelector('.arcade-banner-art')?.getAttribute('src')).toContain('approved-v1/run21');
  rerender(<MemoryRouter><ArcadeTile game="run21" name="Run21" artwork={{...row,object_path:null,updated_at:'2026-11-02T00:00:00Z'}}/></MemoryRouter>);
  expect(container.querySelector('.arcade-banner-art')).not.toBeNull();
  rerender(<MemoryRouter><ArcadeTile game="run21" name="Run21" artwork={{...row,updated_at:'2026-11-02T00:00:00Z'}}/></MemoryRouter>);
  expect(container.querySelector('.arcade-banner-art')).toBeNull();
  expect(screen.getByRole('heading',{name:'Run21'})).toBeTruthy();
});
