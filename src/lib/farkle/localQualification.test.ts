import { describe, expect, it } from 'vitest';
import { farkleLocalSetup, isFarkleLocalQualification } from './localQualification';

describe('isolated Farkle setup admission', () => {
  const local = { DEV: true, VITE_FARKLE_LOCAL_QUALIFICATION: '1', VITE_SUPABASE_URL: 'http://127.0.0.1:57321' };
  it('requires development opt-in and both client and database on loopback', () => {
    expect(isFarkleLocalQualification(local, 'localhost')).toBe(true);
    expect(isFarkleLocalQualification({ ...local, DEV: false }, 'localhost')).toBe(false);
    expect(isFarkleLocalQualification({ ...local, VITE_FARKLE_LOCAL_QUALIFICATION: undefined }, 'localhost')).toBe(false);
    expect(isFarkleLocalQualification({ ...local, VITE_SUPABASE_URL: 'https://example.supabase.co' }, 'localhost')).toBe(false);
    expect(isFarkleLocalQualification(local, 'poker.example.com')).toBe(false);
    expect(isFarkleLocalQualification({ ...local, VITE_SUPABASE_URL: 'invalid' }, 'localhost')).toBe(false);
  });
  it('sends only compact setup plus explicitly labeled test configuration', () => {
    const setup = farkleLocalSetup('2', '1000', 'equal_turns');
    expect(setup).toMatchObject({ ante_amount: 2, targetScore: 1000, endgame: 'equal_turns', testConfiguration: { testOnly: true, botPolicy: 'balanced' } });
    expect(setup.testConfiguration.label).toMatch(/^TEST ONLY:/);
    for (const value of ['0', '-1', '1.5', 'NaN', '']) expect(() => farkleLocalSetup(value, '1000', 'immediate')).toThrow();
  });
});
