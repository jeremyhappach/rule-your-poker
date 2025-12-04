import { Button } from "@/components/ui/button";

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
  return (
    <div className="bg-gradient-to-br from-amber-900/95 to-amber-950/95 rounded-xl p-4 border-2 border-poker-gold shadow-2xl text-center space-y-3">
      {resultMessage && (
        <p className="text-poker-gold font-black text-lg animate-pulse">
          {resultMessage}
        </p>
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
