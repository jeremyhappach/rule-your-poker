import { afterEach, expect, it, vi } from 'vitest';
import { finalizeScenarioObserver } from './scenarioObserver';

afterEach(() => vi.unstubAllEnvs());

it('fails when a campaign requires its observer but none was installed', async () => {
  vi.stubEnv('PTOWN_E2E_CONTINUOUS_OBSERVER', '1');
  const result = await finalizeScenarioObserver({ chaosObserver: null } as never, {} as never);
  expect(result.failure?.message).toContain('was not installed');
});

it('does not claim observer evidence for an explicitly uninstrumented legacy scenario', async () => {
  vi.stubEnv('PTOWN_E2E_CONTINUOUS_OBSERVER', '0');
  expect(await finalizeScenarioObserver({ chaosObserver: null } as never, {} as never))
    .toEqual({ evidence: null, failure: null });
});
