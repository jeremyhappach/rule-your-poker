import { describe, expect, it } from 'vitest';
import { deriveWaitingRoomStartAuthority as derive, waitingRoomStartIdentity, type WaitingStartPlayer } from './waitingRoomStartAuthority';
import databaseFixtures from '../../supabase/session-start-authority/client-fixtures.json';

const player = (id: string, position: number | null, extra: Partial<WaitingStartPlayer> = {}): WaitingStartPlayer => ({
  id, user_id: id, position, status: 'active', is_bot: false, sitting_out: false,
  waiting: false, created_at: `2026-09-29T17:01:0${id === 'a' ? 0 : 1}Z`, ...extra,
});
const idle = { status: 'waiting', current_game_uuid: null, pot: 0 };

describe('waiting eligibility identity', () => {
  const roster = [player('a', 1), player('b', 4)];
  const key = waitingRoomStartIdentity('session', 'a', roster, 'a', idle);
  it('ignores allocation, row order and unrelated presentation fields', () => {
    expect(waitingRoomStartIdentity('session', 'a', roster.map(p => ({ ...p, chips: 50, profiles: { username: 'renamed' } })).reverse(), 'a', { ...idle })).toBe(key);
  });
  it('normalizes omitted false/null boundary values', () => {
    expect(waitingRoomStartIdentity('session', 'a', roster, 'a', { ...idle, is_paused: false, pending_session_end: null, session_ended_at: null })).toBe(key);
  });
  it.each([
    { id: 'other-row' }, { user_id: 'other-user' }, { position: 7 }, { status: 'left' },
    { is_bot: true }, { sitting_out: true }, { waiting: true }, { created_at: '2026-09-29T18:00:00Z' },
  ])('includes authoritative player changes %j', changed => {
    expect(waitingRoomStartIdentity('session', 'a', [{ ...roster[0], ...changed }, roster[1]], 'a', idle)).not.toBe(key);
  });
});

describe('waiting start authority mirrors the locked server election', () => {
  it.each(databaseFixtures)('matches the SQL-proven starter after both disconnect/rejoin paths ($boundary.real_money)', fixture => {
    const result = derive(fixture.players, fixture.current_host, fixture.boundary);
    expect(result.readyToStart).toBe(true);
    expect(result.startAuthorityUserId).toBe(fixture.starter);
    expect(fixture.players.filter(p => p.user_id === result.startAuthorityUserId)).toHaveLength(1);
  });
  it('reconstructs Moma Dance: queued seated host remains the only starter', () => {
    const roster = [player('a', 4, { sitting_out: true, waiting: true }), player('b', 5, { waiting: true })];
    expect(derive(roster, 'a', idle)).toEqual({ seatedPlayerCount: 2, eligiblePlayerCount: 2, startAuthorityUserId: 'a', readyToStart: true });
    expect(derive([...roster].reverse(), 'a', idle)).toEqual(derive(roster, 'a', idle));
  });
  it('honors a transferred host ahead of join order', () => {
    expect(derive([player('a', 1), player('b', 4)], 'b', idle).startAuthorityUserId).toBe('b');
  });
  it('falls back to one eligible human when the host explicitly sits out', () => {
    const result = derive([player('a', 1, { sitting_out: true }), player('b', 4), player('c', 7)], 'a', idle);
    expect(result.startAuthorityUserId).toBe('b');
    expect(result.readyToStart).toBe(true);
    expect(result.eligiblePlayerCount).toBe(2);
  });
  it.each(['left', 'observer'])('excludes %s rows and null seats', status => {
    expect(derive([player('a', 1, { status }), player('b', null)], 'a', idle).readyToStart).toBe(false);
  });
  it('uses UUID tie-breaking and prioritizes eligible humans over bots', () => {
    const a = player('a', 1, { is_bot: true });
    const b = player('b', 4, { created_at: a.created_at });
    const c = player('c', 7, { created_at: a.created_at });
    expect(derive([c, b, a], null, idle).startAuthorityUserId).toBe('b');
    expect(derive([c, b, a].map(p => ({ ...p, is_bot: true })), null, idle).startAuthorityUserId).toBe('a');
  });
  it.each([
    { status: 'in_progress' }, { status: 'game_over' }, { status: 'ante_decision' },
    { status: 'session_ended' }, { status: 'waiting_for_players' },
    { current_game_uuid: 'unfinished-game' }, { pot: 6 }, { pot: null }, { is_paused: true },
    { pending_session_end: true }, { session_ended_at: '2026-09-29T17:00:00Z' },
  ])('does not admit a blocked boundary %j', boundary => {
    expect(derive([player('a', 1), player('b', 4)], 'a', { ...idle, ...boundary }).readyToStart).toBe(false);
  });
});
