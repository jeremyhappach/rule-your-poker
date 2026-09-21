import { farkleTestState } from './__fixtures__/testState';
import type { FarkleEndgame } from './types';

/** Local browser qualification only. Production builds cannot admit TEST ONLY setup. */
export function isFarkleLocalQualification(environment: {
  DEV?: boolean; VITE_FARKLE_LOCAL_QUALIFICATION?: string; VITE_SUPABASE_URL?: string;
}, hostname: string): boolean {
  if (!environment.DEV || environment.VITE_FARKLE_LOCAL_QUALIFICATION !== '1') return false;
  try {
    const api = new URL(environment.VITE_SUPABASE_URL ?? '');
    return ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
      && ['localhost', '127.0.0.1', '[::1]'].includes(api.hostname);
  } catch { return false; }
}

export function farkleLocalSetup(stake: string, target: string, endgame: FarkleEndgame) {
  const ante = Number(stake), score = Number(target);
  if (!Number.isSafeInteger(ante) || ante < 1 || !Number.isSafeInteger(score) || score < 1) {
    throw new Error('Enter a positive whole-number stake and target score.');
  }
  const { rules, botPolicy, botBankThreshold, turnSeconds, botDelayMs } = farkleTestState().config;
  return { ante_amount: ante, targetScore: score, endgame, testConfiguration: {
    testOnly: true, label: 'TEST ONLY: isolated Wave 2 browser qualification',
    rules, botPolicy, botBankThreshold, turnSeconds, botDelayMs,
  } };
}
