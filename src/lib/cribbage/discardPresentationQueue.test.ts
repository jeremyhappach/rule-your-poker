import { describe, expect, it } from 'vitest';
import type { CribbageDiscardIntent } from '@/components/CribbageDiscardToCribAnimation';
import { CribbageDiscardPresentationQueue } from './discardPresentationQueue';

const intent = (id: string, cardCount = 2): CribbageDiscardIntent => ({
  id,
  mode: 'opponent',
  opponentPosition: 1,
  cardCount,
  startingOrdinal: 0,
});

describe('CribbageDiscardPresentationQueue', () => {
  it('keeps both discard pairs terminal when the second arrives before the first settles', () => {
    const queue = new CribbageDiscardPresentationQueue();
    const first = intent('first-pair');
    const second = intent('second-pair');

    expect(queue.enqueue(first)).toBe(true);
    expect(queue.enqueue(second)).toBe(true);
    expect(queue.active).toEqual(first);

    expect(queue.settle(first.id)).toEqual(first);
    expect(queue.active).toEqual(second);
    expect(queue.settle(second.id)).toEqual(second);
    expect(queue.active).toBeNull();
  });

  it('ignores replayed and non-active completion ids', () => {
    const queue = new CribbageDiscardPresentationQueue();
    const first = intent('first-pair');

    expect(queue.enqueue(first)).toBe(true);
    expect(queue.enqueue(first)).toBe(false);
    expect(queue.settle('not-active')).toBeNull();
    expect(queue.active).toEqual(first);
  });
});
