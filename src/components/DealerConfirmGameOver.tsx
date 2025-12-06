import { Button } from "@/components/ui/button";

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
  // Parse result message to extract debug data
  let displayMessage = resultMessage || '';
  let debugData: DebugData | null = null;
  
  if (resultMessage && resultMessage.includes('|||DEBUG:')) {
    const parts = resultMessage.split('|||DEBUG:');
    displayMessage = parts[0];
    try {
      debugData = JSON.parse(parts[1]);
    } catch (e) {
      console.error('Failed to parse debug data:', e);
    }
  }

  return (
    <div className="bg-gradient-to-br from-amber-900/95 to-amber-950/95 rounded-xl p-4 border-2 border-poker-gold shadow-2xl text-center space-y-3 max-w-lg">
      {displayMessage && (
        <p className="text-poker-gold font-black text-lg animate-pulse">
          {displayMessage}
        </p>
      )}
      
      {/* Debug Info Panel */}
      {debugData && (
        <div className="bg-black/50 rounded-lg p-3 text-left text-xs font-mono border border-yellow-500/50">
          <p className="text-yellow-400 font-bold mb-2 text-center">🔍 DEBUG: Round {debugData.roundId?.substring(0, 8)}...</p>
          <p className="text-gray-300 mb-2">Community: <span className="text-white">{debugData.communityCards}</span></p>
          
          <div className="space-y-2">
            {debugData.evaluations?.map((evalData, idx) => (
              <div 
                key={idx} 
                className={`p-2 rounded ${evalData.name === debugData?.winnerName ? 'bg-green-900/50 border border-green-500' : 'bg-gray-800/50 border border-gray-600'}`}
              >
                <p className="text-amber-300 font-bold">{evalData.name} {evalData.name === debugData?.winnerName && '👑 WINNER'}</p>
                <p className="text-gray-300">Cards: <span className="text-white">{evalData.cards}</span></p>
                <p className="text-gray-300">Hand: <span className="text-cyan-400">{evalData.handDesc}</span></p>
                <p className="text-gray-300">
                  Value: <span className={evalData.value === debugData?.maxValue ? 'text-green-400 font-bold' : 'text-red-400'}>{evalData.value}</span>
                  {evalData.value === debugData?.maxValue && ' (MAX)'}
                </p>
                <p className="text-gray-400">Rank: {evalData.rank}</p>
              </div>
            ))}
          </div>
          
          <p className="text-gray-400 mt-2 text-center">Max Value: {debugData.maxValue}</p>
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
