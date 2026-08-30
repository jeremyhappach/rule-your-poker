const GIN_GAMES_ROUTING_FIELDS = [
  'status',
  'game_type',
  'current_game_uuid',
  'current_round',
  'total_hands',
  'awaiting_next_round',
  'is_paused',
  'paused_time_remaining',
  'pot',
  'dealer_position',
  'all_decisions_in',
  'all_decisions_in_round_id',
  'dealer_selection_complete',
  'dealer_selection_state',
] as const;

type GinGamesRoutingField = typeof GIN_GAMES_ROUTING_FIELDS[number];
export type GinGamesRealtimeRoutingSnapshot = Record<GinGamesRoutingField, string>;

function stableRoutingValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return `${typeof value}:${String(value)}`;
}

export function buildGinGamesRealtimeRoutingSnapshot(
  row: Record<string, unknown> | null | undefined,
): GinGamesRealtimeRoutingSnapshot {
  return Object.fromEntries(GIN_GAMES_ROUTING_FIELDS.map((field) => [
    field,
    stableRoutingValue(row?.[field]),
  ])) as GinGamesRealtimeRoutingSnapshot;
}

/**
 * Gin round authority and private projections have their own Realtime owner.
 * A games-row UPDATE that changes only operational metadata (for example
 * last_activity) can be installed directly without scheduling a full
 * games+rounds/players snapshot. Any routing or lifecycle change fails closed
 * to the existing transition handler.
 */
export function isRoutineGinGamesRealtimeUpdate(
  incomingRow: Record<string, unknown> | null | undefined,
  installedRouting: GinGamesRealtimeRoutingSnapshot,
): boolean {
  if (!incomingRow) return false;
  const incomingRouting = buildGinGamesRealtimeRoutingSnapshot(incomingRow);
  const isGin = incomingRouting.game_type === 'string:gin-rummy'
    || installedRouting.game_type === 'string:gin-rummy';
  return isGin && GIN_GAMES_ROUTING_FIELDS.every(
    (field) => incomingRouting[field] === installedRouting[field],
  );
}
