import type { AuthoritativeIdentity } from '@/lib/gameStateSync/authoritativeIdentityPure';

export interface CribbageWriterAdmissionInput {
  action: string;
  authIdentity: AuthoritativeIdentity | null;
  presentationIdentity: AuthoritativeIdentity | null;
  writerRoundId: string | null | undefined;
  writerHandNumber: number | null | undefined;
  renderHandKey: string | null | undefined;
  currentHandKey: string | null | undefined;
  propRoundId: string | null | undefined;
  propHandNumber: number | null | undefined;
  /** Synchronous ref-backed framework verdict. This owns write admission. */
  frameworkCanInteractNow: boolean;
  /** Rendered framework value retained only for divergence diagnostics. */
  frameworkInteractionsAllowed: boolean;
}

export interface CribbageWriterAdmissionChecks {
  renderAndMirrorAligned: boolean;
  writerMatchesAuth: boolean;
  presentationMatchesAuth: boolean;
  frameworkCanInteractNow: boolean;
}

export interface CribbageWriterAdmissionResult {
  ok: boolean;
  reason:
    | 'aligned'
    | 'local-identity-misaligned'
    | 'writer-vs-auth-roundid-mismatch'
    | 'writer-vs-auth-hand-mismatch'
    | 'presentation-vs-auth-mismatch'
    | 'framework-identity-stale-or-frozen';
  divergence: Record<string, unknown>;
  checks: CribbageWriterAdmissionChecks;
}

/**
 * A response belongs to the hand that issued it only while that exact round
 * remains the live local boundary. A delayed response from a prior hand may
 * already be durable on the server, but must never replace the successor
 * hand's local authoritative/presentation mirrors.
 */
export function isCribbageActionResponseCurrent(
  actionRoundId: string | null | undefined,
  liveRoundId: string | null | undefined,
): boolean {
  return !!actionRoundId && actionRoundId === liveRoundId;
}

/**
 * Single Cribbage writer-admission owner shared by render enablement and
 * mutation handlers. The framework's synchronous predicate deliberately
 * outranks its rendered boolean so a React effect/render edge cannot enable
 * the button with one gate and reject the resulting event with another.
 */
export function evaluateCribbageWriterAdmission(
  input: CribbageWriterAdmissionInput,
): CribbageWriterAdmissionResult {
  const {
    action,
    authIdentity: auth,
    presentationIdentity: presentation,
    writerRoundId,
    writerHandNumber,
    renderHandKey,
    currentHandKey,
    propRoundId,
    propHandNumber,
    frameworkCanInteractNow,
    frameworkInteractionsAllowed,
  } = input;

  const renderAndMirrorAligned = !!(
    renderHandKey &&
    currentHandKey &&
    renderHandKey === currentHandKey &&
    writerRoundId
  );
  const writerMatchesAuth = !!(
    !auth ||
    (
      (!auth.roundId || auth.roundId === writerRoundId) &&
      (typeof auth.handNumber !== 'number' || auth.handNumber === writerHandNumber)
    )
  );
  const presentationMatchesAuth = !!(
    !presentation ||
    !auth ||
    (
      (!presentation.roundId || !auth.roundId || presentation.roundId === auth.roundId) &&
      (
        typeof presentation.handNumber !== 'number' ||
        typeof auth.handNumber !== 'number' ||
        presentation.handNumber === auth.handNumber
      )
    )
  );
  const checks: CribbageWriterAdmissionChecks = {
    renderAndMirrorAligned,
    writerMatchesAuth,
    presentationMatchesAuth,
    frameworkCanInteractNow,
  };
  const divergence: Record<string, unknown> = {
    action,
    authIdentity: auth
      ? { roundId: auth.roundId?.slice(0, 8), hand: auth.handNumber }
      : null,
    snapshotIdentity: writerRoundId?.slice(0, 8) ?? null,
    propIdentity: { roundId: propRoundId?.slice(0, 8), hand: propHandNumber },
    mirrorIdentity: { handKey: currentHandKey?.slice(0, 30) ?? null },
    presentationIdentity: presentation
      ? { roundId: presentation.roundId?.slice(0, 8), hand: presentation.handNumber }
      : null,
    writerIdentity: { roundId: writerRoundId?.slice(0, 8), hand: writerHandNumber },
    renderHandKey: renderHandKey?.slice(0, 30) ?? null,
    frameworkInteractionsAllowed,
    frameworkCanInteractNow,
    localInteractionsAllowed:
      renderAndMirrorAligned &&
      writerMatchesAuth &&
      presentationMatchesAuth &&
      frameworkCanInteractNow,
  };

  if (!renderAndMirrorAligned) {
    return { ok: false, reason: 'local-identity-misaligned', divergence, checks };
  }
  if (auth?.roundId && auth.roundId !== writerRoundId) {
    return { ok: false, reason: 'writer-vs-auth-roundid-mismatch', divergence, checks };
  }
  if (typeof auth?.handNumber === 'number' && auth.handNumber !== writerHandNumber) {
    return { ok: false, reason: 'writer-vs-auth-hand-mismatch', divergence, checks };
  }
  if (!presentationMatchesAuth) {
    return { ok: false, reason: 'presentation-vs-auth-mismatch', divergence, checks };
  }
  if (!frameworkCanInteractNow) {
    return { ok: false, reason: 'framework-identity-stale-or-frozen', divergence, checks };
  }

  return { ok: true, reason: 'aligned', divergence, checks };
}
