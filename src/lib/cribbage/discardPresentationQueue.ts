import type { CribbageDiscardIntent } from '@/components/CribbageDiscardToCribAnimation';

/**
 * Presentation-only FIFO for discard-to-crib flights within one hand.
 *
 * Authoritative state may expose both players' discard pairs before the first
 * visual flight reaches the crib. Replacing that active flight loses its
 * terminal callback and leaves the cut-reveal gate short of the crib count.
 */
export class CribbageDiscardPresentationQueue {
  private activeIntent: CribbageDiscardIntent | null = null;
  private pending: CribbageDiscardIntent[] = [];
  private knownIntentIds = new Set<string>();

  get active(): CribbageDiscardIntent | null {
    return this.activeIntent;
  }

  enqueue(intent: CribbageDiscardIntent): boolean {
    if (this.knownIntentIds.has(intent.id)) return false;

    this.knownIntentIds.add(intent.id);
    if (!this.activeIntent) {
      this.activeIntent = intent;
      return true;
    }

    this.pending.push(intent);
    return true;
  }

  settle(intentId: string): CribbageDiscardIntent | null {
    if (this.activeIntent?.id !== intentId) return null;

    const settled = this.activeIntent;
    this.activeIntent = this.pending.shift() ?? null;
    return settled;
  }

  reset(): void {
    this.activeIntent = null;
    this.pending = [];
    this.knownIntentIds.clear();
  }
}
