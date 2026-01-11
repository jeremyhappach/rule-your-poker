import React from 'react';
import { useTimingSession } from '@/hooks/useDiceTimingDebug';
import { Button } from '@/components/ui/button';
import { Play, Square, Copy } from 'lucide-react';
import { toast } from 'sonner';

export function DiceTimingDebugPanel() {
  const { session, isActive, start, stop } = useTimingSession();

  const handleCopy = () => {
    if (!session) {
      toast.error('No session to copy');
      return;
    }
    
    const lines: string[] = [];
    lines.push(`=== TIMING SESSION: ${session.id} ===`);
    lines.push(`Started: ${new Date(session.startTime).toISOString()}`);
    lines.push('');
    
    lines.push('=== EVENTS ===');
    session.events.forEach(e => {
      lines.push(`${e.elapsed}ms: ${e.event}`);
    });
    
    lines.push('');
    lines.push('=== STATE SNAPSHOTS (every 100ms) ===');
    
    const allKeys = new Set<string>();
    session.snapshots.forEach(s => Object.keys(s.states).forEach(k => allKeys.add(k)));
    const keyList = Array.from(allKeys).sort();
    
    lines.push(`elapsed\t${keyList.join('\t')}`);
    
    session.snapshots.forEach(s => {
      const values = keyList.map(k => String(s.states[k] ?? '-'));
      lines.push(`${s.elapsed}ms\t${values.join('\t')}`);
    });
    
    navigator.clipboard.writeText(lines.join('\n'));
    toast.success(`Copied ${session.events.length} events, ${session.snapshots.length} snapshots`);
  };

  // Minimal floating buttons - positioned top-left to avoid blocking game controls
  return (
    <div className="fixed top-16 left-2 z-[9999] flex gap-1 pointer-events-auto">
      {!isActive ? (
        <Button
          size="sm"
          onClick={() => start('dice')}
          className="h-8 px-2 bg-green-600 hover:bg-green-500 text-white text-xs font-mono"
        >
          <Play className="w-3 h-3 mr-1" /> REC
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={stop}
          className="h-8 px-2 bg-red-600 hover:bg-red-500 text-white text-xs font-mono animate-pulse"
        >
          <Square className="w-3 h-3 mr-1" /> STOP
        </Button>
      )}
      <Button
        size="sm"
        onClick={handleCopy}
        disabled={!session}
        className="h-8 px-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono disabled:opacity-40"
      >
        <Copy className="w-3 h-3" />
        {session ? ` (${session.events.length})` : ''}
      </Button>
    </div>
  );
}
