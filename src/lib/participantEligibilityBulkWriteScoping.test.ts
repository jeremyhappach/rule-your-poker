// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Participant eligibility regression guard.
 *
 * Background: Stood-up players carry status='left' and must remain terminal
 * for dealer-game eligibility until they explicitly sit again. Several round /
 * dealer-game lifecycle bulk writes set status='active' on every player in a
 * game and previously had no scoping clause, which silently revived 'left' and
 * 'observer' rows back to 'active' between dealer games.
 *
 * The remaining 3-5-7 sites MUST scope their bulk writes with
 *   .neq('status', 'left').neq('status', 'observer')
 * so that:
 *   - left player survives startRound without becoming active
 *   - observer survives the same paths
 *   - active player still resets normally (current_decision / decision_locked cleared)
 *
 * Holm now delegates settlement to PostgreSQL and has no browser bulk writes.
 * Its SQL rollback proof verifies that departed players remain left.
 * This test reads the source files and asserts the scoping clauses are present
 * adjacent to each `status: 'active'` bulk write. It is intentionally a static
 * regression guard — the surrounding functions are too large to mount in a
 * focused unit test without significant mocking, and the failure mode is a
 * silent dropped `.neq(...)` call which a structural assertion catches reliably.
 */

const root = join(__dirname, '..', '..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf-8');
}

function blockAround(src: string, needle: string, span = 18): string {
  const idx = src.indexOf(needle);
  if (idx === -1) return '';
  const lines = src.split('\n');
  let lineNo = 0;
  let acc = 0;
  for (let i = 0; i < lines.length; i++) {
    if (acc + lines[i].length + 1 > idx) { lineNo = i; break; }
    acc += lines[i].length + 1;
  }
  const start = Math.max(0, lineNo - span);
  const end = Math.min(lines.length, lineNo + span);
  return lines.slice(start, end).join('\n');
}

function assertScoped(block: string, label: string) {
  expect(block, `${label}: missing scoping clauses around status:'active' bulk write`).toMatch(/\.eq\(['"]game_id['"]\s*,\s*\w+\)/);
  expect(block, `${label}: missing .neq('status','left') guard — would revive stood-up players`).toMatch(/\.neq\(\s*['"]status['"]\s*,\s*['"]left['"]\s*\)/);
  expect(block, `${label}: missing .neq('status','observer') guard — would revive pure observers`).toMatch(/\.neq\(\s*['"]status['"]\s*,\s*['"]observer['"]\s*\)/);
}

describe('Participant eligibility — bulk-write scoping', () => {
  const gameLogic = read('src/lib/gameLogic.ts');
  const holmGameLogic = read('src/lib/holmGameLogic.ts');

  it('gameLogic.startRound: per-round reset does not revive left/observer', () => {
    const block = blockAround(gameLogic, 'const { error: resetError } = await supabase');
    expect(block).toContain("status: 'active'");
    assertScoped(block, 'gameLogic.startRound');
  });

  it("gameLogic 3-5-7 everyone-folded / pussy-tax path: reset does not revive left/observer", () => {
    const block = blockAround(gameLogic, 'EVERYONE FOLDED');
    expect(block).toContain("status: 'active'");
    assertScoped(block, 'gameLogic everyone-folded pussy-tax');
  });

  it('Holm cannot reset participant eligibility from the browser', () => {
    expect(holmGameLogic).toContain("rpc('resolve_holm_showdown'");
    expect(holmGameLogic).not.toMatch(/\.(update|insert|delete|upsert)\(/);
    expect(holmGameLogic).not.toContain('settleHolmHand');
    // The real-role SQL boundary proof also asserts that a departed player
    // stays left through both winner and tie settlement.
  });

  it('remaining legacy 357 sites still reset decision state for active participants', () => {
    // Sanity: the scoping must not have accidentally removed the per-decision reset
    // payload. Active players must continue to get current_decision cleared.
    for (const needle of [
      'const { error: resetError } = await supabase',
      'EVERYONE FOLDED',
    ]) {
      const src = gameLogic;
      const block = blockAround(src, needle);
      expect(block, `${needle}: lost current_decision reset`).toMatch(/current_decision:\s*null/);
    }
  });
});
