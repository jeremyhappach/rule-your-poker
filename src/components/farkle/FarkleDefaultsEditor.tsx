import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const fields = [
  ...['1', '5'].map(face => ({ key: `single-${face}`, label: `Single ${face}` })),
  ...[3, 4, 5, 6].flatMap(count => [1, 2, 3, 4, 5, 6].map(face => ({ key: `kind-${count}-${face}`, label: `${count} of a kind: ${face}s` }))),
  { key: 'straight', label: 'Straight' }, { key: 'threePairs', label: 'Three pairs' },
  { key: 'twoTriplets', label: 'Two triplets' }, { key: 'fourPlusPair', label: 'Four + pair' },
  { key: 'turnSeconds', label: 'Turn time (seconds)' }, { key: 'botDelayMs', label: 'Bot delay (milliseconds)' },
  { key: 'botBankThreshold', label: 'Balanced bot bank threshold' },
];

/** Unsaved authoring draft while numeric production defaults await approval. */
export function FarkleDefaultsEditor() {
  const [draft, setDraft] = useState<Record<string, string>>({});
  return <section className="space-y-3" aria-label="Farkle Admin Defaults draft">
    <p className="text-amber-300">Production scoring defaults are awaiting approval. These draft fields are not saved or active.</p>
    <p className="text-sm">Dealer setup contains only Stake, Target Score and Endgame. Each new game freezes its approved Admin Defaults.</p>
    <div className="grid grid-cols-2 gap-3">{fields.map(field => <div key={field.key}>
      <Label htmlFor={`farkle-default-${field.key}`}>{field.label}</Label>
      <Input id={`farkle-default-${field.key}`} type="number" min="0" step="1" value={draft[field.key] ?? ''}
        onChange={e => setDraft(previous => ({ ...previous, [field.key]: e.target.value }))} />
    </div>)}</div>
    <p>Bot policy: Balanced</p>
  </section>;
}
