/**
 * BufferedRatioInput — buffered numeric text input for normalized
 * ratio fields (Fan Overlap, Card-group ↔ Cut-card Gap).
 *
 * Contract:
 *   - Draft text updates locally on every keystroke.
 *   - No parse / clamp / sanitize / overwrite while focused.
 *   - On blur (and on external value change while NOT focused): parse,
 *     validate, clamp to [min, max], commit the numeric draft value.
 *   - Invalid/incomplete on blur → revert to last committed value.
 *   - Preserves negative + decimal intermediate states: "-", "-0.",
 *     "0.", "0.03", "-0.10", "0.125".
 *
 * Labeled visually as a normalized ratio value.
 */

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

export interface BufferedRatioInputProps {
  value: number;
  min?: number;
  max?: number;
  /** Visual unit hint shown beside the field. Defaults to "ratio". */
  unitLabel?: string;
  onCommit: (n: number) => void;
  className?: string;
  ariaLabel?: string;
}

function clamp(n: number, min?: number, max?: number): number {
  if (typeof min === 'number' && n < min) return min;
  if (typeof max === 'number' && n > max) return max;
  return n;
}

export function BufferedRatioInput({
  value,
  min,
  max,
  unitLabel = 'ratio',
  onCommit,
  className,
  ariaLabel,
}: BufferedRatioInputProps) {
  const [text, setText] = useState<string>(() => String(value));
  const focusedRef = useRef(false);
  const lastCommittedRef = useRef<number>(value);

  // Sync external changes only when NOT focused.
  useEffect(() => {
    if (focusedRef.current) return;
    lastCommittedRef.current = value;
    setText(String(value));
  }, [value]);

  const commit = () => {
    const raw = text.trim();
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n)) {
      // Revert
      setText(String(lastCommittedRef.current));
      return;
    }
    const clamped = clamp(n, min, max);
    lastCommittedRef.current = clamped;
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        type="text"
        inputMode="decimal"
        value={text}
        aria-label={ariaLabel}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          focusedRef.current = false;
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={className ?? 'h-8 w-24 font-mono'}
      />
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {unitLabel}
      </span>
    </div>
  );
}
