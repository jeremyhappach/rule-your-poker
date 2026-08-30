/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import { isGoRaceTraceEnabled } from './cribbageGoRaceTrace';

describe('Cribbage Go-race trace activation', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    window.localStorage.clear();
  });

  it('is off for ordinary production play', () => {
    expect(isGoRaceTraceEnabled()).toBe(false);
  });

  it('retains explicit forensic activation', () => {
    window.history.replaceState({}, '', '/?cribbage_go_trace=1');
    expect(isGoRaceTraceEnabled()).toBe(true);

    window.history.replaceState({}, '', '/');
    window.localStorage.setItem('ptp_debug', 'cribbage-go');
    expect(isGoRaceTraceEnabled()).toBe(true);
  });

  it('lets an explicit URL disable override stored activation', () => {
    window.localStorage.setItem('ptp_cribbage_go_trace', '1');
    window.history.replaceState({}, '', '/?cribbage_go_trace=0');
    expect(isGoRaceTraceEnabled()).toBe(false);
  });
});
