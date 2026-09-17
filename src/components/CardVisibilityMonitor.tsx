import { memo, useEffect, useRef } from 'react';
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import { observeCardVisibility, type CardVisibilityContract } from '@/lib/cardVisibilityMonitor';
import { retainCardVisibilityIncident, resumeCardVisibilityDelivery } from '@/lib/cardVisibilityIncident';
import { recordCardScan, setLiveTimingContext, clearLiveTimingContext } from '@/lib/livePlayTiming';

type Props = { contract: CardVisibilityContract };
/** Remains mounted even when a card subtree disappears. Produces no visible UI. */
function CardVisibilityMonitorImpl({ contract }: Props) {
  const marker = useRef<HTMLSpanElement>(null);
  const deal = useDealRuntime();
  const current = useRef(contract);
  const monitor = useRef<ReturnType<typeof observeCardVisibility>>();
  useEffect(() => {
    const ready = !deal || deal.phase === 'GAMEPLAY' || deal.phase === 'READY';
    const sameHand = !deal || deal.handContextId === contract.handContextId;
    const selfExpected = ready ? contract.selfExpected : sameHand && deal && contract.playerId
      ? Math.min(contract.selfExpected, deal.getSettledCountForPlayer(contract.playerId)) : 0;
    const communityExpected = ready ? contract.communityExpected : sameHand && deal
      ? Math.min(contract.communityExpected, [...deal.settledCardIds].filter(id => id.includes('#community-')).length) : 0;
    const next = { ...contract, active: contract.active && (ready || selfExpected > 0 || communityExpected > 0),
      selfExpected, communityExpected, communityFaces: Math.min(contract.communityFaces, communityExpected),
      runtimeHandContextId: deal?.handContextId ?? contract.handContextId,
      phase: deal?.phase ?? contract.phase, settledCount: deal?.settledCardIds.size ?? 0,
      pendingIntents: deal?.activeIntentsForHand ?? 0 };
    if (!sameContract(next, current.current)) {
      current.current = next;
      monitor.current?.update();
    }
  });
  useEffect(() => {
    // Felt artifacts are portalled beside the game subtree inside the persistent shell.
    const root = marker.current?.closest<HTMLElement>('[data-canonical-shell-root]') ?? marker.current?.parentElement;
    if (!root) return;
    try {
      setLiveTimingContext(current.current);
      monitor.current = observeCardVisibility(root, () => current.current, retainCardVisibilityIncident,
        duration => recordCardScan(current.current, duration));
    }
    catch { /* A diagnostic observer must never crash the table. */ }
    const stopDelivery = resumeCardVisibilityDelivery();
    return () => { monitor.current?.stop(); stopDelivery(); clearLiveTimingContext(current.current); };
  }, []);
  return <span ref={marker} hidden data-card-visibility-monitor="v1" />;
}
function sameContract(a: CardVisibilityContract, b: CardVisibilityContract) {
  return (Object.keys(a) as Array<keyof CardVisibilityContract>).every(key => a[key] === b[key]);
}
export const CardVisibilityMonitor = memo(CardVisibilityMonitorImpl, (a, b) => sameContract(a.contract, b.contract));
