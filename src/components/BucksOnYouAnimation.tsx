// FROZEN: chip transport (P8.1). Do NOT add new bespoke chip/pot animators.
// Presentation-transaction model: animation start/complete are keyed to a
// stable `presentationId`. Same id → at most one start, one completion.
// Parent rerenders, prop churn, and unstable callbacks must not replay.
import { useEffect, useRef, useState } from "react";
import { recordBucksForensic } from "@/lib/canonicalShell/holmBucksOverlayForensics";

interface BucksOnYouAnimationProps {
  /**
   * Stable id for one presentation transaction. Changing to a new non-null
   * value starts exactly one animation. Same id is inert. null hides.
   */
  presentationId: string | null;
  onComplete?: (presentationId: string) => void;
}

const ANIMATION_MS = 1500;

export const BucksOnYouAnimation = ({ presentationId, onComplete }: BucksOnYouAnimationProps) => {
  const [visibleId, setVisibleId] = useState<string | null>(null);
  const startedPresentationIdRef = useRef<string | null>(null);
  const completedPresentationIdRef = useRef<string | null>(null);

  // Keep callback in a ref so it does NOT live in the start-effect deps.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    // Hide path
    if (!presentationId) {
      if (visibleId) {
        recordBucksForensic('OVERLAY_UNMOUNTED', {
          ownerFile: 'src/components/BucksOnYouAnimation.tsx',
          ownerComponent: 'BucksOnYouAnimation',
          ownerBranch: 'presentationId=null → hide',
          priorVisibleId: visibleId,
        });
      }
      setVisibleId(null);
      return;
    }

    // Same presentation id — strictly inert. No setState, no timer, no replay.
    if (startedPresentationIdRef.current === presentationId) {
      return;
    }

    // New presentation id → one-shot start.
    startedPresentationIdRef.current = presentationId;
    recordBucksForensic('OVERLAY_MOUNTED', {
      ownerFile: 'src/components/BucksOnYouAnimation.tsx',
      ownerComponent: 'BucksOnYouAnimation',
      ownerBranch: 'presentationId changed → setVisible(true)',
      presentationId,
    });
    setVisibleId(presentationId);

    const timer = setTimeout(() => {
      if (completedPresentationIdRef.current === presentationId) return;
      completedPresentationIdRef.current = presentationId;
      recordBucksForensic('OVERLAY_UNMOUNTED', {
        ownerFile: 'src/components/BucksOnYouAnimation.tsx',
        ownerComponent: 'BucksOnYouAnimation',
        ownerBranch: 'auto-timeout → onComplete',
        presentationId,
      });
      setVisibleId((curr) => (curr === presentationId ? null : curr));
      try {
        onCompleteRef.current?.(presentationId);
      } catch {
        /* noop */
      }
    }, ANIMATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentationId]);

  if (!visibleId) return null;

  return (
    <div
      key={visibleId}
      className="absolute inset-0 flex items-center justify-center z-[1000] pointer-events-none animate-[fadeOut_0.3s_ease-out_1.2s_forwards]"
    >
      {/* Dark red flash overlay - quick flash */}
      <div className="absolute inset-0 bg-red-900/30 animate-[pulse_0.1s_ease-in-out_3]" />

      {/* Target/crosshair and text container */}
      <div className="flex flex-col items-center gap-2 animate-scale-in">
        {/* Target crosshair icon - smaller, faster spin */}
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 animate-[spin_0.3s_ease-out]">
          {/* Outer ring */}
          <div className="absolute inset-0 border-3 border-red-500 rounded-full" />
          {/* Inner ring */}
          <div className="absolute inset-3 border-2 border-red-400 rounded-full" />
          {/* Center dot */}
          <div className="absolute inset-1/2 w-3 h-3 -ml-1.5 -mt-1.5 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,1)]" />
          {/* Crosshairs */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-red-500" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-red-500" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-0.5 bg-red-500" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-0.5 bg-red-500" />
        </div>

        {/* BUCK'S ON YOU text */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-2 rounded-lg border-3 border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.6)]">
          <span className="text-red-400 font-black text-lg sm:text-xl tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            BUCK'S ON YOU
          </span>
        </div>
      </div>
    </div>
  );
};
