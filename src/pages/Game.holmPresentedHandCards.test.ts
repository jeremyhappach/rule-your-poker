import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const gameSource = readFileSync(join(__dirname, 'Game.tsx'), 'utf8');
const mobileTableSource = readFileSync(
  join(__dirname, '..', 'components', 'MobileGameTable.tsx'),
  'utf8',
);

const holmRoundSelection = gameSource.slice(
  gameSource.indexOf('// HOLM HARD GATE: round selection is scoped to the active'),
  gameSource.indexOf("} else if (gameData.current_round && gameData.current_game_uuid"),
);

describe('Game Holm presented-hand card ownership', () => {
  it('loads the published predecessor hand instead of a newer prepared successor', () => {
    expect(holmRoundSelection).toContain("timedQuery('rounds.holm-presented'");
    expect(holmRoundSelection).toContain(".eq('dealer_game_id', gameData.current_game_uuid)");
    expect(holmRoundSelection).toContain(".eq('hand_number', gameData.total_hands)");
    expect(holmRoundSelection).toContain(".eq('round_number', gameData.current_round)");
    expect(holmRoundSelection).not.toContain(".order('hand_number'");
    expect(holmRoundSelection).not.toContain("timedQuery('rounds.holm-latest'");
  });

  it('fails closed when the published hand identity is incomplete', () => {
    expect(holmRoundSelection).toContain('holm_branch_skipped_no_published_hand');
    expect(holmRoundSelection).toContain("skipReason: 'missing-published-hand-identity'");
    expect(holmRoundSelection).toContain('setPlayerCards([])');
  });

  it('preserves one canonical card surface per Holm presentation mode', () => {
    const multiSeatSection = mobileTableSource.slice(
      mobileTableSource.indexOf('const allowSelfRenderForShowdown ='),
      mobileTableSource.indexOf('/**\n   * Wave 3C.4'),
    );
    expect(multiSeatSection).toContain('isHolmMultiPlayerShowdown');
    expect(multiSeatSection).toContain('<CanonicalSeatCluster');
    expect(multiSeatSection).toContain('allowSelfRender={allowSelfRenderForShowdown}');

    const soloTabledStart = mobileTableSource.indexOf('holm.lonePlayerTabledCardsStage');
    const soloTabledSection = mobileTableSource.slice(
      soloTabledStart,
      mobileTableSource.indexOf('holm.communityCardsStage', soloTabledStart),
    );
    expect(soloTabledSection).toContain('artifactId="holm.lonePlayerTabledCardsStage"');
    expect(soloTabledSection).toContain('root="TABLED_SELF"');
    expect(soloTabledSection).toContain('<HolmLonePlayerFan');

    const privateSelfSection = mobileTableSource.slice(
      mobileTableSource.indexOf('{isCurrentPlayerSoloVsChucky || ('),
      mobileTableSource.indexOf('// SHOW-CARDS SINGLE-LOCATION CONTRACT'),
    );
    expect(privateSelfSection).toContain('isCurrentPlayerSoloVsChucky');
    expect(privateSelfSection).toContain('isHolmMultiPlayerShowdown');
    expect(privateSelfSection).toContain('Cards on the felt');
  });
});
