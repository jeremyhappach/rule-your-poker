import { describe, expect, it } from 'vitest';
import { acceptsRun21Capability } from './appTestAccess';
const user = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const ref = 'abcdefghijklmnopqrst';
const capability = { version: 1, enabled: true, fake_money_only: true, user_id: user, session_id: session, project_ref: ref };
describe('Run21 discovery admission', () => {
  it('accepts only the exact authenticated user, session and database response', () => {
    expect(acceptsRun21Capability(capability, user, session, ref)).toBe(true);
  });
  it.each([null, {}, [], { ...capability, enabled: false }, { ...capability, enabled: 'true' },
    { ...capability, version: 2 }, { ...capability, fake_money_only: false },
    { ...capability, user_id: session }, { ...capability, session_id: null },
    { ...capability, project_ref: 'another-project' },
  ])('rejects missing, stale or differently scoped capability %j', raw => {
    expect(acceptsRun21Capability(raw, user, session, ref)).toBe(false);
  });
});
