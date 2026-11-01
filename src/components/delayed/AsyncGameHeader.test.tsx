// @vitest-environment jsdom
import {afterEach,it,expect} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {AsyncGameHeader} from './AsyncGameHeader';
import {ASYNC_GAME_BRANDING} from '@/lib/delayed/gameBranding';
import {findGame} from '@/lib/gameCatalog';
afterEach(cleanup);
it('keeps a semantic title and live stake across image loading and failure',()=>{
  const {container,rerender}=render(<AsyncGameHeader game="run21" name="Run 21" ordinal={2} stake={1}/>);
  const image=container.querySelector('.async-brand-logo')!;
  expect(screen.getByRole('heading',{name:/Run 21/})).toBeTruthy();
  expect(screen.getByText('$1')).toBeTruthy();
  expect(container.querySelector('[data-loaded]')).toBeNull();
  fireEvent.load(image);expect(container.querySelector('[data-loaded]')).not.toBeNull();
  fireEvent.error(image);expect(container.querySelector('[data-loaded]')).toBeNull();
  rerender(<AsyncGameHeader game="run21" name="Run 21" ordinal={2} stake={12.5}/>);
  expect(screen.getByText('$12.5')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();expect(screen.queryByRole('link')).toBeNull();
});
it('resets image state when a different canonical game is rendered',()=>{
  const {container,rerender}=render(<AsyncGameHeader game="run21" name="Run 21" ordinal={1} stake={5}/>);
  fireEvent.load(container.querySelector('.async-brand-logo')!);
  rerender(<AsyncGameHeader game="tri-towers" name="Tri Towers" ordinal={1} stake={5}/>);
  expect(container.querySelector('[data-loaded]')).toBeNull();
  expect(screen.getByRole('heading',{name:/Tri Towers/})).toBeTruthy();
});
it('uses native Words tiles and readable fallback for a game without branding',()=>{
  const {container,rerender}=render(<AsyncGameHeader game="ptown-words" name="Ptown Words" ordinal={1} stake={5}/>);
  expect(screen.getByRole('heading',{name:/Ptown Words/}).getAttribute('aria-label')).toBeNull();
  expect(container.querySelector('.async-brand-letters')?.getAttribute('aria-hidden')).toBe('true');
  rerender(<AsyncGameHeader game="future-game" name="Future Game" ordinal={6} stake={7}/>);
  expect(screen.getByRole('heading',{name:/Future Game/})).toBeTruthy();
  expect(container.querySelector('img')).toBeNull();
});
it('prepares only the ten requested canonical branding identities',()=>{
  expect(Object.keys(ASYNC_GAME_BRANDING)).toEqual(['ptown-words','run21','tri-towers','quintzee','boxdrop','take-two','royal-flash','mega-card-golf','trip-flip','eleven-up']);
  for(const id of Object.keys(ASYNC_GAME_BRANDING))expect(findGame(id)?.id).toBe(id);
});
it('uses the canonical catalog title for a prepared future game without changing admission',()=>{
  render(<AsyncGameHeader game="royal-flash" name="royal-flash" ordinal={6} stake={5}/>);
  expect(screen.getByRole('heading',{name:/Royal Flash/})).toBeTruthy();
});
