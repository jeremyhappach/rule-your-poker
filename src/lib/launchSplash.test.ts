import { describe, expect, it } from 'vitest';
import { eligibleLaunch, type LaunchEvidence } from './launchSplash';

const home: LaunchEvidence = { standalone: true, pathname: '/', search: '?launch=home', hash: '',
  navigationType: 'navigate', restored: false, visible: true, elapsed: 250 };
describe('fresh Home Screen launch admission', () => {
  it('admits an identified, visible, fresh standalone lobby launch', () => {
    expect(eligibleLaunch(home)).toBe(true);
  });
  it.each([
    { standalone: false }, { search: '' }, { search: '?launch=home&match=123' },
    { hash: '#invite' }, { navigationType: 'reload' }, { navigationType: 'back_forward' },
    { navigationType: undefined }, { restored: true }, { visible: false }, { elapsed: 2000 },
    { pathname: '/delayed/match' }, { pathname: '/delayed/match/play/round' },
    { pathname: '/notifications/table/session' }, { pathname: '/game/session' },
    { pathname: '/arcade/run21/run/run' }, { pathname: '/auth' }, { search: '?sessions=completed' },
  ])('skips ambiguous, resumed, slow and routed entries: %j', change => {
    expect(eligibleLaunch({ ...home, ...change })).toBe(false);
  });
});
