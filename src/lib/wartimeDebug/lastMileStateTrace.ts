/**
 * lastMileStateTrace — narrow probes for the window between a successful
 * `games.status` DB commit and the React state update that should reflect it.
 *
 * Prior probe sets confirmed:
 *   - selectDealer commits dealer_selection → game_selection successfully
 *   - post-commit microtask / setTimeout(0) / rAF all fire
 *   - DealerGameSetupInner never renders, Game.tsx never re-renders (dealer tab)
 *   - Observer tab re-renders but game state stays stale at dealer_selection
 *
 * Therefore the failure is in last-mile state propagation:
 *   DB commit → fetch / realtime payload → setGame → React state.
 *
 * Buckets:
 *   C-1: post-EXIT fetchGameData() never returns
 *   C-2: fetch returns stale row
 *   C-3: fresh row arrives but a local guard / stale-fetch suppressor drops setGame
 *   C-4: realtime games payload never arrives
 *   C-5: realtime payload arrives fresh but local guard drops setGame
 *
 * All events flow through both the Wartime ring buffer and the freeze
 * recorder so they survive a frozen UI.
 */

import { recordWartime } from './core';
import { persistFreezeEvent } from './freezeRecorder';

export type LastMileEvent =
  | 'POST_SELECT_DEALER_FETCH_BEGIN'
  | 'POST_SELECT_DEALER_FETCH_EXIT'
  | 'FETCH_GAME_DATA_BEGIN'
  | 'FETCH_GAME_DATA_SKIPPED'
  | 'FETCH_GAME_DATA_RESULT'
  | 'FETCH_GAME_DATA_HUNG'
  | 'FETCH_QUERY_BEGIN'
  | 'FETCH_QUERY_RESULT'
  | 'FETCH_QUERY_HUNG'
  | 'FETCH_QUERY_ABORTED'
  | 'REALTIME_GAMES_PAYLOAD'
  | 'REALTIME_GAMES_PAYLOAD_EVALUATION'
  | 'REALTIME_GAMES_PAYLOAD_SUPPRESSED'
  | 'REALTIME_GAMES_PAYLOAD_FORWARD'
  | 'SET_GAME_ATTEMPT'
  | 'SET_GAME_COMMIT'
  | 'SET_GAME_SUPPRESSED';

export function recordLastMile(
  event: LastMileEvent,
  payload: Record<string, unknown> = {},
): void {
  const enriched = { timestamp: new Date().toISOString(), ...payload };
  // eslint-disable-next-line no-console
  console.debug(`[LMS] ${event}`, enriched);
  recordWartime('GAMEPLAY', `lastMile.${event}`, enriched);
  persistFreezeEvent(`lms.${event}`, 'lastMileStateTrace', enriched);
}
