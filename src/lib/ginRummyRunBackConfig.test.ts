import { describe, expect, it } from 'vitest';

import { resolveExactGinRummyRunBackConfig } from './ginRummyRunBackConfig';

describe('resolveExactGinRummyRunBackConfig', () => {
  it('preserves every committed Gin configuration field exactly', () => {
    expect(resolveExactGinRummyRunBackConfig({
      ante_amount: 2,
      points_to_win: 50,
      per_point_value: 3,
      gin_bonus: 17,
      undercut_bonus: 21,
    })).toEqual({
      ante_amount: 2,
      points_to_win: 50,
      per_point_value: 3,
      gin_bonus: 17,
      undercut_bonus: 21,
    });
  });

  it.each(['ante_amount', 'points_to_win', 'per_point_value', 'gin_bonus', 'undercut_bonus'])(
    'rejects a previous Gin config missing %s instead of substituting a form default',
    (missingField) => {
      const config: Record<string, number> = {
        ante_amount: 2,
        points_to_win: 50,
        per_point_value: 0,
        gin_bonus: 25,
        undercut_bonus: 25,
      };
      delete config[missingField];
      expect(resolveExactGinRummyRunBackConfig(config)).toBeNull();
    },
  );

  it('rejects invalid values', () => {
    expect(resolveExactGinRummyRunBackConfig({
      ante_amount: 2,
      points_to_win: 50,
      per_point_value: -1,
      gin_bonus: 25,
      undercut_bonus: 25,
    })).toBeNull();
  });
});
