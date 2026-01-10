import React, { useEffect, useRef, useState } from 'react';

interface DebugEvent {
  timestamp: number;
  type: string;
  detail: string;
}

interface DiceDebugOverlayProps {
  gameType: 'horses' | 'ship-captain-crew';
  feltDice: any[] | null | undefined;
  rollKey: number | string | undefined;
  isMyTurn: boolean;
  hasRolled: boolean;
  showResult: boolean;
  isRolling: boolean;
  feltBlockMounted: boolean;
}

export const DiceDebugOverlay: React.FC<DiceDebugOverlayProps> = ({
  gameType,
  feltDice,
  rollKey,
  isMyTurn,
  hasRolled,
  showResult,
  isRolling,
  feltBlockMounted,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const prevStateRef = useRef<string>('');

  // Track state changes
  useEffect(() => {
    const currentState = JSON.stringify({
      feltDice: feltDice ? `${feltDice.length} dice` : 'null',
      rollKey,
      isMyTurn,
      hasRolled,
      showResult,
      isRolling,
      feltBlockMounted,
    });

    if (currentState !== prevStateRef.current) {
      const newEvent: DebugEvent = {
        timestamp: Date.now(),
        type: 'STATE_CHANGE',
        detail: `feltDice=${feltDice ? feltDice.length : 'null'}, rollKey=${rollKey}, myTurn=${isMyTurn}, hasRolled=${hasRolled}, showResult=${showResult}, rolling=${isRolling}, mounted=${feltBlockMounted}`,
      };
      
      setEvents(prev => [...prev.slice(-19), newEvent]);
      prevStateRef.current = currentState;
    }
  }, [feltDice, rollKey, isMyTurn, hasRolled, showResult, isRolling, feltBlockMounted]);

  // Toggle with triple-tap on game type indicator
  const tapCountRef = useRef(0);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleToggleTap = () => {
    tapCountRef.current++;
    if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    
    if (tapCountRef.current >= 3) {
      setIsVisible(prev => !prev);
      tapCountRef.current = 0;
    } else {
      tapTimeoutRef.current = setTimeout(() => {
        tapCountRef.current = 0;
      }, 500);
    }
  };

  const feltDiceStatus = feltDice 
    ? `✅ ${feltDice.length} dice` 
    : '❌ null';

  const heldCount = feltDice?.filter(d => d?.held)?.length ?? 0;

  return (
    <>
      {/* Hidden tap target - triple tap the game type badge to toggle */}
      <div 
        onClick={handleToggleTap}
        className="fixed top-2 left-2 w-8 h-8 z-[9999] opacity-0"
        aria-hidden="true"
      />

      {isVisible && (
        <div className="fixed top-12 left-2 right-2 z-[9998] bg-black/90 text-white text-xs font-mono p-3 rounded-lg max-h-[50vh] overflow-auto">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold text-yellow-400">🎲 DICE DEBUG [{gameType.toUpperCase()}]</span>
            <button 
              onClick={() => setIsVisible(false)}
              className="text-red-400 font-bold"
            >
              ✕
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-1 mb-3 text-[10px]">
            <div>feltDice: <span className={feltDice ? 'text-green-400' : 'text-red-400'}>{feltDiceStatus}</span></div>
            <div>held: <span className="text-blue-400">{heldCount}/5</span></div>
            <div>rollKey: <span className="text-purple-400">{rollKey ?? 'undefined'}</span></div>
            <div>isMyTurn: <span className={isMyTurn ? 'text-green-400' : 'text-gray-400'}>{String(isMyTurn)}</span></div>
            <div>hasRolled: <span className={hasRolled ? 'text-green-400' : 'text-gray-400'}>{String(hasRolled)}</span></div>
            <div>showResult: <span className={showResult ? 'text-green-400' : 'text-gray-400'}>{String(showResult)}</span></div>
            <div>isRolling: <span className={isRolling ? 'text-yellow-400' : 'text-gray-400'}>{String(isRolling)}</span></div>
            <div>feltBlockMounted: <span className={feltBlockMounted ? 'text-green-400' : 'text-red-400'}>{String(feltBlockMounted)}</span></div>
          </div>

          <div className="border-t border-gray-600 pt-2">
            <div className="font-bold text-gray-400 mb-1">Recent Events:</div>
            <div className="space-y-1 max-h-32 overflow-auto">
              {events.slice().reverse().map((event, i) => (
                <div key={i} className="text-[9px] text-gray-300">
                  <span className="text-gray-500">{new Date(event.timestamp).toLocaleTimeString()}</span>
                  {' '}{event.detail}
                </div>
              ))}
              {events.length === 0 && <div className="text-gray-500">No events yet</div>}
            </div>
          </div>
          
          <div className="mt-2 text-[9px] text-gray-500">
            Triple-tap top-left corner to toggle
          </div>
        </div>
      )}
    </>
  );
};
