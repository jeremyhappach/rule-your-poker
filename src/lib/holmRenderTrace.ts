/**
 * Holm render-boundary trace — DISABLED.
 *
 * Investigation complete. All functions are now no-ops.
 * Retained as stubs so existing call sites don't need to be removed
 * from the 6600-line MobileGameTable.
 */

export interface HolmRenderPayload {
  clientId: string;
  gameId: string;
  roundId?: string;
  handNumber: number;
  handContextId: string;
  renderedPlayerId: string;
  cardIds: string;
  cardSource: string;
  isShowdown: boolean;
  shouldHideForTabling: boolean;
  isHolmWinWinner: boolean;
  isSoloVsChuckyPlayer: boolean;
  isSoloVsChuckyPlayerRaw: boolean;
  isSoloVsChucky: boolean;
  soloVsChuckyPlayerIdLocked: string | null;
  soloVsChuckyTableLocked: boolean;
  showdownModeLocked: boolean;
  stayedPlayersCount: number;
  playerDecision: string | null;
  decisionLocked: boolean | null;
  playerExplicitlyStayed: boolean;
  apparentIsActivePlayer: boolean;
  isSoloVsChuckyRaw: boolean;
}

export function resetHolmRenderTrace(_handContextId?: string): void {}
export function traceNormalSeatRender(_p: HolmRenderPayload, _renderType: 'face-up' | 'card-backs'): void {}
export function traceSoloAreaRender(_p: HolmRenderPayload): void {}
export function traceNormalSeatBlocked(_p: HolmRenderPayload, _blockReason: string): void {}
