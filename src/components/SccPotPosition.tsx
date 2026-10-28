import { useLayoutEffect, useState, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { useCanonicalFeltCoordFrameElement } from '@/lib/canonicalShell/useCanonicalFeltCoordFrameElement';

/** Keep the existing SCC pot in normal flow below the shell's game/stakes
 * label. The compact pill avoids the dice and the felt's top clipping edge.
 * The shell still owns the label and the caller still owns the amount.
 */
export function SccPotPosition({ children, style, ...props }: ComponentProps<'div'>) {
  const frame = useCanonicalFeltCoordFrameElement(true);
  const [plate, setPlate] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const host = frame?.parentElement?.parentElement;
    if (!host) { setPlate(null); return; }
    const read = () => setPlate(host.querySelector<HTMLElement>('[data-canonical-felt-plate-mode="GAME"]'));
    read();
    const observer = new MutationObserver(read);
    observer.observe(host, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [frame]);
  if (!plate) return null;
  return createPortal(<div {...props} data-scc-pot-position="below-label" style={{
    ...style,
    position: 'relative',
    left: 'auto',
    top: 'auto',
    transform: 'none',
    marginTop: '0.25rem',
    transition: 'none',
  }}>{children}</div>, plate);
}
