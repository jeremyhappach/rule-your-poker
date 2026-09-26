import { describe, expect, it } from 'vitest';
import { resolveAnteGameType } from './antePresentation';

describe('current dealer-game ante identity', () => {
  it.each(['farkle', '3-5-7', 'run21', 'holm-game'])('reads %s from the exact configured row', game_type => {
    expect(resolveAnteGameType('session', 'new', { id: 'new', session_id: 'session', game_type })).toBe(game_type);
  });
  it('does not reuse a previous game or another session while the current row is missing', () => {
    expect(resolveAnteGameType('session', 'new', { id: 'old', session_id: 'session', game_type: '3-5-7' })).toBeNull();
    expect(resolveAnteGameType('session', 'new', { id: 'new', session_id: 'other', game_type: 'farkle' })).toBeNull();
    expect(resolveAnteGameType('session', 'new', null)).toBeNull();
  });
});
