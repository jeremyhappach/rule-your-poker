import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";

interface PlayerOptionsMenuProps {
  isSittingOut: boolean;
  autoAnte: boolean;
  sitOutNextHand: boolean;
  standUpNextHand: boolean;
  onAutoAnteChange: (value: boolean) => void;
  onSitOutNextHandChange: (value: boolean) => void;
  onStandUpNextHandChange: (value: boolean) => void;
  onStandUpNow: () => void;
  onLeaveGameNow: () => void;
  variant?: 'mobile' | 'desktop';
  // Host pause/resume props
  isHost?: boolean;
  isPaused?: boolean;
  onTogglePause?: () => void;
}

export const PlayerOptionsMenu = ({
  isSittingOut,
  autoAnte,
  sitOutNextHand,
  standUpNextHand,
  onAutoAnteChange,
  onSitOutNextHandChange,
  onStandUpNextHandChange,
  onStandUpNow,
  onLeaveGameNow,
  variant = 'desktop',
  isHost = false,
  isPaused = false,
  onTogglePause,
}: PlayerOptionsMenuProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className={variant === 'mobile' 
            ? "h-8 w-8 text-slate-900 hover:text-slate-700 hover:bg-slate-200/50" 
            : "h-9 w-9 text-muted-foreground hover:text-foreground"
          }
        >
          <Settings className={variant === 'mobile' ? "h-5 w-5" : "h-5 w-5"} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="start" 
        className="w-56 bg-popover border border-border z-50"
      >
        {/* Host pause/resume option */}
        {isHost && onTogglePause && (
          <>
            <DropdownMenuItem onClick={onTogglePause}>
              {isPaused ? '▶️ Resume Game' : '⏸️ Pause Game'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        
        <DropdownMenuCheckboxItem
          checked={autoAnte}
          onCheckedChange={onAutoAnteChange}
        >
          Auto Ante
        </DropdownMenuCheckboxItem>
        
        <DropdownMenuCheckboxItem
          checked={sitOutNextHand}
          onCheckedChange={onSitOutNextHandChange}
        >
          Sit Out Next Hand
        </DropdownMenuCheckboxItem>
        
        <DropdownMenuCheckboxItem
          checked={standUpNextHand}
          onCheckedChange={onStandUpNextHandChange}
        >
          Stand Up Next Hand
        </DropdownMenuCheckboxItem>
        
        {isSittingOut && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onStandUpNow}>
              Stand Up Now
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={onLeaveGameNow}
              className="text-destructive focus:text-destructive"
            >
              Leave Game Now
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
