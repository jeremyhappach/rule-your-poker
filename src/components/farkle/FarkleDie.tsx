import { HorsesDie } from '@/components/HorsesDie';
import type { FarkleDie as Die } from '@/lib/farkle/types';
import './farkle.css';

/** Existing canonical dice material; Farkle alone owns interaction and layout. */
export function FarkleDie({ die, selected = false, disabled = true, concealed = false, retired = false, scoring = false, onSelect }: {
  die: Die; selected?: boolean; disabled?: boolean; concealed?: boolean; retired?: boolean; scoring?: boolean; onSelect?: (index: number) => void;
}) {
  const label = concealed ? `Die ${die.index + 1}` : `Die ${die.index + 1}: ${die.value}`;
  return <span className="farkle-die" data-selected={selected} data-retired={retired} data-scoring={scoring} data-farkle-die={die.index}>
    <span className="farkle-die-visual" aria-hidden="true"><HorsesDie value={concealed ? 0 : die.value}
      isHeld={false} canToggle={false} showWildHighlight={false} size="sm" /></span>
    {onSelect ? <button type="button" className="farkle-die-target" aria-label={label} aria-pressed={selected}
      disabled={disabled || retired} onClick={() => onSelect(die.index)} data-farkle-die-index={die.index} />
      : <span className="farkle-die-target" role="img" aria-label={label} data-farkle-die-index={die.index} />}
  </span>;
}
