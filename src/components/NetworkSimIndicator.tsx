/**
 * Always-visible bottom-left chip when network simulation is active.
 * Hidden completely when mode === 'off'.
 */
import { useNetworkSim } from '@/hooks/useNetworkSim';
import { NETWORK_SIM_MODE_LABELS } from '@/lib/networkSim';
import { Wifi } from 'lucide-react';

export function NetworkSimIndicator() {
  const { mode, loggingEnabled } = useNetworkSim();
  if (mode === 'off') return null;

  return (
    <div
      className="fixed bottom-3 left-3 z-[9999] pointer-events-none select-none"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 rounded-full border-2 border-destructive bg-destructive px-3 py-1.5 text-destructive-foreground shadow-lg">
        <Wifi className="h-3.5 w-3.5 animate-pulse" />
        <span className="text-xs font-bold uppercase tracking-wider">
          NET SIM: {NETWORK_SIM_MODE_LABELS[mode]}
        </span>
        {loggingEnabled && (
          <span className="rounded bg-destructive-foreground/20 px-1.5 py-0.5 text-[10px] font-semibold">
            LOG
          </span>
        )}
      </div>
    </div>
  );
}
