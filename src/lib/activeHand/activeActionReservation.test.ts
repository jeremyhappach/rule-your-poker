/**
 * Non-production contract tests for the canonical active-pane action
 * reservation model (Phase 1).
 *
 * Proves:
 *   1. Shared token / formula arithmetic.
 *   2. Measured escalation semantics.
 *   3. Gin Rummy parity — the shared reservation produces the SAME
 *      stage rect (card region) as the legacy measured-lower-zone path
 *      across the full realistic pane range.
 *   4. Content-following games subtract nothing.
 */
import { describe, it, expect } from 'vitest';
import {
  ACTION_ROW_HEIGHT_PX,
  ACTION_ROW_GAP_PX,
  CARDS_TO_ACTIONS_GAP_PX,
  resolveActiveActionLayout,
  resolveActiveActionReservation,
  resolveCardRegionHeightPx,
  resolveDeclaredReservationPx,
} from './activeActionReservation';
import {
  computeStageRectFromPane,
  ACTIVE_HAND_LAYOUT_GAMES,
} from './activeHandLayoutSettings';

const ginPolicy = ACTIVE_HAND_LAYOUT_GAMES.find((g) => g.game === 'ginRummy')!.defaults;

describe('shared reserved-strip tokens and formula', () => {
  it('rows = 0 reserves nothing', () => {
    expect(resolveDeclaredReservationPx({ mode: 'reserved-strip', rows: 0 })).toBe(0);
  });

  it('rows > 0 = rows·H + (rows-1)·gap + cards→actions gap', () => {
    for (const rows of [1, 2, 3] as const) {
      expect(resolveDeclaredReservationPx({ mode: 'reserved-strip', rows })).toBe(
        rows * ACTION_ROW_HEIGHT_PX + (rows - 1) * ACTION_ROW_GAP_PX + CARDS_TO_ACTIONS_GAP_PX,
      );
    }
  });

  it('measured escalation only ever raises the reservation', () => {
    const layout = { mode: 'reserved-strip', rows: 1 } as const;
    const small = resolveActiveActionReservation({ layout, measuredLowerZonePx: 20 });
    expect(small.effectiveReservationPx).toBe(44);
    expect(small.escalated).toBe(false);

    const big = resolveActiveActionReservation({
      layout,
      measuredLowerZonePx: 60,
      safeAreaBottomPx: 12,
    });
    // Measured DOM height already carries its own spacing — the
    // cards→actions token must NOT be re-added on top of it.
    expect(big.effectiveReservationPx).toBe(60 + 12);
    expect(big.escalated).toBe(true);
  });

  it('content-following subtracts nothing from the card region', () => {
    for (const game of ['yahtzee', 'horses', 'shipCaptainCrew', 'threeFiveSeven']) {
      const layout = resolveActiveActionLayout(game);
      expect(layout.mode).toBe('content-following');
      const r = resolveActiveActionReservation({ layout, measuredLowerZonePx: 90 });
      expect(r.effectiveReservationPx).toBe(0);
      expect(resolveCardRegionHeightPx(400, r)).toBe(400);
    }
  });

  it('cribbage and gin both declare a single reserved row', () => {
    expect(resolveActiveActionLayout('cribbage')).toEqual({ mode: 'reserved-strip', rows: 1 });
    expect(resolveActiveActionLayout('ginRummy')).toEqual({ mode: 'reserved-strip', rows: 1 });
  });
});

describe('Gin Rummy parity — shared reservation vs legacy measured path', () => {
  // Every Gin lower-zone state: min-h-[44px] + pb-2 = 52px floor, with
  // wrapped button rows / long informational text escalating upward.
  const measuredStates = [52, 56, 60, 64, 72, 84, 96];
  const safeAreas = [0, 12, 34];

  it('produces an identical card stage rect across every lower-zone state', () => {
    for (let paneH = 160; paneH <= 520; paneH += 4) {
      for (const measured of measuredStates) {
        for (const safe of safeAreas) {
          const legacy = computeStageRectFromPane(
            { width: 380, height: paneH },
            ginPolicy,
            { measuredLowerZoneMinPx: measured, safeAreaBottomPx: safe },
          );
          const reservation = resolveActiveActionReservation({
            layout: resolveActiveActionLayout('ginRummy'),
            measuredLowerZonePx: measured,
            safeAreaBottomPx: safe,
          });
          const next = computeStageRectFromPane(
            { width: 380, height: paneH },
            ginPolicy,
            { measuredLowerZoneMinPx: reservation.effectiveReservationPx, safeAreaBottomPx: 0 },
          );
          expect(next.stageRect.width).toBeCloseTo(legacy.stageRect.width, 6);
          expect(next.stageRect.height).toBeCloseTo(legacy.stageRect.height, 6);
          expect(next.stageTopInsetPx).toBeCloseTo(legacy.stageTopInsetPx, 6);
        }
      }
    }
  });
});

describe('Cribbage reserved-strip card region', () => {
  it('never lets the card region overlap the rendered strip', () => {
    const layout = resolveActiveActionLayout('cribbage');
    for (const measured of [0, 28, 36, 44, 58, 76]) {
      const r = resolveActiveActionReservation({ layout, measuredLowerZonePx: measured });
      const paneH = 300;
      const region = resolveCardRegionHeightPx(paneH, r);
      expect(region).toBeLessThanOrEqual(paneH - Math.max(44, measured));
      expect(region + r.effectiveReservationPx).toBeCloseTo(paneH, 6);
    }
  });

  it('holds one steady row across every active-hand phase', () => {
    const phases = ['discarding', 'pegging', 'counting'];
    const values = phases.map(
      (p) => resolveDeclaredReservationPx(resolveActiveActionLayout('cribbage', p)),
    );
    expect(new Set(values).size).toBe(1);
    expect(values[0]).toBe(44);
  });
});
