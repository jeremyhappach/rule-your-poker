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
  // Game status to adjust available options
  gameStatus?: string;
  // Host props
  isHost?: boolean;
  isPaused?: boolean;
  onTogglePause?: () => void;
  onAddBot?: () => void;
  canAddBot?: boolean;
  onEndSession?: () => void;
  // Deck color mode props
  deckColorMode?: 'two_color' | 'four_color';
  onDeckColorModeChange?: (mode: 'two_color' | 'four_color') => void;
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
  gameStatus,
  isHost = false,
  isPaused = false,
  onTogglePause,
  onAddBot,
  canAddBot = false,
  onEndSession,
  deckColorMode,
  onDeckColorModeChange,
}: PlayerOptionsMenuProps) => {
  // Debug logging for Add Bot visibility
  console.log('[PLAYER OPTIONS MENU] Rendering with:', {
    isHost,
    canAddBot,
    hasOnAddBot: !!onAddBot,
    gameStatus,
    isObserver,
    isWaitingPhase: gameStatus === 'waiting'
  });
  
  // Check if we're in the waiting phase (before game starts)
  const isWaitingPhase = gameStatus === 'waiting';
  
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

  // During waiting phase, only show Stand Up Now and Leave Game Now
  if (isWaitingPhase) {
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
          {/* Host Add Bot option */}
          {isHost && onAddBot && canAddBot && (
            <>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  console.log('[PLAYER OPTIONS MENU] Add Bot selected in waiting phase');
                  void onAddBot();
                }}
              >
                🤖 Add Bot
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          
          {/* Deck color mode toggle */}
          {deckColorMode && onDeckColorModeChange && (
            <>
              <DropdownMenuCheckboxItem
                checked={deckColorMode === 'four_color'}
                onCheckedChange={(checked) => onDeckColorModeChange(checked ? 'four_color' : 'two_color')}
              >
                4-Color Deck
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
            </>
          )}
          
          <DropdownMenuItem onClick={onStandUpNow}>
            Stand Up Now
          </DropdownMenuItem>
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
        {/* Host pause/resume, add bot, and end session options */}
        {isHost && (onTogglePause || (onAddBot && canAddBot) || onEndSession) && (
          <>
            {onTogglePause && (
              <DropdownMenuItem onClick={onTogglePause}>
                {isPaused ? '▶️ Resume Game' : '⏸️ Pause Game'}
              </DropdownMenuItem>
            )}
            {onAddBot && canAddBot && (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  console.log('[PLAYER OPTIONS MENU] Add Bot selected in active game');
                  void onAddBot();
                }}
              >
                🤖 Add Bot
              </DropdownMenuItem>
            )}
            {onEndSession && (
              <DropdownMenuItem 
                onClick={onEndSession}
                className="text-destructive focus:text-destructive"
              >
                🛑 End Session
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
        
        {/* Deck color mode toggle */}
        {deckColorMode && onDeckColorModeChange && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={deckColorMode === 'four_color'}
              onCheckedChange={(checked) => onDeckColorModeChange(checked ? 'four_color' : 'two_color')}
            >
              4-Color Deck
            </DropdownMenuCheckboxItem>
          </>
        )}
        
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