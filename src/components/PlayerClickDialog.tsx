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

interface ClickedPlayer {
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

interface PlayerClickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: ClickedPlayer | null;
  players: ClickedPlayer[];
  gameId: string;
  isHost: boolean;
  currentUserId?: string;
  onUpdate: () => void;
}

export const PlayerClickDialog = ({
  open,
  onOpenChange,
  player,
  players,
  gameId,
  isHost,
  currentUserId,
  onUpdate,
}: PlayerClickDialogProps) => {
  const [updating, setUpdating] = useState(false);
  
  if (!player) return null;
  
  const playerName = player.is_bot 
    ? getBotAlias(players, player.user_id) 
    : (player.profiles?.username || `Player ${player.position}`);
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
      // Set flag to remove bot after current hand ends
      await supabase
        .from('players')
        .update({ 
          stand_up_next_hand: true,
          sit_out_next_hand: false,
        })
        .eq('id', player.id);
      
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
