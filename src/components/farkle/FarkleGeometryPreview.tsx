import { useState } from 'react';
import { FarkleRemoteStage, type FarkleRollPhase } from './FarkleRemoteStage';
import { FarkleBlockingOverlay } from './FarkleBlockingOverlay';
import { useDomainDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';
import {
  FARKLE_BLOCKING_OVERLAY_TIMING_BOUNDS,
  FARKLE_BLOCKING_OVERLAY_TIMING_DEFAULTS,
  FARKLE_BLOCKING_OVERLAY_TIMING_KEY,
  sanitizeFarkleBlockingOverlayTiming,
  type FarkleBlockingOverlayTiming,
  useFarkleBlockingOverlayTiming,
} from '@/lib/farkle/blockingOverlayTiming';
import type { FarkleBlockingOverlayReceipt } from '@/lib/farkle/presentation';

/** Explicit visual fixture: no session, action RPC, scoring or settlement. */
export function FarkleGeometryPreview() {
  const [phase, setPhase] = useState<FarkleRollPhase>('row');
  const [overlayEvent, setOverlayEvent] = useState<FarkleBlockingOverlayReceipt['eventType']>('banked');
  const [overlayRun, setOverlayRun] = useState(0);
  const committedTiming = useFarkleBlockingOverlayTiming();
  const { value: draftTiming, setValue: setDraftTiming, dirty } = useDomainDraft<FarkleBlockingOverlayTiming>(
    FARKLE_BLOCKING_OVERLAY_TIMING_KEY,
    FARKLE_BLOCKING_OVERLAY_TIMING_DEFAULTS,
  );
  const overlayReceipt: FarkleBlockingOverlayReceipt = {
    id: `geometry-preview/${overlayEvent}/${overlayRun}`,
    scopeKey: 'geometry-preview', sequence: overlayRun + 1, eventType: overlayEvent,
    displayLifetimeMs: draftTiming.displayLifetimeMs,
    points: 1250, lost: 650,
  };
  return <section className="space-y-2" aria-label="Farkle geometry preview">
    <p className="text-sm font-semibold text-amber-300">TEST ONLY — visual preview</p>
    <label>Preview state <select className="rounded border bg-background p-1" value={phase} onChange={e => setPhase(e.target.value as FarkleRollPhase)}>
      {(['cluster', 'rumble', 'reveal', 'row'] as const).map(value => <option key={value}>{value}</option>)}
    </select></label>
    <div className="w-full" style={{ aspectRatio: 3 }}><FarkleRemoteStage receiptKey="geometry-preview" previewPhase={phase}
      dice={[6, 1, 4, 3, 5, 2].map((value, index) => ({ index, value }))} /></div>
    <fieldset className="space-y-2 rounded border border-amber-400/40 p-2">
      <legend className="px-1 text-sm font-semibold text-amber-300">Blocking overlay</legend>
      <label className="block text-sm">Preview event <select className="ml-2 rounded border bg-background p-1" value={overlayEvent}
        onChange={event => { setOverlayEvent(event.target.value as FarkleBlockingOverlayReceipt['eventType']); setOverlayRun(run => run + 1); }}>
        <option value="banked">BANKED</option><option value="farkle">FARKLE</option><option value="hot_dice">HOT DICE</option>
      </select></label>
      <label className="block text-sm">Display lifetime (ms) <input aria-label="Farkle blocking overlay display lifetime" className="ml-2 w-24 rounded border bg-background p-1" type="number"
        min={FARKLE_BLOCKING_OVERLAY_TIMING_BOUNDS.displayLifetimeMs.min} max={FARKLE_BLOCKING_OVERLAY_TIMING_BOUNDS.displayLifetimeMs.max}
        step={FARKLE_BLOCKING_OVERLAY_TIMING_BOUNDS.displayLifetimeMs.step} value={draftTiming.displayLifetimeMs}
        onChange={event => setDraftTiming(sanitizeFarkleBlockingOverlayTiming({ displayLifetimeMs: event.target.value }))} /></label>
      <p className="text-xs text-muted-foreground">Committed runtime: {committedTiming.displayLifetimeMs} ms{dirty ? ' · draft awaiting Apply Changes' : ''}</p>
      <button type="button" className="rounded border px-2 py-1 text-sm" onClick={() => setOverlayRun(run => run + 1)}>Replay {overlayEvent === 'hot_dice' ? 'HOT DICE' : overlayEvent.toUpperCase()}</button>
      <div className="relative w-full overflow-hidden rounded" style={{ minHeight: '17rem' }}>
        <FarkleBlockingOverlay key={overlayReceipt.id} receipt={overlayReceipt} preview />
      </div>
    </fieldset>
  </section>;
}
