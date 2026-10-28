// @vitest-environment jsdom
import React from 'react';
import {render,cleanup} from '@testing-library/react';
import {afterEach,describe,it,expect} from 'vitest';
import {PlayingCard} from './PlayingCard';
import {isResolvedJoker} from '@/lib/cardGames/physicalCard';
import {resolveCardFace} from '@/lib/cardGames/resolvedCardFace';
afterEach(cleanup);
describe('opt-in canonical Joker',()=>{
  it('never broadens the poker face validator',()=>{
    expect(resolveCardFace({kind:'joker'})).toBeNull();
    expect(isResolvedJoker({kind:'joker',masked:true})).toBe(false);
    expect(isResolvedJoker({kind:'joker',rank:'A',suit:'spades'})).toBe(false);
  });
  it('renders an explicit Joker and keeps a hidden Joker concealed',()=>{
    const {container,rerender}=render(<PlayingCard jokerFace={{kind:'joker'}} physicalId="physical-1"/>);
    expect(container.querySelector('[data-joker-face]')).not.toBeNull();
    expect(container.querySelector('[data-card-id]')?.getAttribute('data-card-id')).toBe('physical-1');
    rerender(<PlayingCard jokerFace={{kind:'joker'}} isHidden/>);
    expect(container.querySelector('[data-joker-face]')).toBeNull();
    expect(container.querySelector('[data-playing-card-hidden]')).not.toBeNull();
  });
});
