/**
 * Gin phase trace — RETIRED.
 *
 * The Gin startup/tab investigation is complete. This module keeps its
 * public API surface so existing call sites (recordGinPhaseTrace, etc.)
 * compile cleanly, but every entry point is a no-op:
 *
 *   - no ring-buffer writes
 *   - no listeners / notifications
 *   - no localStorage / sessionStorage / debug persistence
 *   - no console output
 *   - the diagnostic pill renders nothing
 *
 * Permanent contracts (ShellTabBar portal + SHELL_Z, Gin controlled
 * activeTab / draft, dealer-setup passive behavior, chat input focus,
 * Gin opening deal projection) live in their own files and are covered
 * by their own regression tests.
 */

export type GinPhaseTraceKind =
  | 'trace-armed'
  | 'trace-exported'
  | 'tab-active-change'
  | 'tab-request'
  | 'tab-disabled-calculation'
  | 'pane-selected'
  | 'forced-tab-projection'
  | 'authoritative-state-update'
  | 'state-replacement'
  | 'ante-resolution'
  | 'deal-runtime-host'
  | 'deal-runtime-mount'
  | 'deal-runtime-unmount'
  | 'deal-runtime-reset'
  | 'deal-runtime-start'
  | 'deal-runtime-abort'
  | 'deal-runtime-complete'
  | 'deal-orchestrator-mount'
  | 'deal-orchestrator-unmount'
  | 'deal-orchestrator-start'
  | 'deal-orchestrator-skip'
  | 'card-transport-dispatch'
  | 'card-transport-settle'
  | 'card-projection'
  | 'tab-dom-interactivity';

export interface GinPhaseTraceIdentity {
  gameId?: string | null;
  dealerGameId?: string | null;
  roundId?: string | null;
  handNumber?: number | null;
  handContextId?: string | null;
  dealerPlayerId?: string | null;
  callerPlayerId?: string | null;
}

export interface GinPhaseTraceEvent {
  seq: number;
  tMs: number;
  wallIso: string;
  kind: GinPhaseTraceKind;
  summary: string;
  sourceFile: string;
  sourceFunction: string;
  identity?: GinPhaseTraceIdentity;
  detail?: Record<string, unknown>;
}

const EMPTY_SNAPSHOT = { armed: false, events: [] as GinPhaseTraceEvent[] };

export function subscribeGinPhaseTrace(_listener: () => void): () => void {
  return () => {};
}

export function getGinPhaseTraceSnapshot(): { armed: boolean; events: GinPhaseTraceEvent[] } {
  return EMPTY_SNAPSHOT;
}

export function getGinPhaseTraceStatus(): {
  armedRaw: boolean;
  capturing: boolean;
  hasEvents: boolean;
  captureUntilMs: number | null;
  sessionKey: string | null;
  eventCount: number;
} {
  return {
    armedRaw: false,
    capturing: false,
    hasEvents: false,
    captureUntilMs: null,
    sessionKey: null,
    eventCount: 0,
  };
}

export function setGinPhaseTraceEligibility(_inputs: Record<string, unknown>): void {}
export function getGinPhaseTraceEligibility(): Record<string, unknown> | null {
  return null;
}

export function armGinPhaseTrace(_args: {
  sessionKey: string;
  identity?: GinPhaseTraceIdentity;
  detail?: Record<string, unknown>;
}): void {}

export function markGinPhaseTraceAnteResolved(_args: {
  identity?: GinPhaseTraceIdentity;
  detail?: Record<string, unknown>;
}): void {}

export function recordGinPhaseTrace(_args: {
  kind: GinPhaseTraceKind;
  summary: string;
  sourceFile: string;
  sourceFunction: string;
  identity?: GinPhaseTraceIdentity;
  detail?: Record<string, unknown>;
  force?: boolean;
}): void {}

export function formatGinPhaseTraceText(): string {
  return '# Gin phase trace disabled';
}

export function exportGinPhaseTraceTxt(): void {}

export interface GinPhaseTracePillProps {
  eligible: boolean;
  disabledReason?: string | null;
  gameId?: string | null;
  gameType?: string | null;
  status?: string | null;
  phase?: string | null;
  dealerGameId?: string | null;
  humanPlayerCount?: number | null;
}

export function GinPhaseTracePill(_props: GinPhaseTracePillProps): null {
  return null;
}
