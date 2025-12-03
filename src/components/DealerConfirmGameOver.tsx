import { Button } from "@/components/ui/button";

interface DealerConfirmGameOverProps {
  isDealer: boolean;
  onConfirm: () => void;
}

export const DealerConfirmGameOver = ({ 
  isDealer, 
  onConfirm 
}: DealerConfirmGameOverProps) => {
  return (
    <div className="bg-gradient-to-br from-amber-900/95 to-amber-950/95 rounded-xl p-4 border-2 border-poker-gold shadow-2xl text-center">
      {isDealer ? (
        <Button
          onClick={onConfirm}
          className="bg-poker-gold hover:bg-poker-gold/80 text-black font-bold text-lg px-6 py-3"
        >
          Start Next Game
        </Button>
      ) : (
        <p className="text-amber-300 text-sm">
          Waiting for dealer to proceed...
        </p>
      )}
    </div>
  );
};
