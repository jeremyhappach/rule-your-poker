import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
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
  
  if (!bot) return null;
  
  const botName = getBotAlias(players, bot.user_id);
  const isSittingOut = bot.sitting_out && !bot.waiting;
  
  const handleSitOutNextHand = async () => {
    setUpdating(true);
    try {
      await supabase
        .from('players')
        .update({ 
          sit_out_next_hand: true,
          stand_up_next_hand: false,
        })
        .eq('id', bot.id);
      onUpdate();
      onOpenChange(false);
    } finally {
      setUpdating(false);
    }
  };
  
  const handleStandUpNextHand = async () => {
    setUpdating(true);
    try {
      // Set flag to remove bot after current hand ends
      await supabase
        .from('players')
        .update({ 
          stand_up_next_hand: true,
          sit_out_next_hand: false,
        })
        .eq('id', bot.id);
      
      onUpdate();
      onOpenChange(false);
    } finally {
      setUpdating(false);
    }
  };
  
  const handleRejoinNextHand = async () => {
    setUpdating(true);
    try {
      await supabase
        .from('players')
        .update({ 
          waiting: true,
          sit_out_next_hand: false,
          stand_up_next_hand: false,
        })
        .eq('id', bot.id);
      onUpdate();
      onOpenChange(false);
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
