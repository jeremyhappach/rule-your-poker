import type { FarkleDie as Die } from '@/lib/farkle/types';

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

/** Farkle owns its die dimensions; no Horses/SCC layout tokens are consumed. */
export function FarkleDie({ die, selected = false, disabled = true, concealed = false, onSelect }: {
  die: Die; selected?: boolean; disabled?: boolean; concealed?: boolean; onSelect?: (index: number) => void;
}) {
  const label = concealed ? `Die ${die.index + 1}` : `Die ${die.index + 1}: ${die.value}`;
  const face = <svg viewBox="0 0 60 60" aria-hidden="true" className="h-full w-full">
    <rect x="2" y="2" width="56" height="56" rx="10" fill={selected ? '#fde68a' : '#fff7ed'} stroke={selected ? '#eab308' : '#a8a29e'} strokeWidth="3" />
    {!concealed && PIPS[die.value]?.map(p => <circle key={p} cx={15 + (p % 3) * 15} cy={15 + Math.floor(p / 3) * 15} r="4.5" fill="#292524" />)}
  </svg>;
  return onSelect ? <button type="button" className="aspect-square min-h-0 min-w-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
    aria-label={label} aria-pressed={selected} disabled={disabled} onClick={() => onSelect(die.index)} data-farkle-die-index={die.index}>{face}</button>
    : <span role="img" aria-label={label} className="block aspect-square min-h-0 min-w-0" data-farkle-die-index={die.index}>{face}</span>;
}
