import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Participant eligibility authority', () => {
  for (const file of ['gameLogic.ts', 'holmGameLogic.ts']) {
    it(file + ' cannot revive departed participants from the browser', () => {
      const source = readFileSync(new URL('./' + file, import.meta.url), 'utf8');
      expect(source).not.toMatch(/\.from\(['"]players['"]\)\s*\.(update|insert|delete|upsert)\(/);
      expect(source).not.toMatch(/current_decision:\s*null/);
    });
  }
  it('keeps the 3-5-7 decision and continuation commands as the legal path', () => {
    const source = readFileSync(new URL('./gameLogic.ts', import.meta.url), 'utf8');
    expect(source).toContain('three_five_seven_submit_decision');
    expect(source).toContain('three_five_seven_advance_round');
    expect(source).not.toContain("rpc('advance_357_round'");
  });
});
// Actual departed/active player reset semantics are exercised under real roles
// in three_five_seven_authority_rollback_proof.sql, not simulated client writes.
