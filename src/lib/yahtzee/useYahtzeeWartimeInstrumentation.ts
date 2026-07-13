/**
 * Yahtzee wartime instrumentation hook.
 *
 * Read-only diff-based observer that emits to the Yahtzee Wartime Truth ledger
 * whenever meaningful Yahtzee state changes. Never mutates gameplay state.
 * Also owns a single rAF-coalesced DOM sampler for scatter dice + scorecard
 * DOM visibility.
 *
 * Consumers pass in the raw producer-side values already computed by
 * YahtzeeGameTable. This keeps the instrumentation surface bounded and lets
 * the ledger disappear entirely when disarmed (all record calls short-circuit).
 */

import { useEffect, useRef } from 'react';
import type { YahtzeeState } from '@/lib/yahtzeeTypes';
import {
  isYahtzeeWartimeArmed,
  recordYahtzeeContradiction,
  recordYahtzeeWartime,
  subscribeYahtzeeWartime,
} from './yahtzeeWartimeLedger';

const PRODUCER = 'YahtzeeGameTable';

export interface YahtzeeWartimeInputs {
  gameId: string | null | undefined;
  dealerGameId: string | null | undefined;
  currentRoundId: string | null | undefined;
  handNumber?: number | null;
  authoritative: YahtzeeState | null | undefined;
  viewState: YahtzeeState | null | undefined;
  gamePhase: string | null | undefined;
  activePlayerId: string | null | undefined;
  localPlayerId: string | null | undefined;
  isMyTurn: boolean;
  localRollsRemaining: number;
  scoringInProgress: boolean;
  showInteractiveScorecard: boolean;
  activeTab: string | null | undefined;
}

function useArmedTick(): number {
  const [, setTick] = useForceUpdate();
  useEffect(() => subscribeYahtzeeWartime(() => setTick()), [setTick]);
  return 0;
}

function useForceUpdate(): [number, () => void] {
  const ref = useRef(0);
  const setterRef = useRef<null | ((n: number) => void)>(null);
  // Lazy — only wire when accessed.
  const [state, setState] = require('react').useState(0) as [number, (n: number) => void];
  ref.current = state;
  setterRef.current = setState;
  const trigger = () => setterRef.current && setterRef.current(ref.current + 1);
  return [state, trigger];
}

function describeAuthDice(state: YahtzeeState | null | undefined, activePid: string | null | undefined) {
  if (!state || !activePid) return null;
  const ps = state.playerStates?.[activePid];
  if (!ps) return null;
  return {
    playerId: activePid,
    rollKey: ps.rollKey ?? null,
    rollsRemaining: ps.rollsRemaining,
    isComplete: ps.isComplete,
    dice: (ps.dice ?? []).map((d, i) => ({ i, value: d.value, held: d.isHeld })),
    scoredCount: Object.keys(ps.scorecard?.scores ?? {}).length,
  };
}

/**
 * Diff-based instrumentation. Every effect below is read-only.
 * The hook itself is a no-op unless armed — every recordYahtzeeWartime call
 * short-circuits when the ledger is disarmed.
 */
export function useYahtzeeWartimeInstrumentation(inputs: YahtzeeWartimeInputs): void {
  useArmedTick();
  const armed = isYahtzeeWartimeArmed();

  // ── Group 1: identity / lifecycle ─────────────────────────────────
  const prevIdRef = useRef({
    gameId: null as string | null | undefined,
    dealerGameId: null as string | null | undefined,
    currentRoundId: null as string | null | undefined,
    handNumber: null as number | null | undefined,
    phase: null as string | null | undefined,
    activePid: null as string | null | undefined,
    localPid: null as string | null | undefined,
    rollsRemaining: 3 as number,
    authRollKey: null as unknown,
    viewRollKey: null as unknown,
  });
  useEffect(() => {
    if (!armed) return;
    const p = prevIdRef.current;
    const auth = inputs.authoritative && inputs.activePlayerId
      ? inputs.authoritative.playerStates?.[inputs.activePlayerId]
      : null;
    const view = inputs.viewState && inputs.activePlayerId
      ? inputs.viewState.playerStates?.[inputs.activePlayerId]
      : null;

    const changed = (k: keyof typeof p, next: unknown) => p[k] !== next;

    if (changed('gameId', inputs.gameId) || changed('dealerGameId', inputs.dealerGameId) || changed('currentRoundId', inputs.currentRoundId) || changed('handNumber', inputs.handNumber ?? null)) {
      recordYahtzeeWartime('lifecycle', 'turn_identity_changed', {
        prev: { gameId: p.gameId, dealerGameId: p.dealerGameId, roundId: p.currentRoundId, handNumber: p.handNumber },
        next: { gameId: inputs.gameId ?? null, dealerGameId: inputs.dealerGameId ?? null, roundId: inputs.currentRoundId ?? null, handNumber: inputs.handNumber ?? null },
      }, { producer: PRODUCER, fn: 'useYahtzeeWartimeInstrumentation#identity' });
    }
    if (changed('phase', inputs.gamePhase ?? null)) {
      recordYahtzeeWartime('lifecycle', 'phase_changed', { prev: p.phase, next: inputs.gamePhase ?? null }, { producer: PRODUCER, fn: '#phase' });
    }
    if (changed('activePid', inputs.activePlayerId ?? null)) {
      recordYahtzeeWartime('lifecycle', 'active_player_changed', {
        prev: p.activePid, next: inputs.activePlayerId ?? null, localPid: inputs.localPlayerId ?? null,
      }, { producer: PRODUCER, fn: '#active' });
      recordYahtzeeWartime('lifecycle', 'turn_advance_observed', {
        from: p.activePid, to: inputs.activePlayerId ?? null,
      }, { producer: PRODUCER, fn: '#turnAdvance' });
    }
    if (auth && (changed('authRollKey', auth.rollKey ?? null))) {
      recordYahtzeeWartime('lifecycle', 'dice_set_identity_changed', {
        source: 'authoritative', prev: p.authRollKey, next: auth.rollKey ?? null, activePid: inputs.activePlayerId ?? null,
      }, { producer: PRODUCER, fn: '#authRollKey', key: `auth:${inputs.activePlayerId ?? ''}` });
    }
    if (view && (changed('viewRollKey', view.rollKey ?? null))) {
      recordYahtzeeWartime('lifecycle', 'dice_set_identity_changed', {
        source: 'presentation', prev: p.viewRollKey, next: view.rollKey ?? null, activePid: inputs.activePlayerId ?? null,
      }, { producer: PRODUCER, fn: '#viewRollKey', key: `view:${inputs.activePlayerId ?? ''}` });
    }
    const nextRolls = auth?.rollsRemaining ?? 3;
    if (nextRolls !== p.rollsRemaining) {
      recordYahtzeeWartime('lifecycle', 'roll_number_changed', {
        activePid: inputs.activePlayerId ?? null,
        prevRollsRemaining: p.rollsRemaining, nextRollsRemaining: nextRolls,
        prevRollNumber: 3 - p.rollsRemaining, nextRollNumber: 3 - nextRolls,
      }, { producer: PRODUCER, fn: '#rollNumber' });
    }
    prevIdRef.current = {
      gameId: inputs.gameId ?? null,
      dealerGameId: inputs.dealerGameId ?? null,
      currentRoundId: inputs.currentRoundId ?? null,
      handNumber: inputs.handNumber ?? null,
      phase: inputs.gamePhase ?? null,
      activePid: inputs.activePlayerId ?? null,
      localPid: inputs.localPlayerId ?? null,
      rollsRemaining: nextRolls,
      authRollKey: auth?.rollKey ?? null,
      viewRollKey: view?.rollKey ?? null,
    };
  });

  // ── Group 2: authoritative dice truth ────────────────────────────
  const prevAuthRef = useRef<string | null>(null);
  const prevAuthHoldRef = useRef<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const desc = describeAuthDice(inputs.authoritative, inputs.activePlayerId);
    if (!desc) return;
    const sig = JSON.stringify(desc.dice.map(d => `${d.i}:${d.value}:${d.held ? 'H' : '.'}`));
    if (sig !== prevAuthRef.current) {
      prevAuthRef.current = sig;
      recordYahtzeeWartime('auth-dice', 'authoritative_dice_changed', desc, {
        producer: PRODUCER, fn: '#authDice', key: `pid:${desc.playerId}:roll:${desc.rollKey ?? '-'}`,
      });
    }
    const holdSig = desc.dice.map(d => (d.held ? '1' : '0')).join('');
    if (holdSig !== prevAuthHoldRef.current) {
      prevAuthHoldRef.current = holdSig;
      recordYahtzeeWartime('auth-dice', 'authoritative_hold_changed', {
        playerId: desc.playerId, rollKey: desc.rollKey, held: holdSig,
      }, { producer: PRODUCER, fn: '#authHold', key: `pid:${desc.playerId}` });
    }
  });

  // ── Group 3: presentation dice truth ─────────────────────────────
  const prevPresRef = useRef<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const desc = describeAuthDice(inputs.viewState, inputs.activePlayerId);
    if (!desc) return;
    const sig = JSON.stringify(desc.dice.map(d => `${d.i}:${d.value}:${d.held ? 'H' : '.'}`));
    if (sig === prevPresRef.current) return;
    prevPresRef.current = sig;
    recordYahtzeeWartime('presentation', 'presentation_dice_resolved', {
      source: 'viewState', activePid: inputs.activePlayerId ?? null, rollKey: desc.rollKey,
      dice: desc.dice, visibleCount: desc.dice.filter(d => d.value > 0).length,
      heldCount: desc.dice.filter(d => d.held).length,
    }, { producer: PRODUCER, fn: '#presDice', key: `pid:${desc.playerId}` });

    // Contradiction: authoritative vs presentation held / value mismatch
    const auth = describeAuthDice(inputs.authoritative, inputs.activePlayerId);
    if (auth && auth.dice.length === desc.dice.length) {
      for (let i = 0; i < auth.dice.length; i++) {
        const a = auth.dice[i]; const v = desc.dice[i];
        if (a.value !== v.value && a.value !== 0 && v.value !== 0) {
          recordYahtzeeContradiction('presentation_die_not_in_authoritative_state', {
            index: i, auth: a, pres: v, activePid: inputs.activePlayerId ?? null,
          }, { producer: PRODUCER, fn: '#presVsAuth' });
        }
      }
    }
  });

  // ── Group 6: scorecard ownership ─────────────────────────────────
  const prevScorecardRef = useRef({
    expected: false,
    scoring: false,
  });
  useEffect(() => {
    if (!armed) return;
    const expected = !!inputs.showInteractiveScorecard;
    if (expected !== prevScorecardRef.current.expected) {
      recordYahtzeeWartime('scorecard', 'scorecard_expected_changed', {
        prev: prevScorecardRef.current.expected, next: expected,
        isMyTurn: inputs.isMyTurn, activeTab: inputs.activeTab ?? null,
        phase: inputs.gamePhase ?? null, activePid: inputs.activePlayerId ?? null,
        localPid: inputs.localPlayerId ?? null,
      }, { producer: PRODUCER, fn: '#scorecardExpected' });
    }
    if (inputs.scoringInProgress !== prevScorecardRef.current.scoring) {
      recordYahtzeeWartime('scorecard', inputs.scoringInProgress ? 'score_submit_started' : 'score_submit_accepted', {
        activePid: inputs.activePlayerId ?? null, localPid: inputs.localPlayerId ?? null,
      }, { producer: PRODUCER, fn: '#scoringInProgress', bypassDedupe: true });
    }
    prevScorecardRef.current = { expected, scoring: inputs.scoringInProgress };
  });

  // ── Group 7: active-pane branch summary (state-level only) ───────
  const prevPaneRef = useRef<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const branch = inputs.isMyTurn
      ? (inputs.showInteractiveScorecard ? 'self-turn:scorecard' : 'self-turn:dice-only')
      : (inputs.activePlayerId ? `opponent-turn:${inputs.activePlayerId}` : 'no-turn');
    if (branch !== prevPaneRef.current) {
      recordYahtzeeWartime('active-pane', 'active_pane_branch_changed', {
        prev: prevPaneRef.current, next: branch,
        activePid: inputs.activePlayerId ?? null, localPid: inputs.localPlayerId ?? null,
        phase: inputs.gamePhase ?? null, activeTab: inputs.activeTab ?? null,
      }, { producer: PRODUCER, fn: '#paneBranch' });
      prevPaneRef.current = branch;
    }
  });

  // ── Group 4: rAF scatter DOM sampler ─────────────────────────────
  useEffect(() => {
    if (!armed) return;
    if (typeof window === 'undefined') return;
    let cancelled = false;
    let lastSig: string | null = null;
    let lastScorecardDom = false;
    const loop = () => {
      if (cancelled) return;
      try {
        const dieNodes = Array.from(document.querySelectorAll<HTMLElement>('[data-die-idx]'));
        const sample = dieNodes.map(node => {
          const rect = node.getBoundingClientRect();
          return {
            idx: node.getAttribute('data-die-idx'),
            value: node.getAttribute('data-die-value'),
            held: node.getAttribute('data-die-held'),
            row: node.getAttribute('data-die-row'),
            layer: node.getAttribute('data-die-layer'),
            renderPath: node.getAttribute('data-die-render-path'),
            transformOwner: node.getAttribute('data-die-transform-owner'),
            reactKey: node.getAttribute('data-die-react-key'),
            slotIndex: node.getAttribute('data-die-slot-index'),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          };
        });
        const sig = JSON.stringify(sample);
        if (sig !== lastSig) {
          lastSig = sig;
          recordYahtzeeWartime('scatter', 'scatter_dom_sample', {
            count: sample.length, dice: sample, activePid: inputs.activePlayerId ?? null,
          }, { producer: PRODUCER, fn: '#rafScatter' });

          // Contradiction: same slotIndex assigned to multiple dice
          const bySlot = new Map<string, string[]>();
          for (const d of sample) {
            const s = d.slotIndex || '';
            if (!s) continue;
            const arr = bySlot.get(s) ?? [];
            arr.push(d.idx ?? '');
            bySlot.set(s, arr);
          }
          for (const [slot, idxs] of bySlot) {
            if (idxs.length > 1) {
              recordYahtzeeContradiction('multiple_dice_assigned_same_scatter_slot', {
                slot, dieIdxs: idxs,
              }, { producer: PRODUCER, fn: '#rafScatterContradiction' });
            }
          }
        }

        // Scorecard DOM presence: uses the pane-content wrapper as proxy —
        // we cannot see the scorecard subtree without a dedicated marker
        // (see instrumentation report §blind-spots).
        const paneNode = document.querySelector('[data-yahtzee-active-pane-content]');
        const scorecardVisible = !!paneNode && !!paneNode.querySelector('table, [role="table"], [data-yahtzee-scorecard]');
        if (scorecardVisible !== lastScorecardDom) {
          lastScorecardDom = scorecardVisible;
          recordYahtzeeWartime('scorecard', 'scorecard_dom_visibility_changed', {
            visible: scorecardVisible, expected: inputs.showInteractiveScorecard,
            activePid: inputs.activePlayerId ?? null, localPid: inputs.localPlayerId ?? null,
          }, { producer: PRODUCER, fn: '#rafScorecardDom' });
          if (inputs.showInteractiveScorecard && !scorecardVisible) {
            recordYahtzeeContradiction('scorecard_expected_visible_but_dom_missing', {
              activePid: inputs.activePlayerId ?? null, localPid: inputs.localPlayerId ?? null,
              phase: inputs.gamePhase ?? null,
            }, { producer: PRODUCER, fn: '#rafScorecardDom' });
          }
          if (!inputs.isMyTurn && scorecardVisible) {
            recordYahtzeeContradiction('scorecard_dom_visible_for_wrong_turn', {
              activePid: inputs.activePlayerId ?? null, localPid: inputs.localPlayerId ?? null,
            }, { producer: PRODUCER, fn: '#rafScorecardDom' });
          }
        }
      } catch {
        /* swallow — instrumentation must never throw */
      }
      window.requestAnimationFrame(loop);
    };
    const handle = window.requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(handle);
    };
    // Intentional: restart the loop whenever armed toggles or the active turn
    // identity flips, so a stale rAF closure never survives past a boundary.
  }, [armed, inputs.activePlayerId, inputs.showInteractiveScorecard, inputs.isMyTurn, inputs.gamePhase, inputs.localPlayerId]);
}
