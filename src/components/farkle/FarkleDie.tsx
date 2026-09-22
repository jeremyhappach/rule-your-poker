import { useLayoutEffect, useRef, useState } from 'react';
import { HorsesDie } from '@/components/HorsesDie';
import type { FarkleDie as Die } from '@/lib/farkle/types';
import './farkle.css';

/** Existing canonical dice material; Farkle alone owns interaction and layout. */
export function FarkleDie({ die, selected = false, disabled = true, concealed = false, retired = false, scoring = false, onSelect }: {
  die: Die; selected?: boolean; disabled?: boolean; concealed?: boolean; retired?: boolean; scoring?: boolean; onSelect?: (index: number) => void;
}) {
  const container = useRef<HTMLSpanElement>(null);
  const [edge, setEdge] = useState(36);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => {
      const edge = Math.min(element.clientWidth, element.clientHeight);
      if (edge > 0) setEdge(edge);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const size = edge >= 88 ? 'xl' : edge >= 64 ? 'lg' : edge >= 42 ? 'md' : edge >= 32 ? 'sm' : 'xs';
  const label = concealed ? `Die ${die.index + 1}` : `Die ${die.index + 1}: ${die.value}`;
  return <span ref={container} className="farkle-die" data-selected={selected} data-retired={retired} data-scoring={scoring} data-farkle-die={die.index}>
    <span className="farkle-die-visual" aria-hidden="true"><HorsesDie value={concealed ? 0 : die.value}
      isHeld={false} canToggle={false} showWildHighlight={false} size={size} sizePx={edge} /></span>
    {onSelect ? <button type="button" className="farkle-die-target" aria-label={label} aria-pressed={selected}
      disabled={disabled || retired} onClick={() => onSelect(die.index)} data-farkle-die-index={die.index} />
      : <span className="farkle-die-target" role="img" aria-label={label} data-farkle-die-index={die.index} />}
  </span>;
}
