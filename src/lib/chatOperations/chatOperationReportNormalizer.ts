/**
 * Normalizer for `chat_operation_reports.report_json`.
 *
 * `finalize_chat_send_operation` writes route/game_id/session_id under a
 * nested `identity` object, plus counts under `counts`. Older/flat rows may
 * have those fields at the top level. IncidentExportPill validates only the
 * normalized typed shape produced here — it must not know about two layouts.
 */

export interface NormalizedChatOperationReport {
  operationId: string;
  reportRowId: string | null;
  operationType: string;
  sourceKind: string | null;
  senderUserId: string | null;
  terminalStatus: string;
  route: string;
  gameId: string;
  sessionId: string;
  startedAt: string;
  completedAt: string | null;
  finalizedAt: string;
  reportText: string;
  snapshotCount: number;
  peerMilestoneCount: number;
}

export interface RawChatOperationReportRow {
  id?: string | null;
  operation_id: string;
  sender_user_id: string | null;
  game_id: string;
  session_id: string;
  terminal_status: string;
  report_text: string;
  report_json: unknown;
  finalized_at: string;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
function asArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}
function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Map the raw `chat_operation_reports` row into the pill's validated shape.
 * Returns null if the row is missing minimum identity to be a meaningful
 * report (operation id, game id, session id, route, report text). Never
 * throws.
 *
 * Precedence: canonical nested `identity` / `counts` values win over
 * legacy top-level equivalents when both exist.
 */
export function normalizeChatOperationReport(
  row: RawChatOperationReportRow,
): NormalizedChatOperationReport | null {
  const json = asObject(row.report_json);
  const identity = asObject(json.identity);
  const counts = asObject(json.counts);

  const route =
    asString(identity.route) ??
    asString((json as Record<string, unknown>).route) ??
    '';

  const gameId =
    asString(identity.game_id) ??
    asString((json as Record<string, unknown>).game_id) ??
    row.game_id;

  const sessionId =
    asString(identity.session_id) ??
    asString((json as Record<string, unknown>).session_id) ??
    row.session_id;

  const operationId =
    asString(identity.operation_id) ??
    asString((json as Record<string, unknown>).operation_id) ??
    row.operation_id;

  const operationType =
    asString((json as Record<string, unknown>).operation_type) ?? 'chat_send';

  const sourceKind = asString((json as Record<string, unknown>).source_kind);

  const senderUserId =
    asString((json as Record<string, unknown>).sender_user_id) ??
    row.sender_user_id;

  const startedAt =
    asString((json as Record<string, unknown>).started_at) ??
    asString(identity.started_at) ??
    row.finalized_at;

  const completedAt =
    asString((json as Record<string, unknown>).completed_at) ?? null;

  const snapshotCount =
    asNumber(counts.snapshot_count) ??
    asNumber((json as Record<string, unknown>).snapshot_count) ??
    asArrayLength((json as Record<string, unknown>).tab_attention_snapshots);

  const peerMilestoneCount =
    asNumber(counts.peer_milestone_count) ??
    asNumber((json as Record<string, unknown>).peer_milestone_count) ??
    asArrayLength((json as Record<string, unknown>).peer_milestones);

  // Minimum viable identity for the pill; missing identity → reject at
  // load so callers do not have to defensively re-check.
  if (!operationId || !gameId || !sessionId || !route || !row.report_text) {
    return null;
  }

  return {
    operationId,
    reportRowId: asString(row.id ?? null),
    operationType,
    sourceKind,
    senderUserId,
    terminalStatus: row.terminal_status,
    route,
    gameId,
    sessionId,
    startedAt,
    completedAt,
    finalizedAt: row.finalized_at,
    reportText: row.report_text,
    snapshotCount,
    peerMilestoneCount,
  };
}
