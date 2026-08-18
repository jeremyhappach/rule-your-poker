import { describe, expect, it } from 'vitest';
import { sanitizeWartimeUuid } from './sinkIdentity';

describe('3-5-7 wartime sink identities', () => {
  it('keeps canonical UUIDs', () => {
    expect(sanitizeWartimeUuid('9158e531-69fc-4e54-a45a-d20a72417ffc'))
      .toBe('9158e531-69fc-4e54-a45a-d20a72417ffc');
  });

  it('nulls the pregame round-number placeholder instead of retrying a 400 forever', () => {
    expect(sanitizeWartimeUuid('0')).toBeNull();
    expect(sanitizeWartimeUuid(undefined)).toBeNull();
  });
});
