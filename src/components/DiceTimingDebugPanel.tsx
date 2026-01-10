import React, { useState } from 'react';
import { useTimingSession, TimingSnapshot } from '@/hooks/useDiceTimingDebug';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Play, Square, Copy, Trash2 } from 'lucide-react';

export function DiceTimingDebugPanel() {
  const { session, isActive, start, stop } = useTimingSession();
  const [isOpen, setIsOpen] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);

  const handleCopy = () => {
    if (!session) return;
    
    const lines: string[] = [];
    lines.push(`=== TIMING SESSION: ${session.id} ===`);
    lines.push(`Started: ${new Date(session.startTime).toISOString()}`);
    lines.push('');
    
    // Merge events and snapshots by time
    const allEntries: Array<{ elapsed: number; type: 'event' | 'snapshot'; data: any }> = [];
    
    session.events.forEach(e => allEntries.push({ elapsed: e.elapsed, type: 'event', data: e }));
    session.snapshots.forEach(s => allEntries.push({ elapsed: s.elapsed, type: 'snapshot', data: s }));
    
    allEntries.sort((a, b) => a.elapsed - b.elapsed);
    
    lines.push('=== EVENTS ===');
    session.events.forEach(e => {
      lines.push(`${e.elapsed}ms: ${e.event}`);
    });
    
    lines.push('');
    lines.push('=== STATE SNAPSHOTS (every 100ms) ===');
    
    // Get all unique state keys
    const allKeys = new Set<string>();
    session.snapshots.forEach(s => Object.keys(s.states).forEach(k => allKeys.add(k)));
    const keyList = Array.from(allKeys).sort();
    
    // Header
    lines.push(`elapsed\t${keyList.join('\t')}`);
    
    // Rows
    session.snapshots.forEach(s => {
      const values = keyList.map(k => String(s.states[k] ?? '-'));
      lines.push(`${s.elapsed}ms\t${values.join('\t')}`);
    });
    
    navigator.clipboard.writeText(lines.join('\n'));
    console.log('[TIMING] Copied to clipboard');
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-[9999] bg-yellow-500 text-black px-3 py-2 rounded-lg font-mono text-xs shadow-lg hover:bg-yellow-400"
      >
        🕐 Timing Debug
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-[9999] bg-black/95 border border-yellow-500 rounded-lg shadow-2xl w-[500px] max-h-[80vh] flex flex-col font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-yellow-500/50">
        <span className="text-yellow-400 font-bold">🕐 Dice Timing Debug</span>
        <div className="flex gap-1">
          {!isActive ? (
            <Button size="sm" variant="ghost" onClick={() => start('dice')} className="h-6 px-2 text-green-400 hover:text-green-300">
              <Play className="w-3 h-3 mr-1" /> Start
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={stop} className="h-6 px-2 text-red-400 hover:text-red-300">
              <Square className="w-3 h-3 mr-1" /> Stop
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={handleCopy} className="h-6 px-2 text-blue-400 hover:text-blue-300" disabled={!session}>
            <Copy className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setIsOpen(false)} className="h-6 px-2 text-gray-400 hover:text-gray-300">
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>
      
      {/* Status */}
      <div className="p-2 border-b border-yellow-500/30 text-gray-300">
        {isActive ? (
          <span className="text-green-400">● Recording... ({session?.snapshots.length || 0} snapshots, {session?.events.length || 0} events)</span>
        ) : session ? (
          <span className="text-yellow-400">Session complete: {session.snapshots.length} snapshots, {session.events.length} events</span>
        ) : (
          <span className="text-gray-500">Click Start, play a round, then Stop</span>
        )}
      </div>
      
      {/* Tabs */}
      {session && (
        <div className="flex border-b border-yellow-500/30">
          <button
            onClick={() => setShowSnapshots(false)}
            className={`px-3 py-1 ${!showSnapshots ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-500'}`}
          >
            Events ({session.events.length})
          </button>
          <button
            onClick={() => setShowSnapshots(true)}
            className={`px-3 py-1 ${showSnapshots ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-500'}`}
          >
            Snapshots ({session.snapshots.length})
          </button>
        </div>
      )}
      
      {/* Content */}
      <ScrollArea className="flex-1 max-h-[400px]">
        {session && !showSnapshots && (
          <div className="p-2 space-y-1">
            {session.events.length === 0 ? (
              <div className="text-gray-500 text-center py-4">No events recorded yet</div>
            ) : (
              session.events.map((e, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-yellow-400 w-16 text-right">{e.elapsed}ms</span>
                  <span className="text-gray-300">{e.event}</span>
                </div>
              ))
            )}
          </div>
        )}
        
        {session && showSnapshots && (
          <div className="p-2">
            {session.snapshots.length === 0 ? (
              <div className="text-gray-500 text-center py-4">No snapshots yet</div>
            ) : (
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-yellow-400">
                    <th className="text-left p-1">ms</th>
                    <th className="text-left p-1">State</th>
                  </tr>
                </thead>
                <tbody>
                  {session.snapshots.slice(-50).map((s, i) => (
                    <tr key={i} className="border-t border-gray-800">
                      <td className="p-1 text-yellow-400 align-top">{s.elapsed}</td>
                      <td className="p-1 text-gray-400">
                        {Object.entries(s.states).map(([k, v]) => (
                          <div key={k}>
                            <span className="text-gray-500">{k}:</span> <span className="text-white">{String(v)}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </ScrollArea>
      
      {/* Instructions */}
      <div className="p-2 border-t border-yellow-500/30 text-gray-500 text-[10px]">
        1. Click Start → 2. Play a round → 3. Click Stop → 4. Copy to clipboard
      </div>
    </div>
  );
}
