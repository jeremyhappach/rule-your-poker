// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { PlayingCard } from './PlayingCard';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { MiniPlayingCard } from './hand-history/MiniPlayingCard';
import { HolmLonePlayerFan } from './HolmLonePlayerFan';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('player-visible face boundaries', () => {
  it('Holm lone-player fan waits for the face before reporting landed cards', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 240, height: 80 } as DOMRect);
    const complete = vi.fn();
    const props = { isSoloPlayerWinner: false, winningPlayerIndices: [], kickerPlayerIndices: [], hasHighlights: false, isFourColor: false, getFourColorSuit: () => null, animate: false, onTabledCardsLanded: complete };
    const { container, rerender } = render(<HolmLonePlayerFan {...props} sortedCards={[{ card: { rank: '?', suit: '?' }, originalIndex: 0 }]} />);
    expect(container.textContent).toBe('');
    expect(complete).not.toHaveBeenCalled();
    rerender(<HolmLonePlayerFan {...props} sortedCards={[{ card: { rank: 'A', suit: '♠' }, originalIndex: 0 }]} />);
    expect(container.textContent).toContain('A');
    expect(complete).toHaveBeenCalledTimes(1);
  });
  for (const [name, Renderer] of Object.entries({ PlayingCard, CribbagePlayingCard, MiniPlayingCard })) {
    it.each([
      { rank: '?', suit: '?', masked: true }, { rank: '?', suit: 'spades' },
      { rank: 'A', suit: '?' }, { rank: 'A', suit: 'spades', masked: true },
      { rank: 'not-a-rank', suit: 'spades' }, {}, null,
    ])(`${name} shows a back for %j, then resolves the actual face`, card => {
      const Component = Renderer as React.ComponentType<{ card: any }>;
      const { container, rerender } = render(<Component card={card} />);
      expect(container.textContent).toBe('');
      expect(container.querySelector('[data-playing-card-face]')).toBeNull();
      rerender(<Component card={{ rank: 'Q', suit: '♥' }} />);
      expect(container.textContent).toContain('Q');
      expect(container.textContent).not.toContain('?');
    });
  }
  it('never creates an unresolved flip face', () => {
    const { container } = render(<PlayingCard card={{ rank: '?', suit: '?' } as any} showFront={false} isFlipping />);
    expect(container.textContent).toBe('');
    expect(container.querySelector('[data-playing-card-flip]')).toBeNull();
  });
});
