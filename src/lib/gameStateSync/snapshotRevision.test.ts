import { describe, expect, it } from 'vitest';
import { snapshotRevisionRejection } from './snapshotRevision';
import { jsonEqual } from './stateProgress';

describe('snapshot revision admission', () => {
  const current = { _authorityScope: 'round-a', _authorityRevision: 10, deadline: 'new' };
  it('rejects an older response even when its gameplay progress appears ahead', () => {
    expect(snapshotRevisionRejection(current, { ...current, _authorityRevision: 9 }, 1)).toBe('regressive_revision');
  });
  it('admits changed equal-progress metadata only with a later revision in the same identity', () => {
    expect(snapshotRevisionRejection(current, { ...current, _authorityRevision: 11 }, 0)).toBeNull();
    expect(snapshotRevisionRejection(current, { ...current, deadline: 'old' }, 0)).toBe('conflicting_equal_progress');
    expect(snapshotRevisionRejection(current, { ...current, _authorityScope: 'round-b' }, 0)).toBe('conflicting_equal_progress');
    expect(snapshotRevisionRejection({}, { deadline: 'old' }, 0)).toBe('conflicting_equal_progress');
  });
  it('compares JSON content independently of property order while retaining ordered arrays', () => {
    expect(jsonEqual({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });
});
