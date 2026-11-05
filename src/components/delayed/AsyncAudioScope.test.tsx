// @vitest-environment jsdom
import {StrictMode, useState, useSyncExternalStore} from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter, Link, Outlet, Route, Routes} from 'react-router-dom';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {AudioManager} from '@/lib/audio/audioManager';
import {audioHarness} from '@/lib/audio/audioTestHarness';
import {GameplaySoundButton} from '@/components/GameplaySoundButton';
import {TriTowersBoard} from '@/components/triTowers/TriTowersBoard';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import rules from '@/lib/triTowers/rules-v2.json';
import {AsyncAudioScope} from './AsyncAudioScope';
import {ReviewGate} from './ResultReview';

const fixture = vi.hoisted(() => ({manager: null as unknown as AudioManager, rpc: vi.fn()}));
vi.mock('@/lib/audio/platformAudio', () => ({get platformAudio() {return fixture.manager;}}));
vi.mock('@/hooks/useSoundPreference', () => ({useSoundPreference: () => useSyncExternalStore(fixture.manager.subscribe, fixture.manager.getSnapshot)}));
vi.mock('@/lib/delayed/client', () => ({delayedRpc: fixture.rpc}));
vi.mock('@/integrations/supabase/client', () => ({supabase: {channel: () => {
  const channel = {on: () => channel, subscribe: () => channel}; return channel;
}, removeChannel: vi.fn()}}));
vi.mock('canvas-confetti', () => ({default: vi.fn()}));

let harness: ReturnType<typeof audioHarness>, contexts: ReturnType<typeof audioHarness>['ctx'][];
let trusted = false, releaseCheck: () => void;
const home: any = {id: 'match', status: 'active', organizer: 'me', opponent: 'other', players: [{id: 'me', name: 'Me'}, {id: 'other', name: 'Other'}], lineup: [{id: 'child', game: 'tri-towers', stake: 5, ordinal: 1, terminal: false}]};
const flush = () => act(async () => {await Promise.resolve(); await Promise.resolve();});
const advance = (ms: number) => act(async () => {await vi.advanceTimersByTimeAsync(ms);});
const oscillators = () => harness.nodes.filter(n => n.kind === 'oscillator');
function OwnTurn() {
  const [now] = useState(() => Date.now());
  return <><GameplaySoundButton/><h1>Own turn</h1><TriTowersBoard userId="user" roundKey="own-round" liveEntry canAct onIntent={() => {}} now={now} result={null}
    view={{rules: {...rules, version: 'tri-towers/5', roundIntroMs: 2500}, phase: 'intro', cards: Array.from({length: 28}, (_, i) => i < 18 ? null : i), removed: [], waste: 3, stockRemaining: 17, run: 0, highRun: 0, deadline: now + 2500}}/></>;
}
function CheckedTurn() {
  const [checked, setChecked] = useState(false);
  releaseCheck = () => setChecked(true);
  return checked ? <ReviewGate home={home} matchId="match" childId="child" userId="me">{() => <OwnTurn/>}</ReviewGate> : <p>Checking release</p>;
}
function mount(retain = true) {
  return render(<StrictMode><TooltipProvider><ResponsiveGeometryProvider><MemoryRouter initialEntries={['/delayed/match']}>
    <Link to="/">Leave Async</Link><Routes><Route path="/" element={<h1>Lobby</h1>}/>
      <Route element={retain ? <AsyncAudioScope/> : <Outlet/>}>
        <Route path="/delayed/match" element={<><GameplaySoundButton/><Link to="/delayed/match/play/child">Take turn</Link></>}/>
        <Route path="/delayed/match/play/child" element={<CheckedTurn/>}/>
      </Route>
    </Routes></MemoryRouter></ResponsiveGeometryProvider></TooltipProvider></StrictMode>);
}
async function enter() {
  // jsdom cannot generate a native trusted event. Model the synchronous capture
  // unlock explicitly; the browser proof uses actual trusted pointer events.
  await act(async () => {trusted = true; fixture.manager.unlock(true); trusted = false; fireEvent.click(screen.getByText('Take turn'));});
  await flush();
}
async function finishReview() {
  await act(async () => releaseCheck()); await flush();
  expect(screen.getByText("Showing Other's results")).toBeTruthy();
  await advance(13100); expect(screen.getByText('Your turn!')).toBeTruthy();
  await advance(2100); expect(screen.getByText('Own turn')).toBeTruthy();
}
beforeEach(async () => {
  vi.useFakeTimers(); sessionStorage.clear(); contexts = [];
  Object.defineProperty(document, 'hidden', {configurable: true, value: false});
  Object.defineProperty(navigator, 'onLine', {configurable: true, value: true});
  window.matchMedia = vi.fn().mockReturnValue({matches: false, addEventListener() {}, removeEventListener() {}});
  global.ResizeObserver = class {observe() {} disconnect() {} unobserve() {}} as any;
  harness = audioHarness(); fixture.manager = harness.manager;
  harness.env.now = () => performance.now();
  // Separate native context per creation, requiring a gesture for every resume.
  harness.env.createContext = () => {
    const ctx = Object.assign(new EventTarget(), harness.ctx, {state: 'suspended', currentTime: 0,
      resume: vi.fn(() => {
        if (!trusted) return new Promise<void>(() => {});
        ctx.state = 'running'; ctx.currentTime = 10; ctx.dispatchEvent(new Event('statechange')); return Promise.resolve();
      }), close: vi.fn(async () => {ctx.state = 'closed';})});
    contexts.push(ctx); return ctx as unknown as AudioContext;
  };
  harness.env.savePreference = async () => {};
  await flush();
  const reviews: any = {events: [{id: 'review', kind: 'attempt', actor: 'other', round: 1, score: 100, receipt: {game: 'tri-towers'}, board: null, seen: false}], terminal: false, actor: 'me', segment: 2, revision: 2, started: false, expiresAt: new Date(Date.now() + 3600000).toISOString(), serverAt: Date.now()};
  fixture.rpc.mockReset(); fixture.rpc.mockImplementation(async (name: string) => {
    if (name === 'delayed_reviews') return structuredClone(reviews);
    if (name === 'delayed_review_begin') return {elapsed: 0, seen: false};
    if (name === 'delayed_review_ack') reviews.events[0].seen = true;
  });
});
afterEach(() => {cleanup(); harness.dispose(); vi.restoreAllMocks(); vi.useRealTimers();});

it('retains the gesture-unlocked engine through release checking, opponent review and own intro once', async () => {
  mount(); await enter(); const original = contexts[0];
  await advance(1000); expect(original.close).not.toHaveBeenCalled();
  await finishReview();
  expect(contexts).toHaveLength(1); expect(original.state).toBe('running');
  expect(oscillators()).toHaveLength(8); // One two-strike bell, even in StrictMode.
  await advance(3000); expect(oscillators()).toHaveLength(8);
  fireEvent.click(screen.getByText('Leave Async')); await flush(); expect(original.close).toHaveBeenCalledOnce();
});

it('reproduces the old missing bell without the route owner and never replays it on a late tap', async () => {
  mount(false); await enter(); expect(contexts[0].close).toHaveBeenCalledOnce();
  await finishReview(); expect(contexts).toHaveLength(2); expect(contexts[1].state).toBe('suspended'); expect(oscillators()).toHaveLength(0);
  await advance(3000); await act(async () => {trusted = true; fixture.manager.unlock(true); trusted = false;});
  expect(contexts[1].state).toBe('running'); expect(oscillators()).toHaveLength(0);
});

it('mute during review closes immediately despite the retained owner and suppresses the intro', async () => {
  mount(); await enter();
  const saving = fixture.manager.savePreference('user', false); expect(contexts[0].close).toHaveBeenCalledOnce();
  await act(async () => saving); await finishReview(); expect(oscillators()).toHaveLength(0);
  await advance(3000); await act(async () => {trusted = true; await fixture.manager.savePreference('user', true); trusted = false;});
  expect(oscillators()).toHaveLength(0);
});

it('leaving during the release check releases the last owner without creating a turn or sound', async () => {
  mount(); await enter(); fireEvent.click(screen.getByText('Leave Async')); await flush();
  expect(contexts[0].close).toHaveBeenCalledOnce(); expect(fixture.rpc).not.toHaveBeenCalled(); expect(oscillators()).toHaveLength(0);
});

it('backgrounding still retires the retained engine immediately', async () => {
  mount(); await enter();
  await act(async () => {Object.defineProperty(document, 'hidden', {configurable: true, value: true}); document.dispatchEvent(new Event('visibilitychange'));});
  expect(contexts[0].close).toHaveBeenCalledOnce(); expect(oscillators()).toHaveLength(0);
});
