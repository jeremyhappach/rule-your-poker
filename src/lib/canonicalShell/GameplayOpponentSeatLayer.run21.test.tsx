// @vitest-environment jsdom
import {cleanup, render} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
const cluster = vi.hoisted(() => vi.fn());
vi.mock('./CanonicalSeatCluster', () => ({CanonicalSeatCluster: (props: unknown) => {cluster(props); return null;}}));
vi.mock('./SeatAnchorLayer', () => ({useSeatAnchorsOptional: () => ({byPosition: new Map([[2, {slot: 1}]])})}));
vi.mock('./PreSessionSeatLayer', () => ({usePreSessionSeatOwned: () => false}));
vi.mock('./ActivePlayerHUD', () => ({ActivePlayerHUD: () => null}));
vi.mock('@/components/AutoRollIndicator', () => ({AutoRollIndicator: () => null}));
vi.mock('@/components/canonicalShell/CanonicalCardBack', () => ({CanonicalCardBack: () => null}));
import {GameplayOpponentSeatLayer} from './GameplayOpponentSeatLayer';
afterEach(() => {cleanup(); cluster.mockClear();});
const participants = [{id: 'player', name: 'Player', position: 2, chips: 50}];
it('passes the isolated authoritative balance without enrolling it in the session money cursor', () => {
  render(<GameplayOpponentSeatLayer family="run21" participants={participants} presentation={{isolatedBalance: () => 5}}/>);
  expect(cluster.mock.calls.at(-1)?.[0]).toMatchObject({chipValue: '$5', chipAmount: undefined, playerId: 'player'});
});
it.each(['gin-rummy', 'cribbage', 'yahtzee'] as const)('preserves %s money cursor inputs', family => {
  render(<GameplayOpponentSeatLayer family={family} participants={participants}/>);
  expect(cluster.mock.calls.at(-1)?.[0]).toMatchObject({chipValue: '$50', chipAmount: 50, playerId: 'player'});
});
