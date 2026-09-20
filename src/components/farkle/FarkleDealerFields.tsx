import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { FarkleEndgame } from '@/lib/farkle/types';
import { FARKLE_ENDGAME_LABELS } from '@/lib/farkle/types';

export interface FarkleDealerFieldsValue { stake: string; target: string; endgame: FarkleEndgame }
export function FarkleDealerFields({ value, onChange }: { value: FarkleDealerFieldsValue; onChange: (value: FarkleDealerFieldsValue) => void }) {
  return <div className="grid gap-3" data-farkle-dealer-fields="">
    <div><Label htmlFor="farkle-stake">Stake</Label><Input id="farkle-stake" inputMode="numeric" value={value.stake} onChange={e => onChange({ ...value, stake: e.target.value })} /></div>
    <div><Label htmlFor="farkle-target">Target Score</Label><Input id="farkle-target" inputMode="numeric" value={value.target} onChange={e => onChange({ ...value, target: e.target.value })} /></div>
    <div><Label htmlFor="farkle-endgame">Endgame</Label><select id="farkle-endgame" className="w-full rounded border border-input bg-background p-2" value={value.endgame} onChange={e => onChange({ ...value, endgame: e.target.value as FarkleEndgame })}>
      {Object.entries(FARKLE_ENDGAME_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select></div>
  </div>;
}
