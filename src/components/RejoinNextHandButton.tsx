import { Button } from "@/components/ui/button";
import { handlePlayerRejoin } from "@/lib/playerStateEvaluation";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface RejoinNextHandButtonProps {
  playerId: string;
  onRejoinRequested?: () => void;
}

export const RejoinNextHandButton = ({ playerId, onRejoinRequested }: RejoinNextHandButtonProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    
    const success = await handlePlayerRejoin(playerId);
    
    if (success) {
      toast({
        title: "Rejoining",
        description: "You'll be dealt in at the next hand",
      });
      onRejoinRequested?.();
    } else {
      toast({
        title: "Error",
        description: "Failed to request rejoin",
        variant: "destructive",
      });
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
