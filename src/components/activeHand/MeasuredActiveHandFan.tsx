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
  type MutableRefObject,
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
import {
  recordThree57Geometry,
  recordThree57Lifecycle,
  type Three57LedgerIdentity,
} from '@/lib/threeFiveSeven/presentationLedger';

type PaneRect = ActiveHandStageRect;

export interface MeasuredActiveHandFanCommit {
  key: string | null;
  rect: PaneRect | null;
  lowerZoneMinPx: number;
}

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
  /**
   * Optional identity carried into 357_ACTIVE_HAND_PRESENTATION_LEDGER.
   * When absent, this component emits no 357-ledger records.
   */
  three57LedgerIdentity?: Three57LedgerIdentity;
  /** Optional persistent owner storage; preserves the committed layout across same-hand remounts. */
  externalCommitRef?: MutableRefObject<MeasuredActiveHandFanCommit>;
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
  three57LedgerIdentity,
  externalCommitRef,
}: MeasuredActiveHandFanProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const activeLockKey = phaseLockKey ?? null;
  const [rect, setRect] = useState<PaneRect | null>(() =>
    externalCommitRef?.current.key === activeLockKey ? externalCommitRef.current.rect : null,
  );
  const [lowerZoneMinPx, setLowerZoneMinPx] = useState<number>(() =>
    externalCommitRef?.current.key === activeLockKey ? externalCommitRef.current.lowerZoneMinPx : 0,
  );
  const [safeAreaBottomPx] = useState<number>(() => readSafeAreaBottomPx());
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const policy = useActiveHandLayoutPolicy(game);

  // Phase-lock commit ledger — persists across effect re-runs.
  const localCommittedRef = useRef<MeasuredActiveHandFanCommit>({
    key: null,
    rect: null,
    lowerZoneMinPx: 0,
  });
  const committedRef = externalCommitRef ?? localCommittedRef;

  // Reset commit ledger when the phase-lock key changes so a real
  // identity/phase boundary re-measures from a clean slate. Runs
  // synchronously before the measurement effect below.
  if (committedRef.current.key !== activeLockKey) {
    if (holmLedgerIdentity) {
      recordHolmLedger('ACTIVE_HAND_LAYOUT', 'phaseLockKey-reset', holmLedgerIdentity, {
        prevKey: committedRef.current.key,
        nextKey: activeLockKey,
        branch: holmLedgerIdentity.branch ?? 'MeasuredActiveHandFan',
        game,
      });
    }
    if (three57LedgerIdentity) {
      recordThree57Lifecycle('phase-lock-reset', three57LedgerIdentity, {
        prevKey: committedRef.current.key,
        nextKey: activeLockKey,
        branch: three57LedgerIdentity.branch ?? 'MeasuredActiveHandFan',
        game,
      });
    }
    committedRef.current = { key: activeLockKey, rect: null, lowerZoneMinPx: 0 };
  }

  useEffect(() => {
    const committed = committedRef.current;
    if (!activeLockKey || committed.key !== activeLockKey || !committed.rect) return;
    setRect((prev) =>
      prev &&
      Math.abs(prev.width - committed.rect!.width) < 0.5 &&
      Math.abs(prev.height - committed.rect!.height) < 0.5
        ? prev
        : committed.rect,
    );
    setLowerZoneMinPx((prev) =>
      Math.abs(prev - committed.lowerZoneMinPx) < 0.5 ? prev : committed.lowerZoneMinPx,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLockKey]);

  // ACTIVE_SELF_LIFECYCLE: mount/unmount + card identity change.
  const mountRectRef = useRef<{ w: number; h: number } | null>(null);
  const cardIdsKey = (cardIds ?? []).join(',');
  useEffect(() => {
    const host = hostRef.current;
    const r = host?.getBoundingClientRect();
    mountRectRef.current = r ? { w: r.width, h: r.height } : null;
    if (holmLedgerIdentity) {
      recordHolmLedger('ACTIVE_SELF_LIFECYCLE', 'mount', holmLedgerIdentity, {
        branch: holmLedgerIdentity.branch ?? 'MeasuredActiveHandFan',
        component: 'MeasuredActiveHandFan',
        phaseLockKey: activeLockKey,
        renderKey: activeHandFanRenderKey ?? null,
        cardCount: cards.length,
        cardIds: cardIdsKey,
        hostRect: mountRectRef.current,
        game,
      });
    }
    if (three57LedgerIdentity) {
      recordThree57Lifecycle('mount', three57LedgerIdentity, {
        branch: three57LedgerIdentity.branch ?? 'MeasuredActiveHandFan',
        component: 'MeasuredActiveHandFan',
        phaseLockKey: activeLockKey,
        renderKey: activeHandFanRenderKey ?? null,
        cardCount: cards.length,
        cardIds: cardIdsKey,
        hostRect: mountRectRef.current,
        game,
      });
    }
    return () => {
      const rr = host?.getBoundingClientRect();
      if (holmLedgerIdentity) {
        recordHolmLedger('ACTIVE_SELF_LIFECYCLE', 'unmount', holmLedgerIdentity, {
          branch: holmLedgerIdentity.branch ?? 'MeasuredActiveHandFan',
          component: 'MeasuredActiveHandFan',
          phaseLockKey: activeLockKey,
          renderKey: activeHandFanRenderKey ?? null,
          hostRectBeforeUnmount: rr ? { w: rr.width, h: rr.height } : null,
          mountRect: mountRectRef.current,
        });
      }
      if (three57LedgerIdentity) {
        recordThree57Lifecycle('unmount', three57LedgerIdentity, {
          branch: three57LedgerIdentity.branch ?? 'MeasuredActiveHandFan',
          component: 'MeasuredActiveHandFan',
          phaseLockKey: activeLockKey,
          renderKey: activeHandFanRenderKey ?? null,
          hostRectBeforeUnmount: rr ? { w: rr.width, h: rr.height } : null,
          mountRect: mountRectRef.current,
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLockKey]);

  useEffect(() => {
    if (holmLedgerIdentity) {
      recordHolmLedger('ACTIVE_SELF_LIFECYCLE', 'cardIds-change', holmLedgerIdentity, {
        branch: holmLedgerIdentity.branch ?? 'MeasuredActiveHandFan',
        cardCount: cards.length,
        cardIds: cardIdsKey,
        renderKey: activeHandFanRenderKey ?? null,
      });
    }
    if (three57LedgerIdentity) {
      recordThree57Lifecycle('render', three57LedgerIdentity, {
        branch: three57LedgerIdentity.branch ?? 'MeasuredActiveHandFan',
        reason: 'cardIds-change',
        cardCount: cards.length,
        cardIds: cardIdsKey,
        renderKey: activeHandFanRenderKey ?? null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardIdsKey]);


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
        if (holmLedgerIdentity) {
          recordHolmLedger('ACTIVE_HAND_LAYOUT', 'measure-deferred', holmLedgerIdentity, {
            reason: 'lower-zone-pending',
            zoneCount: zones.length,
            paneRect: { w, h },
            phaseLockKey: activeLockKey,
          });
        }
        if (three57LedgerIdentity) {
          recordThree57Geometry(three57LedgerIdentity, {
            event: 'commit-reject',
            branch: three57LedgerIdentity.branch ?? 'MeasuredActiveHandFan',
            sourceLabels: { reason: 'lower-zone-pending', zoneCount: zones.length },
            expectedCapacity: capacity,
            visibleCapacity: cards.length,
            claimedCapacity: (cardIds ?? []).length,
            cardWidth: null,
            cardHeight: null,
            wrapperScale: null,
            fanOverlap: null,
            fanSpread: null,
            rotationDeg: null,
            paneRect: { w, h },
            commitKind: 'sample',
            selectingFunction: 'measure/lowerZonePending',
            isPostDealBranch: false,
            legalIdentityChange: false,
          });
        }
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

      const willAccept = candidateValid && (!lockedForCurrentKey || committedInvalid);
      const acceptedNoLock = !willAccept && !activeLockKey && candidateValid;

      if (holmLedgerIdentity) {
        const reason = !candidateValid
          ? 'candidate-invalid'
          : willAccept
            ? (lockedForCurrentKey ? 'committed-invalidated' : 'first-commit')
            : (lockedForCurrentKey ? 'locked-skip' : 'no-change');
        const priorCardSize = committedLayout ? { width: committedLayout.cardWidth, height: committedLayout.cardHeight } : null;
        const nextCardSize = candidateLayout ? { width: candidateLayout.cardWidth, height: candidateLayout.cardHeight } : null;
        const sizeChangedAfterCommit = !!(
          lockedForCurrentKey && priorCardSize && nextCardSize &&
          (Math.abs(priorCardSize.width - nextCardSize.width) > 0.5 ||
            Math.abs(priorCardSize.height - nextCardSize.height) > 0.5)
        );
        recordHolmLedger('ACTIVE_HAND_LAYOUT', willAccept ? 'commit-accept' : (acceptedNoLock ? 'commit-accept-nolock' : 'commit-reject'), holmLedgerIdentity, {
          reason,
          paneRect: { w, h },
          lowerZoneMinPx: totalLowerZonePx,
          zoneCount: zones.length,
          phaseLockKey: activeLockKey,
          lockedForCurrentKey,
          candidateStageRect: candidateLayout?.stageRect ?? null,
          committedStageRect: committedLayout?.stageRect ?? null,
          candidateCardSize: nextCardSize,
          committedCardSize: priorCardSize,
          policyRevision: (policy as unknown as { revision?: number })?.revision ?? null,
          sizeChangedAfterCommit,
        });
        if (sizeChangedAfterCommit && willAccept) {
          recordHolmLedgerViolation('ACTIVE_HAND_LAYOUT', 'card-size-change-after-first-visible', holmLedgerIdentity, {
            priorCardSize,
            nextCardSize,
            paneRect: { w, h },
          });
        }
      }

      if (willAccept) {
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
      } else if (acceptedNoLock) {
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
