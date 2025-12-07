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
  mobileView: boolean;
  onAutoAnteChange: (value: boolean) => void;
  onSitOutNextHandChange: (value: boolean) => void;
  onStandUpNextHandChange: (value: boolean) => void;
  onMobileViewChange: (value: boolean) => void;
  onStandUpNow: () => void;
  onLeaveGameNow: () => void;
  variant?: 'mobile' | 'desktop';
}

export const PlayerOptionsMenu = ({
  isSittingOut,
  autoAnte,
  sitOutNextHand,
  standUpNextHand,
  mobileView,
  onAutoAnteChange,
  onSitOutNextHandChange,
  onStandUpNextHandChange,
  onMobileViewChange,
  onStandUpNow,
  onLeaveGameNow,
  variant = 'desktop',
}: PlayerOptionsMenuProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className={variant === 'mobile' 
            ? "h-8 w-8 text-white/70 hover:text-white hover:bg-white/10" 
            : "h-9 w-9 text-muted-foreground hover:text-foreground"
          }
        >
          <Settings className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="start" 
        className="w-56 bg-popover border border-border z-50"
      >
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
        
        <DropdownMenuSeparator />
        
        <DropdownMenuCheckboxItem
          checked={mobileView}
          onCheckedChange={onMobileViewChange}
        >
          Mobile View
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
