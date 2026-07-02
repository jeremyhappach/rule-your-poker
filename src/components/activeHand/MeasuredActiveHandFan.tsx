/**
 * Convenience wrapper around <ActiveHandFan/> that measures its own
 * host div (or an authored ancestor selector) with ResizeObserver and
 * passes the measured rect as `paneRect` — the shared resolver then
 * subtracts the resolved lower-zone reservation to derive the card
 * stage.
 *
 * Containment contract (v3):
 *   - Also measures any `[data-active-hand-lower-zone]` descendant of
 *     the measured pane and forwards its rendered height as
 *     `lowerZoneMinPx`. The resolver uses
 *     `max(authored reservation, measured + safeArea)` so the sibling
 *     instruction / action / identity zone cannot be pushed below the
 *     mobile viewport.
 *   - Resolves `env(safe-area-inset-bottom)` once via a CSS probe and
 *     forwards it as `safeAreaBottomPx`.
 *
 * Portal + phase-lock contract (v4 — 3-5-7 integration fix):
 *   - `portalTargetSelector`: when set, the fan is rendered via
 *     `createPortal` into the resolved ancestor (or, as a fallback,
 *     `document.querySelector`). This lets the fan escape any
 *     `transform:scale` / `w-auto` wrapper the surrounding UI applies
 *     for legacy hand paths (e.g. 3-5-7 wraps `PlayerHand` in a
 *     scale-[2.x] `w-auto` reserve box; the shared resolver already
 *     sizes cards from the true pane rect and must NOT re-scale). The
 *     portal target is used as the measurement target too — so `w`/`h`
 *     are read from the un-transformed pane.
 *   - `phaseLockKey`: once a nonzero pane rect is committed for a given
 *     key, subsequent measurements while the key is unchanged are
 *     IGNORED — contract 3+4 from the active-hand containment spec.
 *     Delayed action-zone availability, sibling layout thrash, or
 *     realtime observations cannot collapse or replace the committed
 *     layout. Recompute only runs when the key changes (a real active
 *     hand identity / phase boundary).
 *   - Rendering is gated on a nonzero measured rect — the fan never
 *     mounts children until it has a valid pane to size against
 *     (contract 2).
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ActiveHandFan,
  type ActiveHandFanRenderContext,
} from './ActiveHandFan';
import type { Card as CardType } from '@/lib/cardUtils';
import type { GameKey } from '@/lib/geometryLab/descriptorIndex';
import {
  resolveActiveHandFromPane,
  useActiveHandLayoutPolicy,
  type ActiveHandStageRect,
} from '@/lib/activeHand/activeHandLayoutSettings';
import {
  recordHolmLedger,
  recordHolmLedgerViolation,
} from '@/lib/holm/holmPresentationLedger';

type PaneRect = ActiveHandStageRect;

const LOWER_ZONE_SELECTOR = '[data-active-hand-lower-zone]';

let cachedSafeAreaBottomPx: number | null = null;
function readSafeAreaBottomPx(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  if (cachedSafeAreaBottomPx !== null) return cachedSafeAreaBottomPx;
  try {
    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.width = '0';
    probe.style.height = 'env(safe-area-inset-bottom, 0px)';
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    document.body.removeChild(probe);
    cachedSafeAreaBottomPx = Number.isFinite(h) ? h : 0;
  } catch {
    cachedSafeAreaBottomPx = 0;
  }
  return cachedSafeAreaBottomPx;
}

export interface MeasuredActiveHandFanProps {
  game: GameKey;
  cards: CardType[];
  capacity: number;
  /**
   * Optional CSS selector — when provided, this component walks up to
   * the nearest matching ancestor and measures that element instead of
   * its own host div. Useful when the visible card region is wrapped
   * by transform:scale wrappers whose measured rect is post-transform.
   */
  measureAncestorSelector?: string;
  /**
   * Optional CSS selector — when set, the fan renders via createPortal
   * into the nearest matching ancestor (or `document.querySelector`
   * fallback) and measurement is done on that same portal target.
   * Escapes surrounding `transform:scale` / `w-auto` wrappers.
   */
  portalTargetSelector?: string;
  /**
   * Identity/phase lock. Once a nonzero pane rect is committed for a
   * given key, subsequent measurements while the key is unchanged are
   * ignored — the committed layout survives sibling thrash, realtime
   * observations, and delayed action-zone appearance. Recompute only
   * runs on a real identity/phase change (new key).
   */
  phaseLockKey?: string;
  /** When set, overrides the ancestor measurement height. */
  overrideHeightPx?: number;
  /** When set, overrides the ancestor measurement width. */
  overrideWidthPx?: number;
  className?: string;
  style?: CSSProperties;
  applyFan?: boolean;
  renderCard?: (ctx: ActiveHandFanRenderContext) => React.ReactNode;
  dataAttribute?: string;
  activeHandFanRenderKey?: string | null;
  cardIds?: string[];
  /**
   * Optional identity carried into HOLM_PRESENTATION_LEDGER. When
   * absent, this component emits no ledger records.
   */
  holmLedgerIdentity?: {
    dealerGameId?: string | null;
    roundId?: string | null;
    handNumber?: number | null;
    handContextId?: string | null;
    playerId?: string | null;
    branch?: string;
  };
}

export function MeasuredActiveHandFan({
  game,
  cards,
  capacity,
  measureAncestorSelector,
  portalTargetSelector,
  phaseLockKey,
  overrideHeightPx,
  overrideWidthPx,
  className,
  style,
  applyFan,
  renderCard,
  dataAttribute,
  activeHandFanRenderKey,
  cardIds,
  holmLedgerIdentity,
}: MeasuredActiveHandFanProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<PaneRect | null>(null);
  const [lowerZoneMinPx, setLowerZoneMinPx] = useState<number>(0);
  const [safeAreaBottomPx] = useState<number>(() => readSafeAreaBottomPx());
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const policy = useActiveHandLayoutPolicy(game);

  // Phase-lock commit ledger — persists across effect re-runs.
  const committedRef = useRef<{
    key: string | null;
    rect: PaneRect | null;
    lowerZoneMinPx: number;
  }>({
    key: null,
    rect: null,
    lowerZoneMinPx: 0,
  });

  // Reset commit ledger when the phase-lock key changes so a real
  // identity/phase boundary re-measures from a clean slate. Runs
  // synchronously before the measurement effect below.
  const activeLockKey = phaseLockKey ?? null;
  if (committedRef.current.key !== activeLockKey) {
    committedRef.current = { key: activeLockKey, rect: null, lowerZoneMinPx: 0 };
  }

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let target: HTMLElement | null = null;
    if (portalTargetSelector) {
      target =
        (host.closest(portalTargetSelector) as HTMLElement | null) ??
        (typeof document !== 'undefined'
          ? document.querySelector<HTMLElement>(portalTargetSelector)
          : null);
    } else if (measureAncestorSelector) {
      target = host.closest(measureAncestorSelector) as HTMLElement | null;
    }
    const measureTarget: HTMLElement = target ?? host;

    // Ensure the portal target establishes a containing block for the
    // absolutely-positioned portal overlay.
    if (portalTargetSelector && target && target !== host) {
      try {
        const cs = window.getComputedStyle(target);
        if (cs.position === 'static' || !cs.position) {
          target.style.position = 'relative';
        }
      } catch {
        /* noop */
      }
      setPortalTarget(target);
    } else {
      setPortalTarget(null);
    }

    const measure = () => {
      const r = measureTarget.getBoundingClientRect();
      const w = overrideWidthPx ?? r.width;
      const h = overrideHeightPx ?? r.height;
      const isNonzero = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;

      // Sum the rendered heights of every lower-zone marker inside the
      // measured pane BEFORE committing the first visible rect. This keeps
      // the initial ActiveHandFan render from using a disposable pane-only
      // layout that later changes once actions/identity have been measured.
      const zones = measureTarget.querySelectorAll<HTMLElement>(LOWER_ZONE_SELECTOR);
      let totalLowerZonePx = 0;
      zones.forEach((zone) => {
        const zr = zone.getBoundingClientRect();
        if (Number.isFinite(zr.height) && zr.height > 0) totalLowerZonePx += zr.height;
      });

      // Guard: if lower-zone markers exist in DOM but none have laid out
      // yet (measured 0), defer committing. Committing now would resolve a
      // stageRect that ignores the pending action strip, then the next
      // observation would grow into it — the exact small→large jump we
      // must prevent. ResizeObserver / MutationObserver will re-fire once
      // the strip has real height.
      const committedNow = committedRef.current;
      const alreadyCommittedForKey =
        !!activeLockKey &&
        committedNow.key === activeLockKey &&
        !!committedNow.rect;
      if (zones.length > 0 && totalLowerZonePx <= 0 && !alreadyCommittedForKey) {
        return;
      }

      const candidateRect = isNonzero ? { width: w, height: h } : null;
      const candidateLayout = candidateRect
        ? resolveActiveHandFromPane(
            candidateRect,
            Math.max(1, capacity),
            policy,
            2 / 3,
            { measuredLowerZoneMinPx: totalLowerZonePx, safeAreaBottomPx },
          )
        : null;
      const candidateValid = !!candidateLayout;

      // Phase-lock: once a valid rect is committed for the current key,
      // ignore growth updates until the key changes. A later measurement
      // may replace the commit only if the current commit no longer fits
      // the latest protected composition budget (e.g. a real shrink), never
      // merely because a parent settles larger after cards landed.
      const committed = committedRef.current;
      const lockedForCurrentKey =
        !!activeLockKey &&
        committed.key === activeLockKey &&
        !!committed.rect;
      const committedLayout = committed.rect
        ? resolveActiveHandFromPane(
            committed.rect,
            Math.max(1, capacity),
            policy,
            2 / 3,
            { measuredLowerZoneMinPx: committed.lowerZoneMinPx, safeAreaBottomPx },
          )
        : null;
      const committedInvalid = !!(
        lockedForCurrentKey &&
        candidateLayout &&
        (!committedLayout ||
          committedLayout.stageRect.width > candidateLayout.stageRect.width + 0.5 ||
          committedLayout.stageRect.height > candidateLayout.stageRect.height + 0.5)
      );

      if (candidateValid && (!lockedForCurrentKey || committedInvalid)) {
        committedRef.current = {
          key: activeLockKey,
          rect: candidateRect,
          lowerZoneMinPx: totalLowerZonePx,
        };
        setRect((prev) =>
          prev &&
          Math.abs(prev.width - w) < 0.5 &&
          Math.abs(prev.height - h) < 0.5
            ? prev
            : { width: w, height: h },
        );
        setLowerZoneMinPx((prev) =>
          Math.abs(prev - totalLowerZonePx) < 0.5 ? prev : totalLowerZonePx,
        );
      } else if (!activeLockKey && candidateValid) {
        // No lock configured — behave as before (accept every valid rect).
        setRect((prev) =>
          prev &&
          Math.abs(prev.width - w) < 0.5 &&
          Math.abs(prev.height - h) < 0.5
            ? prev
            : { width: w, height: h },
        );
        setLowerZoneMinPx((prev) =>
          Math.abs(prev - totalLowerZonePx) < 0.5 ? prev : totalLowerZonePx,
        );
      }
    };


    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(measureTarget);
    measureTarget
      .querySelectorAll<HTMLElement>(LOWER_ZONE_SELECTOR)
      .forEach((el) => ro.observe(el));

    // Watch for lower-zone nodes appearing / disappearing so the
    // reservation stays in sync with phase-driven action visibility.
    // Under phase-lock, the resolver rejects shrinking updates.
    const mo = new MutationObserver(() => measure());
    mo.observe(measureTarget, { childList: true, subtree: true });

    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [
    measureAncestorSelector,
    portalTargetSelector,
    overrideHeightPx,
    overrideWidthPx,
    activeLockKey,
    capacity,
    policy,
    safeAreaBottomPx,
  ]);

  const paneRect = useMemo(() => {
    if (!activeLockKey) return rect;
    return committedRef.current.key === activeLockKey && committedRef.current.rect
      ? rect
      : null;
  }, [rect, activeLockKey]);
  const isReady = !!(paneRect && paneRect.width > 0 && paneRect.height > 0);

  const fan = (
    <ActiveHandFan
      game={game}
      cards={cards}
      capacity={capacity}
      paneRect={paneRect}
      lowerZoneMinPx={lowerZoneMinPx}
      safeAreaBottomPx={safeAreaBottomPx}
      applyFan={applyFan}
      renderCard={renderCard}
      dataAttribute={dataAttribute}
      activeHandFanRenderKey={activeHandFanRenderKey}
      cardIds={cardIds}
    />
  );

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
      data-measured-active-hand-fan={game}
      data-measured-active-hand-fan-locked={activeLockKey ?? undefined}
    >
      {portalTargetSelector && portalTarget
        ? isReady
          ? createPortal(
              <div
                data-measured-active-hand-fan-portal={game}
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                {fan}
              </div>,
              portalTarget,
            )
          : null
        : isReady
          ? fan
          : null}
    </div>
  );
}
