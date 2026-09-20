import { useState } from 'react';
import { FarkleRemoteStage, type FarkleRollPhase } from './FarkleRemoteStage';

/** Explicit visual fixture: no session, action RPC, scoring or settlement. */
export function FarkleGeometryPreview() {
  const [phase, setPhase] = useState<FarkleRollPhase>('row');
  return <section className="space-y-2" aria-label="Farkle geometry preview">
    <p className="text-sm font-semibold text-amber-300">TEST ONLY — visual preview</p>
    <label>Preview state <select className="rounded border bg-background p-1" value={phase} onChange={e => setPhase(e.target.value as FarkleRollPhase)}>
      {(['cluster', 'rumble', 'reveal', 'row'] as const).map(value => <option key={value}>{value}</option>)}
    </select></label>
    <div className="w-full" style={{ aspectRatio: 3 }}><FarkleRemoteStage receiptKey="geometry-preview" previewPhase={phase}
      dice={[6, 1, 4, 3, 5, 2].map((value, index) => ({ index, value }))} /></div>
  </section>;
}
