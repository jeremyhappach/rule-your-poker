import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface DebugEvaluation {
  name: string;
  cards: string;
  handDesc: string;
  value: number;
  rank: string;
}

interface DebugData {
  roundId: string;
  communityCards: string;
  evaluations: DebugEvaluation[];
  winnerId: string;
  winnerName: string;
  maxValue: number;
}

interface DealerConfirmGameOverProps {
  isDealer: boolean;
  onConfirm: () => void;
  resultMessage?: string | null;
}

export const DealerConfirmGameOver = ({ 
  isDealer, 
  onConfirm,
  resultMessage
}: DealerConfirmGameOverProps) => {
  const [copied, setCopied] = useState(false);
  
  // Parse result message to extract debug data
  let displayMessage = resultMessage ? resultMessage.split('|||')[0] : '';
  let debugData: DebugData | null = null;
  let rawDebugJson = '';
  
  if (resultMessage && resultMessage.includes('|||DEBUG:')) {
    const parts = resultMessage.split('|||DEBUG:');
    rawDebugJson = parts[1] || '';
    try {
      debugData = JSON.parse(rawDebugJson);
    } catch (e) {
      console.error('Failed to parse debug data:', e);
    }
  }

  const handleCopy = () => {
    // Format debug data with line breaks for readability
    let formattedDebug = '';
    if (debugData) {
      formattedDebug = `=== HOLM SHOWDOWN DEBUG ===\n`;
      formattedDebug += `Round ID: ${debugData.roundId}\n`;
      formattedDebug += `Community Cards: ${debugData.communityCards}\n`;
      formattedDebug += `\n--- EVALUATIONS ---\n`;
      debugData.evaluations?.forEach((evalData, idx) => {
        formattedDebug += `\nPlayer ${idx + 1}: ${evalData.name}`;
        if (evalData.name === debugData?.winnerName) formattedDebug += ' (WINNER)';
        formattedDebug += `\n  Cards: ${evalData.cards}`;
        formattedDebug += `\n  Hand: ${evalData.handDesc}`;
        formattedDebug += `\n  Rank: ${evalData.rank}`;
        formattedDebug += `\n  Value: ${evalData.value}`;
        if (evalData.value === debugData?.maxValue) formattedDebug += ' (MAX)';
        formattedDebug += '\n';
      });
      formattedDebug += `\nMax Value: ${debugData.maxValue}`;
      formattedDebug += `\nWinner: ${debugData.winnerName}`;
    } else {
      formattedDebug = rawDebugJson;
    }
    
    navigator.clipboard.writeText(formattedDebug);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gradient-to-br from-amber-900/95 to-amber-950/95 rounded-xl p-4 border-2 border-poker-gold shadow-2xl text-center space-y-3 max-w-2xl">
      {displayMessage && (
        <p className="text-poker-gold font-black text-lg animate-pulse">
          {displayMessage}
        </p>
      )}
      
      {/* Debug Info Panel */}
      {debugData && (
        <div className="bg-black/80 rounded-lg p-4 text-left text-sm font-mono border border-yellow-500/50 mt-3 max-h-80 overflow-y-auto">
          <div className="flex justify-between items-center mb-3">
            <p className="text-yellow-400 font-bold text-base">
              🔍 DEBUG INFO
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              className="h-7 px-2 text-xs border-yellow-500 text-yellow-400 hover:bg-yellow-500/20"
            >
              {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          
          <div className="space-y-1 text-xs">
            <p className="text-gray-300">
              Round: <span className="text-white">{debugData.roundId?.substring(0, 8)}...</span>
            </p>
            <p className="text-gray-300">
              Community: <span className="text-white">{debugData.communityCards}</span>
            </p>
          </div>
          
          <div className="mt-3 space-y-3">
            {debugData.evaluations?.map((evalData, idx) => (
              <div 
                key={idx} 
                className={`p-3 rounded ${evalData.name === debugData?.winnerName ? 'bg-green-900/60 border-2 border-green-500' : 'bg-gray-800/60 border border-gray-600'}`}
              >
                <p className="text-amber-300 font-bold mb-2">
                  {evalData.name} {evalData.name === debugData?.winnerName && '👑 WINNER'}
                </p>
                <div className="grid grid-cols-1 gap-1 text-xs">
                  <p className="text-gray-300">
                    Cards: <span className="text-white font-bold">{evalData.cards}</span>
                  </p>
                  <p className="text-gray-300">
                    Hand: <span className="text-cyan-400 font-bold">{evalData.handDesc}</span>
                  </p>
                  <p className="text-gray-300">
                    Rank: <span className="text-purple-400">{evalData.rank}</span>
                  </p>
                  <p className="text-gray-300">
                    Value: <span className={evalData.value === debugData?.maxValue ? 'text-green-400 font-bold' : 'text-red-400'}>{evalData.value}</span>
                    {evalData.value === debugData?.maxValue && <span className="text-green-400 ml-1">(MAX)</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-3 pt-2 border-t border-gray-600 text-center text-xs">
            <p className="text-gray-400">
              Max Value: <span className="text-green-400 font-bold">{debugData.maxValue}</span>
            </p>
          </div>
        </div>
      )}
      
      {isDealer ? (
        <Button
          onClick={onConfirm}
          className="bg-poker-gold hover:bg-poker-gold/80 text-black font-bold text-lg px-6 py-3"
        >
          Next Game
        </Button>
      ) : (
        <p className="text-amber-300 text-sm">
          Waiting for dealer to proceed...
        </p>
      )}
    </div>
  );
};
