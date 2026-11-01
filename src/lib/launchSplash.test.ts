import { describe, expect, it } from 'vitest';
import { eligibleLaunch, type LaunchEvidence } from './launchSplash';

const home: LaunchEvidence = { standalone: true, pathname: '/', search: '', hash: '',
  navigationType: 'navigate', discarded: false, visible: true };
describe('fresh Home Screen launch admission', () => {
  it.each(['', '?launch=home'])('accepts existing and updated Home Screen URLs: %s', search => {
    expect(eligibleLaunch({ ...home, search })).toBe(true);
  });
  it.each([
    { standalone: false }, { search: '?launch=home&match=123' }, { search: '?invite=123' },
    { hash: '#invite' }, { navigationType: 'reload' }, { navigationType: 'back_forward' },
    { navigationType: undefined }, { discarded: true }, { visible: false },
    { pathname: '/delayed/match' }, { pathname: '/delayed/match/play/round' },
    { pathname: '/notifications/table/session' }, { pathname: '/game/session' },
    { pathname: '/arcade/run21/run/run' }, { pathname: '/auth' }, { search: '?sessions=completed' },
  ])('skips resumed/routed entries: %j', change => {
    expect(eligibleLaunch({ ...home, ...change })).toBe(false);
  });
});
