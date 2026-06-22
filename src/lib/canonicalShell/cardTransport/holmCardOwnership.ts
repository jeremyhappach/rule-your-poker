/**
 * holmCardOwnership — WAR-TIME card presentation ownership instrumentation.
 *
 * Answers:
 *   - Who is rendering each card right now?
 *   - Is CardTransportRuntime actually mounted / used?
 *   - Are multiple components mounting the same cardId?
 *   - Are cards mounted without a registered owner?
 *
 * NO LOGIC CHANGES. Pure instrumentation.
 *
 * Globals (read from devtools):
 *   window.__holmCardOwnership          → Record<cardId, OwnerRecord[]>
 *   window.__holmTransportInventory     → { active, queued, launched, claimed, settled }
 *   window.__holmDomOwnershipScan       → DomOwnerRecord[]  (last scan)
 *   window.__holmOwnershipViolations    → Violation[]
 *
 * Helpers:
 *   registerHolmCardOwner / unregisterHolmCardOwner
 *   updateHolmTransportInventory
 *   scanHolmDomOwnership   (called on a 500ms interval by startHolmOwnershipScanner)
 */

export type HolmRendererName =
  | 'CardTransportRuntime.FlyingCard'
  | 'MobileGameTable.holmCanonicalSeat.cardBacks'
  | 'MobileGameTable.holmCanonicalSeat.cardBacks.pending'
  | 'MobileGameTable.activeSelfHand.PlayerHand'
  | 'PlayerHand'
  | 'CommunityCards'
  | 'HolmLonePlayerFan'
  | string;

export interface HolmOwnerRecord {
  cardId: string;
  renderer: HolmRendererName;
  componentName: string;
  handContextId: string | null;
  phase: string;
  renderReason: string;
  registeredAt: number;
  unregisteredAt?: number | null;
  instanceId: string;
}

export interface HolmTransportInventory {
  active: number;
  queued: number;
  launched: number;
  claimed: number;
  settled: number;
  activeIds: string[];
  queuedIds: string[];
  launchedIds: string[];
  claimedIds: string[];
  settledIds: string[];
  updatedAt: number;
}

export interface HolmDomOwnerRecord {
  cardId: string;
  renderer: string;
  domNodeId: string;
  visible: boolean;
  rect: { x: number; y: number; w: number; h: number };
}

export interface HolmOwnershipViolation {
  type: 'DUPLICATE_OWNER' | 'MISSING_OWNER' | 'UNREGISTERED_DOM_OWNER';
  cardId: string;
  owners?: string[];
  domRenderers?: string[];
  at: number;
  phase?: string;
  handContextId?: string | null;
}

type W = typeof window & {
  __holmCardOwnership?: Record<string, HolmOwnerRecord[]>;
  __holmTransportInventory?: HolmTransportInventory;
  __holmDomOwnershipScan?: HolmDomOwnerRecord[];
  __holmOwnershipViolations?: HolmOwnershipViolation[];
  __holmOwnershipScannerStarted?: boolean;
};

const VIOLATION_CAP = 200;
let instanceCounter = 0;

function reg(): Record<string, HolmOwnerRecord[]> {
  if (typeof window === 'undefined') return {};
  const w = window as W;
  if (!w.__holmCardOwnership) w.__holmCardOwnership = {};
  return w.__holmCardOwnership;
}

function violations(): HolmOwnershipViolation[] {
  if (typeof window === 'undefined') return [];
  const w = window as W;
  if (!w.__holmOwnershipViolations) w.__holmOwnershipViolations = [];
  return w.__holmOwnershipViolations;
}

function pushViolation(v: HolmOwnershipViolation): void {
  const vs = violations();
  vs.push(v);
  while (vs.length > VIOLATION_CAP) vs.shift();
}

export function registerHolmCardOwner(record: Omit<HolmOwnerRecord, 'registeredAt' | 'instanceId'>): string {
  if (typeof window === 'undefined') return '';
  const instanceId = `inst-${++instanceCounter}`;
  const full: HolmOwnerRecord = {
    ...record,
    registeredAt: performance.now(),
    instanceId,
    unregisteredAt: null,
  };
  const bag = reg();
  const list = bag[record.cardId] ?? [];
  list.push(full);
  bag[record.cardId] = list;

  const liveOwners = list.filter((r) => r.unregisteredAt == null);
  if (liveOwners.length > 1) {
    pushViolation({
      type: 'DUPLICATE_OWNER',
      cardId: record.cardId,
      owners: liveOwners.map((r) => `${r.renderer}#${r.instanceId}`),
      at: performance.now(),
      phase: record.phase,
      handContextId: record.handContextId,
    });
  }
  return instanceId;
}

export function unregisterHolmCardOwner(cardId: string, instanceId: string): void {
  if (typeof window === 'undefined') return;
  const bag = reg();
  const list = bag[cardId];
  if (!list) return;
  const idx = list.findIndex((r) => r.instanceId === instanceId);
  if (idx >= 0) list[idx].unregisteredAt = performance.now();
}

export function updateHolmTransportInventory(patch: Partial<HolmTransportInventory>): void {
  if (typeof window === 'undefined') return;
  const w = window as W;
  const prev = w.__holmTransportInventory ?? {
    active: 0, queued: 0, launched: 0, claimed: 0, settled: 0,
    activeIds: [], queuedIds: [], launchedIds: [], claimedIds: [], settledIds: [],
    updatedAt: 0,
  };
  w.__holmTransportInventory = { ...prev, ...patch, updatedAt: performance.now() };
}

export function getHolmCardOwnership(): Record<string, HolmOwnerRecord[]> {
  return reg();
}

export function getHolmOwnershipViolations(): HolmOwnershipViolation[] {
  return violations();
}

export function scanHolmDomOwnership(): HolmDomOwnerRecord[] {
  if (typeof document === 'undefined') return [];
  const out: HolmDomOwnerRecord[] = [];
  // Scan three populations:
  //  1) Stamped Holm slots / opp cardbacks (data-holm-card-id + data-holm-renderer)
  //  2) FlyingCard nodes (data-card-transport-card-id)
  //  3) PlayerHand card slots (data-pcard-card-id) inside activeSelfHand
  const nodes = document.querySelectorAll<HTMLElement>(
    '[data-holm-card-id], [data-card-transport-card-id], [data-pcard-card-id]',
  );
  nodes.forEach((el, i) => {
    const cardId =
      el.getAttribute('data-holm-card-id') ||
      el.getAttribute('data-card-transport-card-id') ||
      el.getAttribute('data-pcard-card-id') ||
      '';
    if (!cardId) return;
    const renderer =
      el.getAttribute('data-holm-renderer') ||
      (el.hasAttribute('data-card-transport-flying') ? 'CardTransportRuntime.FlyingCard' : '') ||
      el.getAttribute('data-pcard-source') ||
      'unknown';
    const r = el.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0 && (el.offsetParent !== null);
    out.push({
      cardId,
      renderer,
      domNodeId: el.id || `${el.tagName.toLowerCase()}#${i}`,
      visible,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
    });
  });

  // Aggregate by cardId for assertion sweep.
  const byCard = new Map<string, HolmDomOwnerRecord[]>();
  for (const r of out) {
    const arr = byCard.get(r.cardId) ?? [];
    arr.push(r);
    byCard.set(r.cardId, arr);
  }
  const bag = reg();
  for (const [cardId, list] of byCard.entries()) {
    const visibleOwners = list.filter((l) => l.visible);
    if (visibleOwners.length > 1) {
      pushViolation({
        type: 'DUPLICATE_OWNER',
        cardId,
        domRenderers: visibleOwners.map((l) => l.renderer),
        at: performance.now(),
      });
    }
  }
  // MISSING_OWNER: registered (live) but no DOM node.
  for (const [cardId, owners] of Object.entries(bag)) {
    const live = owners.filter((o) => o.unregisteredAt == null);
    if (live.length === 0) continue;
    const domHits = byCard.get(cardId) ?? [];
    if (domHits.length === 0) {
      pushViolation({
        type: 'MISSING_OWNER',
        cardId,
        owners: live.map((o) => o.renderer),
        at: performance.now(),
      });
    }
  }

  if (typeof window !== 'undefined') {
    (window as W).__holmDomOwnershipScan = out;
  }
  return out;
}

let scannerHandle: number | null = null;
export function startHolmOwnershipScanner(intervalMs = 500): void {
  if (typeof window === 'undefined') return;
  const w = window as W;
  if (w.__holmOwnershipScannerStarted) return;
  w.__holmOwnershipScannerStarted = true;
  scannerHandle = window.setInterval(() => {
    try { scanHolmDomOwnership(); } catch { /* */ }
  }, intervalMs);
}

export function stopHolmOwnershipScanner(): void {
  if (scannerHandle != null && typeof window !== 'undefined') {
    window.clearInterval(scannerHandle);
    scannerHandle = null;
    (window as W).__holmOwnershipScannerStarted = false;
  }
}
