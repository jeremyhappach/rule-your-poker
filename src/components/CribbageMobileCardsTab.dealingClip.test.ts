import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./CribbageMobileCardsTab.tsx', import.meta.url), 'utf8');
const clip = src.match(/const clippedHand = \(\(\)\s*=>\s*\{[\s\S]*?\}\)\(\);/)?.[0] ?? '';
describe('Cribbage opening-deal ownership', () => {
  it('renders settled transport faces during DEALING without an action-legality gate', () => {
    expect(clip).toContain('deal.getSettledCardsForPlayer(currentPlayerId)');
    const dealing = clip.slice(clip.indexOf('const settledPayloads'));
    expect(dealing).toContain('visibleFace');
    expect(dealing).toContain('rendered.push');
    expect(dealing).not.toContain('activeHandBlocked');
  });
  it('uses identity-matched authoritative cards only for a missing settled face', () => {
    expect(clip).toContain('(authoritativeHand as CribbageCard[] | null)?.[i] ?? sourceHandInDisplayOrder[i]');
  });
  it('keeps PRE_DEAL empty and READY/GAMEPLAY under the stale-hand guard', () => {
    expect(clip).toContain("if (deal.phase === 'PRE_DEAL') return []");
    expect(clip).toContain("deal.phase === 'GAMEPLAY' || deal.phase === 'READY'");
    expect(clip).toContain('activeHandBlocked ? ([] as CribbageCard[]) : sourceHandInDisplayOrder');
  });
});
