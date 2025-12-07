import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

interface BotPlayer {
  id: string;
  position: number;
  sitting_out: boolean;
  waiting?: boolean;
  profiles?: {
    username: string;
  };
}

interface BotOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bot: BotPlayer | null;
  onUpdate: () => void;
}

export const BotOptionsDialog = ({
  open,
  onOpenChange,
  bot,
  onUpdate,
}: BotOptionsDialogProps) => {
  const [updating, setUpdating] = useState(false);
  
  if (!bot) return null;
  
  const botName = bot.profiles?.username || `Bot ${bot.position}`;
  
  const handleSitOutChange = async (sitOut: boolean) => {
    setUpdating(true);
    try {
      await supabase
        .from('players')
        .update({ 
          sitting_out: sitOut,
          waiting: sitOut ? false : bot.waiting, // Clear waiting if sitting out
          sit_out_next_hand: false,
          stand_up_next_hand: false,
        })
        .eq('id', bot.id);
      onUpdate();
    } finally {
      setUpdating(false);
    }
  };
  
  const handleRemoveBot = async () => {
    setUpdating(true);
    try {
      // Delete bot's player record
      await supabase
        .from('players')
        .delete()
        .eq('id', bot.id);
      
      // Also delete bot's profile
      await supabase
        .from('profiles')
        .delete()
        .eq('id', bot.id);
      
      onUpdate();
      onOpenChange(false);
    } finally {
      setUpdating(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>🤖</span> {botName} Options
          </DialogTitle>
          <DialogDescription>
            Control this bot player's status
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="sit-out">Sitting Out</Label>
            <Switch
              id="sit-out"
              checked={bot.sitting_out}
              onCheckedChange={handleSitOutChange}
              disabled={updating}
            />
          </div>
          
          <div className="text-sm text-muted-foreground">
            {bot.sitting_out 
              ? "Bot is currently sitting out and will not participate in hands."
              : "Bot is active and will participate in hands."
            }
          </div>
        </div>
        
        <DialogFooter className="flex gap-2">
          <Button
            variant="destructive"
            onClick={handleRemoveBot}
            disabled={updating}
          >
            Remove Bot
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};