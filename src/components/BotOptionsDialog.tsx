import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { setSessionPlayerIntent } from "@/lib/sessionPlayerIntent";
import { getBotAlias } from "@/lib/botAlias";

interface BotPlayer {
  id: string;
  user_id: string;
  position: number;
  sitting_out: boolean;
  waiting?: boolean;
  is_bot: boolean;
  created_at?: string;
  profiles?: {
    username: string;
  };
}

interface BotOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bot: BotPlayer | null;
  players: BotPlayer[];
  onUpdate: () => void;
}

export const BotOptionsDialog = ({
  open,
  onOpenChange,
  bot,
  players,
  onUpdate,
}: BotOptionsDialogProps) => {
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  
  if (!bot) return null;
  
  const botName = getBotAlias(players, bot.user_id);
  const isSittingOut = bot.sitting_out && !bot.waiting;
  
  const handleSitOutNextHand = async () => {
    setUpdating(true);
    setActionError(null);
    try {
      await setSessionPlayerIntent(bot.id, "sit_out_next_hand");
      onUpdate();
      onOpenChange(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not change participation. Please try again.");
    } finally {
      setUpdating(false);
    }
  };
  
  const handleStandUpNextHand = async () => {
    setUpdating(true);
    setActionError(null);
    try {
      // Set flag to remove bot after current hand ends
      await setSessionPlayerIntent(bot.id, "stand_up_next_hand");
      
      onUpdate();
      onOpenChange(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not change participation. Please try again.");
    } finally {
      setUpdating(false);
    }
  };
  
  const handleRejoinNextHand = async () => {
    setUpdating(true);
    setActionError(null);
    try {
      await setSessionPlayerIntent(bot.id, "rejoin");
      onUpdate();
      onOpenChange(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not change participation. Please try again.");
    } finally {
      setUpdating(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[320px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>🤖</span> {botName}
          </DialogTitle>
          <DialogDescription>
            {isSittingOut ? "Bot is sitting out" : bot.waiting ? "Bot is waiting to rejoin" : "Bot is active"}
          </DialogDescription>
        </DialogHeader>
        
        {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
        <div className="flex flex-col gap-2 pt-2">
          {isSittingOut ? (
            <Button
              variant="default"
              onClick={handleRejoinNextHand}
              disabled={updating}
              className="w-full"
            >
              Rejoin Next Hand
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleSitOutNextHand}
              disabled={updating}
              className="w-full"
            >
              Sit Out Next Hand
            </Button>
          )}
          
          <Button
            variant="destructive"
            onClick={handleStandUpNextHand}
            disabled={updating}
            className="w-full"
          >
            Stand Up Next Hand
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
