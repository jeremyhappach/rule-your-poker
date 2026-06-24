/**
 * DEBUG PILLS STORE
 *
 * Decouples per-pill UI visibility from the harness/instrumentation layer.
 *
 * Harnesses (assertions, lifecycle tracing, telemetry) continue to run
 * whenever Global Debug Mode is enabled. This store controls ONLY which
 * pill viewers actually render inside the DebugTray.
 *
 * Defaults: every pill OFF. Admins opt into the specific instrumentation
 * they want surfaced via Admin → Settings → Debug Tools.
 *
 * Persistence: localStorage (per-device). Admin section is the editor.
 */

import { useEffect, useState } from 'react';

export type DebugPillKey =
  | 'felt'
  | 'dealerDbg'
  | 'seatOwnership'
  | 'dealerAffordance'
  | 'overlayOwnership'
  | 'shellLifecycle'
  | 'layoutFault'
  | 'wave5Violation'
  | 'wartime'
  | 'networkSim'
  | 'debugMode'
  | 'diceTrace'
  | 'w5Grid'
  | 'timerDbg'
  | 'normalizationDbg'
  | 'settlementDbg'
  | 'chipTransportDbg'
  | 'winnerChipEndpointDbg'
  | 'destReactionDbg'
  | 'visibleChipDbg'
  | 'cardTransportDbg'
  | 'cardBackDbg'
  | 'threeFiveSevenDealDiag'
  | 'threeFiveSevenForensics'
  | 'holmDealDbg'
  | 'bucksOverlay'
  | 'communityExport'
  | 'threeFiveSevenR1Snapback';

export interface DebugPillDescriptor {
  key: DebugPillKey;
  abbreviation: string;
  fullName: string;
  description: string;
}


export const DEBUG_PILL_REGISTRY: readonly DebugPillDescriptor[] = [
  { key: 'felt',             abbreviation: 'FELT',      fullName: 'Felt',              description: 'Felt ownership, displayed plate, stakes, sources' },
  { key: 'dealerDbg',        abbreviation: 'DEALER',    fullName: 'Dealer',            description: 'Dealer ownership and visibility' },
  { key: 'seatOwnership',    abbreviation: 'SEAT',      fullName: 'Seat Ownership',    description: 'Seat lifecycle and duplicate cluster detection' },
  { key: 'dealerAffordance', abbreviation: 'DEAL AFF',  fullName: 'Dealer Affordance', description: 'Identity vs seat vs legacy dealer indicator visibility' },
  { key: 'overlayOwnership', abbreviation: 'OVL OWN',   fullName: 'Overlay Ownership', description: 'Shell-owned transient overlay layer mounts (slot/settlement/transient)' },
  { key: 'shellLifecycle',   abbreviation: 'SHELL LC',  fullName: 'Shell Lifecycle',   description: 'Shell/game lifecycle phases, mounts, readiness' },
  { key: 'layoutFault',      abbreviation: 'LAYOUT',    fullName: 'Layout Fault',      description: 'Wave 4 layout-fault telemetry badge' },
  { key: 'wave5Violation',   abbreviation: 'W5 VIOL',   fullName: 'Wave 5 Violation',  description: 'Wave 5 gameplay-geometry contract violations' },
  { key: 'wartime',          abbreviation: 'WARTIME',   fullName: 'Wartime Debug',     description: 'Wartime debug event recorder and exporter' },
  { key: 'networkSim',       abbreviation: 'NETSIM',    fullName: 'Network Sim',       description: 'Network simulation indicator and controls' },
  { key: 'debugMode',        abbreviation: 'DBG MODE',  fullName: 'Debug Mode',        description: 'Global debug-harness mode indicator' },
  { key: 'diceTrace',        abbreviation: 'DICE TRACE',fullName: 'Dice Trace',        description: 'Dice presentation trace controls (REC/STOP, straight-bot, build stamp) and dice trace HUD' },
  { key: 'w5Grid',           abbreviation: 'W5 GRID',   fullName: 'Wave 5 Grid',       description: 'Wave 5 gameplay coordinate grid overlay toggle pill' },
  { key: 'timerDbg',         abbreviation: 'TIMER',     fullName: 'Timer Dbg',         description: 'Shell timer publish/mount/visibility + blocked-gate diagnostic (Horses/SCC/Holm/357)' },
  { key: 'normalizationDbg', abbreviation: 'NORM DBG',  fullName: 'Seat Normalization Audit', description: 'Every normalizeTwoPlayerSeatsIfNeeded() invocation + call-site decision (inputs, distances, DB writes, rows updated)' },
  { key: 'settlementDbg',    abbreviation: 'SETTLE DBG',fullName: 'Canonical Settlement',  description: 'Canonical settlement phase machine: submit/shadow intents, phase transitions, economy/celebration barrier flags' },
  { key: 'chipTransportDbg', abbreviation: 'CHIP DBG',  fullName: 'Chip Transport Audit',  description: 'Per-intent canonical chip transport: endpoint resolution, mount/visibility, settle, drop, destination reaction application' },
  { key: 'winnerChipEndpointDbg', abbreviation: 'WIN ENDPT', fullName: 'Winner Chip Endpoint Audit', description: 'DOM snapshot of [data-chip-center] at announcementComplete + dispatch + drop. Diagnoses asymmetric winner-endpoint-missing failures.' },
  { key: 'destReactionDbg',  abbreviation: 'DEST REACT', fullName: 'Destination Reaction Audit', description: 'Per-intent destination-reaction lifecycle: target element snapshot, animation mount/start/finish, computed transform before/during/after, override detection.' },
  { key: 'visibleChipDbg',   abbreviation: 'VIS CHIP',   fullName: 'Visible Chip Inventory',     description: 'DOM inventory of every [data-chip-reaction-target] at chip-transport dispatch + arrival: rect, visibility, owner hint (canonical vs HUD vs self), winner-cluster presence + missing reason.' },
  { key: 'cardTransportDbg', abbreviation: 'CARD DBG',  fullName: 'Card Transport Audit',  description: 'Per-intent canonical card transport: endpoint resolution, rects, dx/dy, lifecycle samples (launch/midflight/arrival/destroy) with computed animation + transition CSS, ownershipClaim/destroyed timing.' },
  { key: 'cardBackDbg',      abbreviation: 'CB DBG',    fullName: 'Card Back Inventory',   description: 'Live DOM inventory of every hidden-card surface. Verifies ONE TABLE · ONE DEAL · ONE CARD BACK — flags any element painting a card back that is NOT a CanonicalCardBack, and shows the colors each canonical back is currently rendering with.' },
  { key: 'threeFiveSevenDealDiag', abbreviation: '357 DEAL DIAG', fullName: '3-5-7 Deal Diagnostics', description: 'Canonical staged-deal diagnostics: self hand ownership, round transitions (last 50), timer ownership, and the card-0 lifecycle timeline. Always-on for staged-deal games (Holm, 3-5-7, future).' },
  { key: 'threeFiveSevenForensics', abbreviation: '357 FORENSICS', fullName: '3-5-7 Forensics (nuclear)', description: 'Full per-render forensic capture for 3-5-7: deal runtime, complete DOM timer inventory, self/opponent hand counts vs ownership math, card-0 per-frame autopsy, DOM inventory of timers/hands/card-backs/flying-cards/runtimes/anchors, and an append-on-change transition log. 250-sample ring buffer.' },
  { key: 'holmDealDbg', abbreviation: 'HOLM DEAL DBG', fullName: 'Holm Deal Debug', description: 'Holm canonical deal forensics: DealRuntime, hands/community/Chucky dispatch/settle, DOM visibility, and pre-settle render violations.' },
  { key: 'bucksOverlay', abbreviation: 'BUCKS', fullName: 'Bucks Overlay Forensics', description: 'BUCK\'S ON YOU overlay provenance: effect eval / show requested / latch set / overlay mounted / dismissed. Copy or download the dump.' },
  { key: 'communityExport', abbreviation: 'COMM EXPORT', fullName: 'Community Export', description: 'Holm community-card landing export pill (one-tap download of the retained wartime buffer slice).' },
  { key: 'threeFiveSevenR1Snapback', abbreviation: '357 R1 SNAP', fullName: 'Enable R1 Snapback Debug Pills', description: '3-5-7 R1 snapback debug pills (ARM + EXPORT). Inert by default — no observers, listeners, or recorder until ARM is clicked during a live 3-card R1 opponent showdown. Capture auto-stops 1s after quiet or 8s max.' },

];

const LS_KEY = 'ptp_debug_pills_v1';

type Enabled = Partial<Record<DebugPillKey, boolean>>;

function readLS(): Enabled {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Enabled;
  } catch { /* noop */ }
  return {};
}

function writeLS(state: Enabled): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* noop */ }
}

let state: Enabled = readLS();
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

export function subscribeDebugPills(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getDebugPillsState(): Enabled {
  return state;
}

export function isDebugPillEnabled(key: DebugPillKey): boolean {
  return !!state[key];
}

export function setDebugPillEnabled(key: DebugPillKey, enabled: boolean): void {
  state = { ...state, [key]: enabled };
  writeLS(state);
  emit();
}

export function setAllDebugPills(enabled: boolean): void {
  const next: Enabled = {};
  for (const p of DEBUG_PILL_REGISTRY) next[p.key] = enabled;
  state = next;
  writeLS(state);
  emit();
}

// Cross-tab sync (admin toggles propagate to live preview tabs).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== LS_KEY) return;
    state = readLS();
    emit();
  });
}

export function useDebugPillEnabled(key: DebugPillKey): boolean {
  const [v, setV] = useState<boolean>(() => isDebugPillEnabled(key));
  useEffect(() => {
    setV(isDebugPillEnabled(key));
    return subscribeDebugPills(() => setV(isDebugPillEnabled(key)));
  }, [key]);
  return v;
}
