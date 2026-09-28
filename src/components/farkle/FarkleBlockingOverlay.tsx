import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SHELL_Z } from '@/lib/canonicalShell/zLayers';
import type { FarkleBlockingOverlayReceipt } from '@/lib/farkle/presentation';
import './farkle.css';

export interface FarkleBlockingOverlayProps {
  receipt: FarkleBlockingOverlayReceipt;
  onRetire?: (receiptId: string) => void;
  /** Geometry Lab uses the identical art inline, without covering the page. */
  preview?: boolean;
}

function CashRegisterArt() {
  return <svg className="farkle-overlay-art" viewBox="0 0 240 160" aria-hidden="true">
    <path d="M28 67h184l12 63H18z" fill="#7c2d12" stroke="#fbbf24" strokeWidth="6" />
    <path d="M45 36h142l18 34H32z" fill="#b45309" stroke="#fde68a" strokeWidth="6" />
    <rect x="63" y="48" width="105" height="30" rx="5" fill="#1c1917" stroke="#fef3c7" strokeWidth="4" />
    {[0, 1, 2, 3].map(row => [0, 1, 2, 3, 4].map(column => <rect key={`${row}/${column}`} x={72 + column * 18} y={54 + row * 6} width="11" height="4" rx="1" fill="#fef3c7" />))}
    <path className="farkle-register-drawer" d="M48 97h144v42H48z" fill="#f59e0b" stroke="#fff7ed" strokeWidth="5" />
    <circle cx="120" cy="118" r="8" fill="#451a03" />
    <path d="M35 28l8-17 8 17m146 0 8-17 8 17" fill="none" stroke="#fef3c7" strokeWidth="5" strokeLinecap="round" />
  </svg>;
}

function HotDiceArt() {
  return <svg className="farkle-overlay-art" viewBox="0 0 240 160" aria-hidden="true">
    <path className="farkle-hot-flame farkle-hot-flame-left" d="M70 128c-20-17-9-42 7-59 2 16 13 20 12 34 8-12 19-23 15-46 28 20 35 55 14 75z" fill="#ef4444" stroke="#fef08a" strokeWidth="4" />
    <path className="farkle-hot-flame farkle-hot-flame-right" d="M152 131c-21-13-15-42 1-62 4 16 15 17 16 32 8-12 16-28 9-45 30 19 38 57 15 78z" fill="#f97316" stroke="#fef08a" strokeWidth="4" />
    <g className="farkle-hot-die farkle-hot-die-left" transform="translate(58 73) rotate(-13)">
      <rect width="72" height="72" rx="13" fill="#fff7ed" stroke="#fbbf24" strokeWidth="6" />
      {[18, 54].map(x => [18, 54].map(y => <circle key={`${x}/${y}`} cx={x} cy={y} r="6" fill="#b91c1c" />))}
    </g>
    <g className="farkle-hot-die farkle-hot-die-right" transform="translate(117 70) rotate(14)">
      <rect width="72" height="72" rx="13" fill="#fff7ed" stroke="#fbbf24" strokeWidth="6" />
      {[18, 36, 54].map(y => <circle key={y} cx="36" cy={y} r="6" fill="#b91c1c" />)}
    </g>
  </svg>;
}

/** Original Farkle bust: horns, smoke and a smug grin are intentionally not based on another mascot. */
function FarkleBustArt() {
  return <svg className="farkle-overlay-art" viewBox="0 0 240 160" aria-hidden="true">
    <path className="farkle-bust-smoke" d="M26 126c22-25 33 9 55-12 15-15-6-29 14-42M207 126c-22-25-33 9-55-12-15-15 6-29-14-42" fill="none" stroke="#94a3b8" strokeWidth="8" strokeLinecap="round" opacity=".7" />
    <path d="M70 58 49 24l36 14m86 20 21-34-36 14" fill="#f97316" stroke="#fecaca" strokeWidth="6" strokeLinejoin="round" />
    <path d="M65 93c0-40 23-62 55-62s55 22 55 62v29c0 23-22 33-55 33s-55-10-55-33z" fill="#dc2626" stroke="#fb923c" strokeWidth="6" />
    <path d="M78 94c10-12 26-14 38-3m46 3c-10-12-26-14-38-3" fill="none" stroke="#3f0a0a" strokeWidth="6" strokeLinecap="round" />
    <circle cx="98" cy="88" r="6" fill="#fff7ed" /><circle cx="142" cy="88" r="6" fill="#fff7ed" />
    <path d="M88 112c18 24 47 24 66-2-16 7-47 7-66 2z" fill="#450a0a" stroke="#fecaca" strokeWidth="4" strokeLinejoin="round" />
    {[105, 120, 135].map(x => <path key={x} d={`M${x} 117v8`} stroke="#fff7ed" strokeWidth="3" strokeLinecap="round" />)}
    <path d="M69 142 42 129l24-13m105 26 27-13-24-13" fill="#ea580c" stroke="#fed7aa" strokeWidth="5" strokeLinejoin="round" />
    <g className="farkle-bust-die" transform="translate(106 128) rotate(14)"><rect width="31" height="31" rx="6" fill="#fff7ed" stroke="#fbbf24" strokeWidth="4" /><circle cx="10" cy="10" r="3" fill="#991b1b" /><circle cx="21" cy="21" r="3" fill="#991b1b" /></g>
  </svg>;
}

function overlayArt(kind: FarkleBlockingOverlayReceipt['eventType']) {
  if (kind === 'banked') return <CashRegisterArt />;
  if (kind === 'hot_dice') return <HotDiceArt />;
  return <FarkleBustArt />;
}

function overlayCopy(receipt: FarkleBlockingOverlayReceipt) {
  if (receipt.eventType === 'banked') return { title: 'BANKED', detail: `+${receipt.points.toLocaleString('en-US')}` };
  if (receipt.eventType === 'hot_dice') return { title: 'HOT DICE!', detail: 'ROLL ALL 6 AGAIN' };
  return { title: 'FARKLE!', detail: receipt.lost > 0 ? `LOST ${receipt.lost.toLocaleString('en-US')}` : null };
}

export function FarkleBlockingOverlay({ receipt, onRetire, preview = false }: FarkleBlockingOverlayProps) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');
  const { title, detail } = overlayCopy(receipt);

  useEffect(() => {
    setPhase('enter');
    if (preview) return;
    const exitAtMs = Math.max(0, receipt.displayLifetimeMs - 220);
    const enter = requestAnimationFrame(() => setPhase('hold'));
    const exit = window.setTimeout(() => setPhase('exit'), exitAtMs);
    const retire = window.setTimeout(() => onRetire?.(receipt.id), receipt.displayLifetimeMs);
    return () => {
      cancelAnimationFrame(enter);
      window.clearTimeout(exit);
      window.clearTimeout(retire);
    };
  }, [receipt.id, receipt.displayLifetimeMs, onRetire, preview]);

  const node = <div
    className="farkle-blocking-overlay"
    data-farkle-blocking-overlay={receipt.eventType}
    data-farkle-overlay-id={receipt.id}
    data-farkle-overlay-phase={preview ? 'preview' : phase}
    data-farkle-overlay-duration={receipt.displayLifetimeMs}
    style={preview ? undefined : { zIndex: SHELL_Z.MODAL_OVERLAY }}
    role="status"
    aria-live="assertive"
  >
    <div className="farkle-blocking-overlay-panel">
      {overlayArt(receipt.eventType)}
      <h2>{title}</h2>
      {detail && <p>{detail}</p>}
    </div>
  </div>;

  if (preview || typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}
