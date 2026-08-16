import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'MobileGameTable.tsx'), 'utf8');
const chuckyFaceSection = source.slice(
  source.indexOf('function MeasuredHolmChuckyCardFace'),
  source.indexOf('/**\n * CommunityStageHolmSwitch'),
);
const chuckyStageSection = source.slice(
  source.indexOf('/* holm.chuckyStage'),
  source.indexOf('/* WINNER-CARD PRESENTATION DISPATCHER'),
);

describe('Holm Chucky canonical face sizing', () => {
  it('measures the percentage-sized Chucky card box on layout changes', () => {
    expect(chuckyFaceSection).toContain('node.getBoundingClientRect().width');
    expect(chuckyFaceSection).toContain('new ResizeObserver(measure)');
    expect(chuckyFaceSection).toContain("style={{ width: '100%', height: '100%' }}");
  });

  it('passes the measured width to the canonical PlayingCard face resolver', () => {
    expect(chuckyStageSection).toContain('<MeasuredHolmChuckyCardFace>');
    expect(chuckyStageSection).toContain('faceFillPx={faceFillPx}');
    expect(chuckyStageSection).toContain('style={{ width: \'100%\', height: \'100%\' }}');
  });
});
