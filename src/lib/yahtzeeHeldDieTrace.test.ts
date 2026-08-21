// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { runYahtzeeHeldDiagnostic } from './yahtzeeHeldDieTrace';

describe('runYahtzeeHeldDiagnostic', () => {
  it('defers trace work until after the caller stack', async () => {
    const task = vi.fn();

    const completion = runYahtzeeHeldDiagnostic(task);

    expect(task).not.toHaveBeenCalled();
    await completion;
    expect(task).toHaveBeenCalledOnce();
  });

  it('contains synchronous diagnostic failures', async () => {
    await expect(runYahtzeeHeldDiagnostic(() => {
      throw new Error('diagnostic failed');
    })).resolves.toBeUndefined();
  });

  it('contains rejected diagnostic work', async () => {
    await expect(runYahtzeeHeldDiagnostic(async () => {
      throw new Error('async diagnostic failed');
    })).resolves.toBeUndefined();
  });
});
