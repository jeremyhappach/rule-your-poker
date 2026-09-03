/**
 * Keeps a Holm bot scheduler dispatch in flight through both its visible
 * thinking delay and the exact authoritative decision attempt. The caller's
 * wake/latch must not be released while the action is merely scheduled.
 */
export async function runHolmBotDecisionAfterDelay<T>(
  delaySeconds: number,
  submit: () => Promise<T>,
): Promise<T> {
  const delayMs = Math.max(0, Number.isFinite(delaySeconds) ? delaySeconds * 1000 : 0);
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  return submit();
}
