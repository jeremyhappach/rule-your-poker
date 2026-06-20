/**
 * NORMALIZATION DBG — persistent audit trail for
 * normalizeTwoPlayerSeatsIfNeeded() invocations and their call-site
 * decisions. Provides a tiny ring buffer + subscribe/format helpers
 * consumed by <NormalizationDbgPanel/>.
 *
 * Event kinds:
 *   - 'call-site' — emitted at every known caller BEFORE invoking (or
 *     deciding not to invoke) the normalizer. Proves which transitions
 *     attempted normalization.
 *   - 'normalize' — emitted from inside normalizeTwoPlayerSeatsIfNeeded
 *     with full inputs, decision, and DB-mutation results.
 */

const MAX = 30;
let seq = 0;

export type NormalizationResultCode =
  | 'skipped_no_game'
  | 'skipped_not_two_active_seated'
  | 'skipped_not_two_humans'
  | 'skipped_already_opposite'
  | 'skipped_host_or_other_missing_position'
  | 'normalized'
  | 'failed_pass1_other'
  | 'failed_pass1_occupant'
  | 'failed_pass2_other'
  | 'failed_pass2_occupant'
  | 'failed_unknown'
  | 'preflight'
  | 'status_flip_complete';

export interface NormalizationDbgPlayer {
  playerId: string;
  isBot: boolean;
  status: string | null;
  sittingOut: boolean;
  position: number | null;
}

export interface NormalizationDbgEntry {
  seq: number;
  ts: number;
  kind: 'call-site' | 'normalize' | 'start-game';
  caller: string;
  checkpoint?: 'before-normalize' | 'after-normalize' | 'after-status-flip' | string;
  // call-site fields:
  didInvokeNormalizer?: boolean;
  statusTransition?: string;
  // normalize fields:
  gameId?: string;
  gameType?: string | null;
  statusBefore?: string | null;
  activeSeatedPlayers?: number;
  activeHumanPlayers?: number;
  activeHumanCount?: number;
  players?: NormalizationDbgPlayer[];
  hostPlayerId?: string | null;
  hostSeat?: number | null;
  otherPlayerId?: string | null;
  otherSeat?: number | null;
  rawDistance?: number | null;
  circularDistance?: number | null;
  shouldNormalize?: boolean;
  targetSeat?: number | null;
  occupantPlayerId?: string | null;
  dbWriteAttempted?: boolean;
  dbRowsUpdated?: number | null;
  dealerPositionBefore?: number | null;
  dealerPositionAfter?: number | null;
  result?: NormalizationResultCode;
  errorMessage?: string | null;
}

let entries: NormalizationDbgEntry[] = [];
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => { try { l(); } catch { /* */ } }); }

export function subscribeNormalizationDbg(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function getNormalizationDbgEntries(): NormalizationDbgEntry[] {
  return entries;
}

export function recordNormalizationDbg(
  e: Omit<NormalizationDbgEntry, 'seq' | 'ts'>,
): void {
  const next = entries.concat({ ...e, seq: ++seq, ts: Date.now() });
  entries = next.length > MAX ? next.slice(next.length - MAX) : next;
  emit();
}

export function clearNormalizationDbg(): void {
  entries = [];
  emit();
}

export function formatNormalizationDbgAsText(): string {
  if (entries.length === 0) return 'NORMALIZATION DBG (empty)\n';
  const lines: string[] = ['NORMALIZATION DBG'];
  for (const e of entries) {
    const iso = new Date(e.ts).toISOString();
    if (e.kind === 'call-site') {
      lines.push(
        `${iso} [CALL-SITE] caller=${e.caller} didInvokeNormalizer=${e.didInvokeNormalizer} statusTransition=${e.statusTransition ?? ''}`,
      );
    } else if (e.kind === 'start-game') {
      lines.push(
        `${iso} [START GAME NORMALIZATION DBG] checkpoint=${e.checkpoint ?? ''} caller=${e.caller} result=${e.result ?? ''}`,
        `  activeSeatedPlayers=${e.activeSeatedPlayers ?? ''} activeHumanPlayers=${e.activeHumanPlayers ?? ''}`,
        `  players=${(e.players ?? []).map((p) => `{playerId=${p.playerId}, isBot=${p.isBot}, status=${p.status ?? ''}, sittingOut=${p.sittingOut}, position=${p.position ?? ''}}`).join(' ')}`,
        `  hostSeat=${e.hostSeat ?? ''} otherSeat=${e.otherSeat ?? ''} rawDist=${e.rawDistance ?? ''} circDist=${e.circularDistance ?? ''}`,
        `  shouldNormalize=${e.shouldNormalize} targetSeat=${e.targetSeat ?? ''}`,
        `  dbWriteAttempted=${e.dbWriteAttempted} dbRowsUpdated=${e.dbRowsUpdated ?? ''}`,
        `  ${e.errorMessage ? `error=${e.errorMessage}` : ''}`,
      );
    } else {
      lines.push(
        `${iso} [NORMALIZE] caller=${e.caller} statusBefore=${e.statusBefore ?? ''} gameType=${e.gameType ?? ''} activeSeated=${e.activeSeatedPlayers ?? ''} activeHumans=${e.activeHumanPlayers ?? e.activeHumanCount ?? ''}`,
        `  players=${(e.players ?? []).map((p) => `{playerId=${p.playerId}, isBot=${p.isBot}, status=${p.status ?? ''}, sittingOut=${p.sittingOut}, position=${p.position ?? ''}}`).join(' ')}`,
        `  host=${e.hostPlayerId ?? ''}@${e.hostSeat ?? ''} other=${e.otherPlayerId ?? ''}@${e.otherSeat ?? ''} rawDist=${e.rawDistance ?? ''} circDist=${e.circularDistance ?? ''}`,
        `  shouldNormalize=${e.shouldNormalize} targetSeat=${e.targetSeat ?? ''} occupant=${e.occupantPlayerId ?? ''}`,
        `  dbWriteAttempted=${e.dbWriteAttempted} dbRowsUpdated=${e.dbRowsUpdated ?? ''} dealerPos ${e.dealerPositionBefore ?? ''}→${e.dealerPositionAfter ?? ''}`,
        `  result=${e.result}${e.errorMessage ? ` err=${e.errorMessage}` : ''}`,
      );
    }
  }
  return lines.join('\n') + '\n';
}
