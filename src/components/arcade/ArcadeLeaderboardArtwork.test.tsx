// @vitest-environment jsdom
import {cleanup,render} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {ArcadeLeaderboardArtwork} from './ArcadeLeaderboardArtwork';

afterEach(cleanup);
it.each([
  ['357-drop',['3♠','5♥','7♣']],
  ['crib-lab',['6♣','7♥','7♠','8♦']],
] as const)('%s renders only its reviewed fixed decorative fan', (game,faces)=>{
  const {container}=render(<ArcadeLeaderboardArtwork game={game}/>);
  expect([...container.querySelectorAll('.meld-card > span')].map(card=>card.textContent)).toEqual(faces);
  expect(container.querySelectorAll('button,input,select,[data-card-id]')).toHaveLength(0);
});
