/**
 * GIN READY RELEASE — wartime pill exposing the DealRuntime READY
 * release latch state for the currently mounted Gin hand. Must be
 * rendered inside <DealRuntime gameType="gin-rummy">.
 */
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';

export function GinReadyReleasePill() {
  const deal = useDealRuntime();
  if (!deal || deal.gameType !== 'gin-rummy') return null;

  const {
    handContextId,
    phase,
    expectedCount,
    settledCardIds,
    dealSettled,
    readyReleased,
    releaseEligible,
    releaseBlockReason,
  } = deal;
  const settledCount = settledCardIds.size;
  // activeIntentsForHand is not exposed directly; infer from block reason
  // when applicable. When the runtime exposes it via blockReason we trust
  // it; otherwise show the rendered settled/expected snapshot.
  const activeIntentsForHand =
    releaseBlockReason === 'waiting_for_intents' ? '>0' : '0';

  const color = readyReleased ? '#7CFC00' : releaseEligible ? '#FFD580' : '#ff9966';

  return (
    <div
      data-gin-ready-release-pill=""
      style={{
        position: 'fixed',
        right: 6,
        bottom: 6,
        zIndex: 2147483647,
        background: 'rgba(0,0,0,0.88)',
        color,
        border: `1px solid ${color}`,
        borderRadius: 6,
        font: '10px/1.3 ui-monospace, Menlo, monospace',
        padding: '4px 6px',
        pointerEvents: 'none',
        maxWidth: '94vw',
      }}
    >
      <div style={{ fontWeight: 800 }}>GIN READY RELEASE</div>
      <div>hand: {handContextId}</div>
      <div>
        phase: {phase} · expected: {expectedCount} · settled: {settledCount}
      </div>
      <div>
        intents: {activeIntentsForHand} · dealSettled: {String(dealSettled)} · readyReleased: {String(readyReleased)}
      </div>
      <div>
        releaseEligible: {String(releaseEligible)} · blockReason: {releaseBlockReason}
      </div>
    </div>
  );
}

export default GinReadyReleasePill;
