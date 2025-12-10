import { Button } from "@/components/ui/button";
import { handlePlayerRejoin } from "@/lib/playerStateEvaluation";
import { useState } from "react";

interface RejoinNextHandButtonProps {
  playerId: string;
  onRejoinRequested?: () => void;
}

export const RejoinNextHandButton = ({ playerId, onRejoinRequested }: RejoinNextHandButtonProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    
    const success = await handlePlayerRejoin(playerId);
    
    if (success) {
      console.log('Rejoin requested successfully');
      onRejoinRequested?.();
    } else {
      console.error('Failed to request rejoin');
    }
    
    setIsLoading(false);
  };

  return (
    <Button
      onClick={handleClick}
      disabled={isLoading}
      variant="default"
      className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3"
    >
      {isLoading ? "Rejoining..." : "Rejoin Next Hand"}
    </Button>
  );
};
