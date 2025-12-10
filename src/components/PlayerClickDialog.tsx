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

interface ClickedPlayer {
  id: string;
  user_id: string;
  position: number;
  sitting_out: boolean;
  waiting?: boolean;
  is_bot: boolean;
  profiles?: {
    username: string;
  };
}

interface PlayerClickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: ClickedPlayer | null;
  gameId: string;
  isHost: boolean;
  currentUserId?: string;
  onUpdate: () => void;
}

export const PlayerClickDialog = ({
  open,
  onOpenChange,
  player,
  gameId,
  isHost,
  currentUserId,
  onUpdate,
}: PlayerClickDialogProps) => {
  const [updating, setUpdating] = useState(false);
  
  if (!player) return null;
  
  const playerName = player.profiles?.username || (player.is_bot ? `Bot ${player.position}` : `Player ${player.position}`);
  const isSittingOut = player.sitting_out && !player.waiting;
  const isClickedPlayerSelf = player.user_id === currentUserId;
  const canMakeHost = isHost && !player.is_bot && !isClickedPlayerSelf;
  
  const handleMakeHost = async () => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('games')
        .update({ current_host: player.user_id })
        .eq('id', gameId);
      
      if (error) throw error;
      
      console.log(`Host changed to ${playerName}`);
      onUpdate();
      onOpenChange(false);
    } catch (error) {
      console.error('Error making host:', error);
    } finally {
      setUpdating(false);
    }
  };
  
  // Bot-specific handlers
  const handleSitOutNextHand = async () => {
    setUpdating(true);
    try {
      await supabase
        .from('players')
        .update({ 
          sit_out_next_hand: true,
          stand_up_next_hand: false,
        })
        .eq('id', player.id);
      onUpdate();
      onOpenChange(false);
    } finally {
      setUpdating(false);
    }
  };
  
  const handleStandUpNextHand = async () => {
    setUpdating(true);
    try {
      // For bots, standing up means removing them entirely
      await supabase
        .from('players')
        .delete()
        .eq('id', player.id);
      
      // Also delete bot's profile if it's a bot
      if (player.is_bot) {
        await supabase
          .from('profiles')
          .delete()
          .eq('id', player.id);
      }
      
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
        .eq('id', player.id);
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
            {player.is_bot && <span>🤖</span>}
            {playerName}
          </DialogTitle>
          <DialogDescription>
            {isSittingOut ? "Sitting out" : player.waiting ? "Waiting to rejoin" : "Active"}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-2 pt-2">
          {/* Make Host option - only for host clicking non-bot, non-self players */}
          {canMakeHost && (
            <Button
              variant="default"
              onClick={handleMakeHost}
              disabled={updating}
              className="w-full bg-amber-600 hover:bg-amber-700"
            >
              Make Host
            </Button>
          )}
          
          {/* Bot control options - only for bots */}
          {player.is_bot && isHost && (
            <>
              {isSittingOut ? (
                <Button
                  variant="outline"
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
                Remove Bot
              </Button>
            </>
          )}
          
          {/* If no actions available */}
          {!canMakeHost && !player.is_bot && (
            <p className="text-sm text-muted-foreground text-center py-2">
              No actions available for this player
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
