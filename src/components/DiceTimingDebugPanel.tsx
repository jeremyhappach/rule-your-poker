import React from 'react';
import { useTimingSession } from '@/hooks/useDiceTimingDebug';
import { Button } from '@/components/ui/button';
import { Play, Square } from 'lucide-react';
import { toast } from 'sonner';

export function DiceTimingDebugPanel() {
  const { isActive, start, stopAndSave } = useTimingSession();

  const handleStop = async () => {
    const { savedId } = await stopAndSave();
    if (savedId) toast.success('Timing session saved');
    else toast.error('Failed to save timing session');
  };

  // Minimal floating buttons - positioned top-left to avoid blocking game controls
  return (
    <div className="fixed top-16 left-2 z-[9999] flex gap-1 pointer-events-auto">
      {!isActive ? (
        <Button size="sm" onClick={() => start('dice')} className="h-8 px-2 text-xs font-mono">
          <Play className="w-3 h-3 mr-1" /> REC
        </Button>
      ) : (
        <Button
          size="sm"
          variant="destructive"
          onClick={handleStop}
          className="h-8 px-2 text-xs font-mono"
        >
          <Square className="w-3 h-3 mr-1" /> STOP
        </Button>
      )}
    </div>
  );
}

