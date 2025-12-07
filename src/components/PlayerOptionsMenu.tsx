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
  isObserver: boolean;
  waiting: boolean;
  autoAnte: boolean;
  sitOutNextHand: boolean;
  standUpNextHand: boolean;
  onAutoAnteChange: (value: boolean) => void;
  onSitOutNextHandChange: (value: boolean) => void;
  onStandUpNextHandChange: (value: boolean) => void;
  onStandUpNow: () => void;
  onLeaveGameNow: () => void;
  variant?: 'mobile' | 'desktop';
  // Host props
  isHost?: boolean;
  isPaused?: boolean;
  onTogglePause?: () => void;
  onAddBot?: () => void;
  canAddBot?: boolean;
}

export const PlayerOptionsMenu = ({
  isSittingOut,
  isObserver,
  waiting,
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
  onAddBot,
  canAddBot = false,
}: PlayerOptionsMenuProps) => {
  // Observers only see Leave Game Now option
  if (isObserver) {
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
          <DropdownMenuItem 
            onClick={onLeaveGameNow}
            className="text-destructive focus:text-destructive"
          >
            Leave Game Now
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Disable "Sit Out Next Hand" if already sitting out and not waiting
  const sitOutDisabled = isSittingOut && !waiting;

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
        {/* Host pause/resume and add bot options */}
        {isHost && (onTogglePause || (onAddBot && canAddBot)) && (
          <>
            {onTogglePause && (
              <DropdownMenuItem onClick={onTogglePause}>
                {isPaused ? '▶️ Resume Game' : '⏸️ Pause Game'}
              </DropdownMenuItem>
            )}
            {onAddBot && canAddBot && (
              <DropdownMenuItem onClick={onAddBot}>
                🤖 Add Bot
              </DropdownMenuItem>
            )}
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
          disabled={sitOutDisabled}
          className={sitOutDisabled ? "opacity-50 cursor-not-allowed" : ""}
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