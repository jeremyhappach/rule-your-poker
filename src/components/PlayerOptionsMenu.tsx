import { useRef, useState } from "react";
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
  autoAnteRunback: boolean;
  sitOutNextHand: boolean;
  standUpNextHand: boolean;
  onAutoAnteChange: (value: boolean) => void;
  onAutoAnteRunbackChange: (value: boolean) => void;
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
  onAddBot?: () => void | Promise<void>;
  canAddBot?: boolean;
  onEndSession?: () => void;
  // Admin-only, fake-money-only destructive session teardown. The caller must
  // enforce the visibility predicate; the database enforces it again.
  canBlastGame?: boolean;
  onBlastGame?: () => void;
  // Deck color mode props
  deckColorMode?: 'two_color' | 'four_color';
  onDeckColorModeChange?: (mode: 'two_color' | 'four_color') => void;
}

export const PlayerOptionsMenu = ({
  isSittingOut,
  isObserver,
  waiting,
  autoAnte,
  autoAnteRunback,
  sitOutNextHand,
  standUpNextHand,
  onAutoAnteChange,
  onAutoAnteRunbackChange,
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
  canBlastGame = false,
  onBlastGame,
  deckColorMode,
  onDeckColorModeChange,
}: PlayerOptionsMenuProps) => {
  // Add Bot pending state. One tap = exactly one authoritative attempt:
  // the item is disabled while in flight (no duplicate creation) and the
  // pending state ALWAYS clears in `finally` (never latches), so a
  // failure leaves the action retryable.
  //
  // Success confirmation is the table itself: the owner resolves only once
  // the canonical player projection has observed the new bot, and only then
  // do we close the menu so the yellow waiting seat is visible. On failure
  // the owner throws (after its own destructive toast) and the menu stays
  // open — never a false implication of success.
  const [open, setOpen] = useState(false);
  const [addBotPending, setAddBotPending] = useState(false);
  const addBotInFlightRef = useRef(false);
  const runAddBot = async () => {
    if (!onAddBot || addBotInFlightRef.current) return;
    addBotInFlightRef.current = true;
    setAddBotPending(true);
    try {
      await onAddBot();
      setOpen(false);
    } catch {
      // Failure surfaced by the authoritative owner; keep the menu open.
    } finally {
      addBotInFlightRef.current = false;
      setAddBotPending(false);
    }
  };

  
  // Check if we're in the waiting phase (before game starts)
  const isWaitingPhase = gameStatus === 'waiting';
  
  // Observers see 4-color deck toggle + Leave Game Now
  if (isObserver) {
    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
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
          className="w-56 bg-popover border border-border z-[9999]"
        >
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
          {canBlastGame && onBlastGame && (
            <>
              <DropdownMenuItem
                onSelect={() => onBlastGame()}
                className="text-destructive focus:text-destructive"
              >
                💥 Blast This Game
              </DropdownMenuItem>
            </>
          )}
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
      <DropdownMenu open={open} onOpenChange={setOpen}>
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
          className="w-56 bg-popover border border-border z-[9999]"
        >
          {/* Host Add Bot option */}
          {isHost && onAddBot && canAddBot && (
            <>
              <DropdownMenuItem
                disabled={addBotPending}
                onSelect={(e) => {
                  e.preventDefault();
                  void runAddBot();
                }}
              >
                {addBotPending ? '🤖 Adding bot…' : '🤖 Add Bot'}
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
          {canBlastGame && onBlastGame && (
            <>
              <DropdownMenuItem
                onSelect={() => onBlastGame()}
                className="text-destructive focus:text-destructive"
              >
                💥 Blast This Game
              </DropdownMenuItem>
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
    <DropdownMenu open={open} onOpenChange={setOpen}>
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
        className="w-56 bg-popover border border-border z-[9999]"
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
                disabled={addBotPending}
                onSelect={(e) => {
                  e.preventDefault();
                  void runAddBot();
                }}
              >
                {addBotPending ? '🤖 Adding bot…' : '🤖 Add Bot'}
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

        {canBlastGame && onBlastGame && (
          <>
            <DropdownMenuItem
              onSelect={() => onBlastGame()}
              className="text-destructive focus:text-destructive"
            >
              💥 Blast This Game
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        
        <DropdownMenuCheckboxItem
          checked={autoAnte}
          onCheckedChange={onAutoAnteChange}
        >
          Auto Ante (All)
        </DropdownMenuCheckboxItem>
        
        <DropdownMenuCheckboxItem
          checked={autoAnteRunback}
          onCheckedChange={onAutoAnteRunbackChange}
        >
          Auto Ante (Run it Back)
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
