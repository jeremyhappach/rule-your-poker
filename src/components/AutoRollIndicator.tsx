import { Bot } from "lucide-react";

interface AutoRollIndicatorProps {
  /** Position side relative to chip stack */
  isRightSide?: boolean;
}

/**
 * Visual indicator shown next to a player's chip stack when they are in "auto-roll" mode
 * for dice games. Uses a robot icon to indicate the player's turns are being auto-completed.
 */
export const AutoRollIndicator = ({ isRightSide = false }: AutoRollIndicatorProps) => {
  return (
    <div 
      className="absolute z-30" 
      style={{
        // Position to overlap the chipstack edge like leg indicators
        ...(isRightSide 
          ? { left: '6px', top: '50%', transform: 'translateY(-50%) translateX(-100%)' }
          : { right: '6px', top: '50%', transform: 'translateY(-50%) translateX(100%)' }
        )
      }}
    >
      <div className="w-5 h-5 rounded-full bg-slate-700 border-2 border-amber-400 flex items-center justify-center shadow-lg">
        <Bot className="w-3 h-3 text-amber-400" />
      </div>
    </div>
  );
};
