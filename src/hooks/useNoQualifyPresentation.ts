import { useState } from 'react';

type ResultState = {
  isComplete: boolean;
  rollKey?: number;
  result?: { isQualified?: boolean; description?: string };
};
type Receipt = { scope: string | null; baseline: boolean; key: string | null; done: string | null };

/** Live-only receipt for one player's exact round. Accounting is independent. */
export function useNoQualifyPresentation(scope: string | null, state: ResultState | null | undefined, ready: boolean) {
  const [receipt, setReceipt] = useState<Receipt>({ scope, baseline: false, key: null, done: null });
  let current = receipt.scope === scope ? receipt : { scope, baseline: false, key: null, done: null };
  if (scope && state) {
    const key = state.isComplete && state.result?.isQualified === false ? `${scope}:${state.rollKey ?? 0}` : null;
    if (!current.baseline || current.key !== key) {
      // Initial completed state is hydration, not a newly observed result.
      current = { scope, baseline: true, key, done: current.baseline ? current.done : key };
    }
  }
  // Adjust before children commit, closing the effect-delay admission window.
  // React can discard this state with an abandoned render, unlike ref mutation.
  if (current !== receipt) setReceipt(current);
  const { key } = current;
  const pending = !!key && current.done !== key;
  return {
    key,
    pending,
    show: pending && ready,
    complete: () => setReceipt(previous => previous.scope === scope && previous.key === key
      ? { ...previous, done: key } : previous),
  };
}
