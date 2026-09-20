import { useState } from 'react';
import type { FarkleReplay } from '@/lib/farkle/types';
import { FarkleRemoteStage } from './FarkleRemoteStage';
import { FarkleRules } from './FarkleRules';

export function FarkleHistory({ replay, nameFor }: { replay: FarkleReplay | null; nameFor: (id: string) => string }) {
  const [selected, setSelected] = useState<number | null>(null);
  if (!replay) return <p className="p-3 text-sm">Loading recorded Farkle actions…</p>;
  const frame = replay.events.find(f => f.sequence === selected);
  return <div className="h-full overflow-auto p-2 text-sm">
    <label>Replay action <select className="rounded border bg-background p-1" value={selected ?? ''} onChange={e => setSelected(e.target.value ? Number(e.target.value) : null)}>
      <option value="">Action history</option>{replay.events.map(f => <option key={f.sequence} value={f.sequence}>{f.sequence}: {f.events.map(e => e.type.replace(/_/g, ' ')).join(', ')}</option>)}
    </select></label>
    {frame ? <div>
      <div style={{ aspectRatio: 3 }}><FarkleRemoteStage receiptKey={`replay/${frame.sequence}`} dice={frame.stateAfter.dice} /></div>
      <p>THIS TURN {frame.stateAfter.thisTurn}</p>
      {Object.entries(frame.stateAfter.playerStates).map(([id, score]) => <p key={id}>{nameFor(id)}: {score.banked} · {score.completedTurns} turns</p>)}
    </div> : <ol className="my-2 space-y-1">{replay.events.map(f => <li key={f.sequence}>
      {f.actorId ? `${nameFor(f.actorId)}: ` : ''}{f.events.map(event => `${event.type.replace(/_/g, ' ')}${event.points != null ? ` +${event.points}` : ''}${event.lost != null ? ` −${event.lost}` : ''}`).join(' · ')}
    </li>)}</ol>}
    <details><summary>Rules for this game</summary><FarkleRules config={replay.config} /></details>
  </div>;
}
