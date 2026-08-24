import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_REAL_MONEY_GAME_TYPES,
  CANONICAL_SESSION_LIVENESS_PHASES,
  REAL_MONEY_GAME_LIVENESS_CONTRACT,
} from './realMoneyLivenessContract';

const repoFile = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('real-money liveness contract', () => {
  it('covers all seven dealer game types exactly once', () => {
    expect([...ALL_REAL_MONEY_GAME_TYPES].sort()).toEqual([
      '3-5-7', 'cribbage', 'gin-rummy', 'holm-game', 'horses',
      'ship-captain-crew', 'yahtzee',
    ]);
    for (const gameType of ALL_REAL_MONEY_GAME_TYPES) {
      expect(REAL_MONEY_GAME_LIVENESS_CONTRACT[gameType].length).toBeGreaterThan(0);
    }
  });

  it('keeps human-untimed exemptions limited to Gin and Cribbage', () => {
    const exemptGames = ALL_REAL_MONEY_GAME_TYPES.filter((gameType) =>
      REAL_MONEY_GAME_LIVENESS_CONTRACT[gameType]
        .some((phase) => phase.deadlinePolicy === 'human_untimed_exempt'));
    expect(exemptGames.sort()).toEqual(['cribbage', 'gin-rummy']);
  });

  it('requires a database timer kind for every other deadline-owned phase', () => {
    const phases = [
      ...CANONICAL_SESSION_LIVENESS_PHASES,
      ...ALL_REAL_MONEY_GAME_TYPES.flatMap((gameType) =>
        REAL_MONEY_GAME_LIVENESS_CONTRACT[gameType]),
    ];
    for (const phase of phases) {
      if (phase.deadlinePolicy === 'database' && phase.phase !== 'bot/scoring/complete') {
        expect(phase.timerKinds.length, phase.phase).toBeGreaterThan(0);
      }
    }
  });

  it('wires the admission gate, scheduler heartbeat, and redacted health RPC', () => {
    const migration = repoFile(
      'supabase/migrations/20260823235121_real_money_liveness_contract.sql',
    );
    expect(migration).toContain('last_completed_at = clock_timestamp()');
    expect(migration).toContain('enforce_real_money_liveness_admission');
    expect(migration).toContain('get_real_money_liveness_health');
    expect(migration).toContain("interval '10 seconds'");
    expect(migration).toContain('coalesce(v_game.is_paused, false)');
    expect(migration).toContain("'phase', timer.phase");
    expect(migration).not.toContain('timer.phase_key');
    expect(repoFile(
      'supabase/migrations/20260824000455_fix_real_money_liveness_phase_column.sql',
    )).toContain("replace(v_definition, 'timer.phase_key', 'timer.phase')");
  });

  it('wires every declared human action surface to the shared guard', () => {
    const source = [
      'src/components/MobileGameTable.tsx',
      'src/components/HorsesMobileCardsTab.tsx',
      'src/components/YahtzeeGameTable.tsx',
      'src/components/CribbageMobileCardsTab.tsx',
      'src/components/GinRummyMobileCardsTab.tsx',
    ].map(repoFile).join('\n');
    for (const surface of [
      'holm-357-decision', 'horses-scc-turn', 'yahtzee-turn',
      'cribbage-human-turn', 'gin-human-turn',
    ]) {
      expect(source).toContain(surface);
    }
    expect(source.match(/useAuthoritativeActionSurfaceGuard\(/g)?.length).toBe(5);
  });
});
