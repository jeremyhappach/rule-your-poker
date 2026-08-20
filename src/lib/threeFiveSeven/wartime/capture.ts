import { isThreeFiveSevenGameType } from '../currentFrame';

export interface WartimeActiveGameContext {
  enabled: boolean;
  gameId: string | null;
  gameType: string | null;
  dealerGameId: string | null;
}

export interface WartimeCaptureDecision {
  explicitlyEnabled: boolean;
  activeGameId: string | null;
  activeGameType: string | null;
  eventGameId?: string | null;
}

let activeGameContext: WartimeActiveGameContext | null = null;

/** Pure policy used by both the runtime gate and its regression tests. */
export function shouldCaptureWartime(input: WartimeCaptureDecision): boolean {
  if (!input.explicitlyEnabled) return false;
  if (!input.activeGameId || !isThreeFiveSevenGameType(input.activeGameType)) return false;
  return !input.eventGameId || input.eventGameId === input.activeGameId;
}

/**
 * Game.tsx is the route owner and publishes the currently mounted game type.
 * The diagnostic sink must never infer that scope from a stale event alone.
 */
export function setWartimeActiveGameContext(context: WartimeActiveGameContext | null): void {
  activeGameContext = context;
}

export function isWartimeCaptureEnabled(eventGameId?: string | null): boolean {
  if (typeof window === 'undefined' || !activeGameContext) return false;
  return shouldCaptureWartime({
    explicitlyEnabled: activeGameContext.enabled,
    activeGameId: activeGameContext.gameId,
    activeGameType: activeGameContext.gameType,
    eventGameId,
  });
}
