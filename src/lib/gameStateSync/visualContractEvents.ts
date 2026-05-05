/**
 * Persists visual-contract lifecycle events to debug_sync_events.
 * Fire-and-forget; never blocks UI.
 *
 * Aborts/timeouts persist regardless of debug flag (treated like invariants);
 * normal start/complete/buffer events are debug-gated.
 */

import { persistSyncDebugEvent } from '@/lib/persistSyncDebugEvent';
import type { VisualContractEventName, VisualContractIdentity } from './visualContract';

const ALWAYS_PERSIST: VisualContractEventName[] = [
  'visual-contract-aborted-identity-drift',
  'visual-contract-timeout',
];

export function logVisualContractEvent(
  name: VisualContractEventName,
  identity: VisualContractIdentity,
  gameType: string,
  details?: Record<string, unknown>,
): void {
  const isAbnormal = ALWAYS_PERSIST.includes(name);

  persistSyncDebugEvent({
    gameId: identity.gameId,
    gameType,
    handNumber: identity.handNumber ?? 0,
    roundId: identity.roundId ?? null,
    eventType: isAbnormal ? 'invariant' : 'transition',
    severity: isAbnormal ? 'warn' : 'info',
    eventName: name,
    payload: {
      contractType: identity.contractType,
      turnId: identity.turnId ?? null,
      phase: identity.phase ?? null,
      ...(details ?? {}),
    },
  });
}
