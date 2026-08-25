import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'MobileGameTable.tsx'), 'utf8');
const gateSection = source.slice(
  source.indexOf('const chuckyFlipPresentationHandContextId'),
  source.indexOf('const holmTransferPresentationContext'),
);
const schedulerSection = source.slice(
  source.indexOf('CHUCKY REVEAL SCHEDULER'),
  source.indexOf('Holm reveal-render-boundary instrumentation'),
);
const chuckyStageSection = source.slice(
  source.indexOf('/* holm.chuckyStage'),
  source.indexOf('/* WINNER-CARD PRESENTATION DISPATCHER'),
);

describe('MobileGameTable Holm Chucky flip gate', () => {
  it('keeps the configured reveal scheduler as the cadence owner', () => {
    expect(schedulerSection).toContain('getChuckyConfiguredStepperDelayMs(idx, total)');
    expect(schedulerSection).toContain("writer: 'stepper.setTimeout'");
  });

  it('holds reveal completion and cache release until the visible flip completes', () => {
    expect(gateSection).toContain('visualRevealCount >= requiredRevealCount && chuckyFlipAnimationComplete');
    expect(gateSection).toContain('!chuckyVisualRevealComplete');
    expect(gateSection).toContain('const holmWinPotTriggerIdGated = getHolmChuckyWinCelebrationTrigger({');
    expect(gateSection).toContain('soloTabledCardsLandedHand,');
    expect(gateSection).toContain('communityFullyRevealed: holmCommunityFullyRevealed');
    expect(gateSection).toContain('soloAnnouncementEmittedHand,');
    expect(gateSection).toContain('soloChuckyAdmissionHand,');
  });

  it('reports completion from only the final canonical Chucky card slot', () => {
    expect(chuckyStageSection).toContain('<HolmChuckyRevealCard');
    expect(chuckyStageSection).toContain('index === chuckyTotalForRender - 1');
    expect(chuckyStageSection).toContain('handleHolmChuckyFlipComplete(chuckyHandIdForRender)');
  });
});
