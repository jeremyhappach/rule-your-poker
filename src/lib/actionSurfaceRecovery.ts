import { useEffect, useRef } from 'react';

export const ACTION_SURFACE_RECOVERY_REQUEST_EVENT =
  'app:authoritative-action-surface-recovery-request';

export interface ActionSurfaceRecoveryRequest {
  gameId: string;
  gameType: string;
  identityKey: string;
  surface: string;
  handled: boolean;
  respond: (succeeded: boolean) => void;
}

interface ActionSurfaceGuardOptions {
  expected: boolean;
  gameId: string | null | undefined;
  gameType: string;
  identityKey: string | null | undefined;
  surface: string;
  selector: string;
}

export function isRenderedActionSurfaceVisible(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0
    && rect.height > 0
    && style.display !== 'none'
    && style.visibility !== 'hidden'
    && Number(style.opacity || '1') > 0;
}

export function requestActionSurfaceRecovery(
  request: Omit<ActionSurfaceRecoveryRequest, 'handled' | 'respond'>,
): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const detail: ActionSurfaceRecoveryRequest = {
      ...request,
      handled: false,
      respond: (succeeded) => {
        if (settled) return;
        settled = true;
        resolve(succeeded);
      },
    };
    window.dispatchEvent(new CustomEvent(ACTION_SURFACE_RECOVERY_REQUEST_EVENT, { detail }));
    if (!detail.handled) detail.respond(false);
  });
}

export function subscribeActionSurfaceRecoveryRequests(
  listener: (request: ActionSurfaceRecoveryRequest) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handleRequest = (event: Event) => {
    const request = (event as CustomEvent<ActionSurfaceRecoveryRequest>).detail;
    if (request) listener(request);
  };
  window.addEventListener(ACTION_SURFACE_RECOVERY_REQUEST_EVENT, handleRequest);
  return () => window.removeEventListener(ACTION_SURFACE_RECOVERY_REQUEST_EVENT, handleRequest);
}

/**
 * Presentation-only invariant: when authoritative state says this client owns
 * an action, the matching rendered surface must exist after React commits. A
 * mismatch requests one serialized authoritative snapshot per exact identity;
 * it never chooses an action or advances gameplay.
 */
export function useAuthoritativeActionSurfaceGuard({
  expected,
  gameId,
  gameType,
  identityKey,
  surface,
  selector,
}: ActionSurfaceGuardOptions): void {
  const attemptedIdentityRef = useRef<string | null>(null);

  useEffect(() => {
    if (!expected || !gameId || !identityKey) {
      attemptedIdentityRef.current = null;
      return;
    }

    const exactIdentity = `${gameId}:${gameType}:${surface}:${identityKey}`;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const matchingSurfaces = document.querySelectorAll(selector);
        if ([...matchingSurfaces].some(isRenderedActionSurfaceVisible)) return;
        if (attemptedIdentityRef.current === exactIdentity) return;
        attemptedIdentityRef.current = exactIdentity;
        void requestActionSurfaceRecovery({
          gameId,
          gameType,
          identityKey,
          surface,
        });
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, [expected, gameId, gameType, identityKey, selector, surface]);
}
