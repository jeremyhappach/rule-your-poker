import { describe, expect, it } from 'vitest';

import {
  assertHumanChaosRuntimeTarget,
  HUMAN_CHAOS_PRODUCTION_BASE_URL,
  HUMAN_CHAOS_PRODUCTION_SUPABASE_PROJECT_REF,
  resolveHumanChaosTarget,
} from './target';

describe('human-chaos production target', () => {
  it('defaults to the deployed production frontend and owned backend', () => {
    expect(resolveHumanChaosTarget({})).toEqual({
      baseUrl: HUMAN_CHAOS_PRODUCTION_BASE_URL,
      supabaseProjectRef: HUMAN_CHAOS_PRODUCTION_SUPABASE_PROJECT_REF,
    });
  });

  it('rejects a local frontend and a non-production backend override', () => {
    expect(() => resolveHumanChaosTarget({ PTOWN_E2E_BASE_URL: 'http://127.0.0.1:4173' }))
      .toThrow('HTTPS deployed frontend');
    expect(() => resolveHumanChaosTarget({ PTOWN_E2E_EXPECTED_SUPABASE_PROJECT_REF: 'ehccrxumpibuoehfsmms' }))
      .toThrow('owned production Supabase project');
  });

  it('rejects a runtime project that differs from the configured target', () => {
    expect(() => assertHumanChaosRuntimeTarget('https://ehccrxumpibuoehfsmms.supabase.co', {}))
      .toThrow('Human-chaos target mismatch');
  });
});
