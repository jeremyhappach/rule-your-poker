import { useEffect, useState } from 'react';
export type FarkleRollPhase = 'cluster' | 'rumble' | 'reveal' | 'row';

/** New live receipts animate; reconnect begins settled and never delays authority. */
export function useFarkleRollPhase(receiptKey: string, animate: boolean): FarkleRollPhase {
  const [view, setView] = useState<{ key: string; phase: FarkleRollPhase }>({ key: receiptKey, phase: animate ? 'cluster' : 'row' });
  useEffect(() => {
    setView({ key: receiptKey, phase: animate ? 'cluster' : 'row' });
    if (!animate) return;
    const timers = ([['rumble', 180], ['reveal', 600], ['row', 850]] as const)
      .map(([phase, delay]) => setTimeout(() => setView({ key: receiptKey, phase }), delay));
    return () => timers.forEach(clearTimeout);
  }, [receiptKey, animate]);
  return view.key === receiptKey ? view.phase : animate ? 'cluster' : 'row';
}
