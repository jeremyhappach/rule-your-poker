// @vitest-environment jsdom
import {act, cleanup, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {useRun21PlacementAudio} from './useRun21PlacementAudio';
import {audioHarness} from '@/lib/audio/audioTestHarness';
import {approvedSound} from '@/lib/audio/approvedSounds';
import {loadAuditionedFixtures} from '@/lib/audio/approvedSounds.fixture';
import {DEFAULT_CONFIG} from '@/lib/run21/model';
import type {BoardFeedbackEvent} from '@/lib/run21/exact21Feedback';

const audio = vi.hoisted(() => ({follow: vi.fn()}));
vi.mock('@/lib/audio/platformAudio', () => ({platformAudio: audio}));
let h: ReturnType<typeof audioHarness>;
const event = (sequence: number, type = 'card_placed') => ({sequence, type, actorId: 'player',
  operands: type === 'card_placed' ? {column: 2} : {}, frame: {config: DEFAULT_CONFIG, boards: {}}} as BoardFeedbackEvent);
const base = {scope: 'round', epoch: 0, enabled: true, events: [] as BoardFeedbackEvent[]};
const render = () => renderHook(p => useRun21PlacementAudio('user', p.scope, p.events, p.epoch, p.enabled), {initialProps: base});

beforeEach(async () => {
  await loadAuditionedFixtures(); vi.useFakeTimers(); sessionStorage.clear(); vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  h = audioHarness(); audio.follow.mockImplementation(e => h.manager.follow(e));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
});
afterEach(() => {cleanup(); h.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); audio.follow.mockReset();});

it('uses the approved shared pair once per confirmed play/pass and lets the full cues finish', () => {
  const ui = render(); expect(h.starts()).toHaveLength(0);
  ui.rerender({...base, events: [event(1)]});
  expect(audio.follow.mock.lastCall?.[0].cueAt(0, 205)).toBe(approvedSound('slide'));
  const play = h.nodes.find(n => n.kind === 'buffer')!;
  act(() => vi.advanceTimersByTime(190));
  expect(play.stop).toHaveBeenCalledTimes(1); // Scheduled source end only, no old 100 ms truncation.
  ui.rerender({...base, events: [event(1), event(2, 'pass_used')]});
  expect(audio.follow.mock.lastCall?.[0].cueAt(0, 165)).toBe(approvedSound('flip'));
  expect(h.starts()).toHaveLength(2);
  ui.rerender({...base, events: [event(1), event(2, 'pass_used')]}); expect(h.starts()).toHaveLength(2);
  act(() => vi.advanceTimersByTime(50)); expect(play.stop).toHaveBeenCalledTimes(2);
});

it('does not catch up muted actions and allows the next pass after unmute', () => {
  const ui = render(); h.manager.setPreference('user', false);
  ui.rerender({...base, events: [event(1, 'pass_used')]});
  h.manager.setPreference('user', true); expect(h.starts()).toHaveLength(0);
  ui.rerender({...base, events: [event(2, 'pass_used')]}); expect(h.starts()).toHaveLength(1);
});

it('discards an action whose audio context unlocks more than 25 ms late', () => {
  const ui = render(); h.state('suspended');
  ui.rerender({...base, events: [event(1)]});
  act(() => vi.advanceTimersByTime(30)); h.state('running'); expect(h.starts()).toHaveLength(0);
});

it('silently baselines recovered/offline events and cancels active sources on a round change', async () => {
  const ui = render(); ui.rerender({...base, events: [event(1)]});
  const play = h.nodes.find(n => n.kind === 'buffer')!;
  ui.rerender({...base, scope: 'next-round', events: [event(2, 'pass_used')]});
  await act(async () => {vi.runAllTicks();});
  expect(play.stop).toHaveBeenCalledTimes(1); expect(h.starts()).toHaveLength(1);
  act(() => window.dispatchEvent(new Event('offline')));
  ui.rerender({...base, scope: 'next-round', epoch: 1, events: [event(3)]});
  expect(h.starts()).toHaveLength(1);
});
