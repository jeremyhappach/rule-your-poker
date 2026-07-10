/**
 * WaitingRoomCTA — shared presentational waiting-room overlay.
 *
 * Renders the canonical "Choose a Seat" / "Waiting for Players" /
 * "Ready to Start" CTA box. Consumed identically by the legacy
 * `WaitingForPlayersTable` (poker-variant family) AND the canonical
 * shell waiting surface (Cribbage / Gin Rummy / Yahtzee). Single
 * implementation prevents drift between the two waiting paths.
 *
 * Pure presentational: all behavior comes from `useWaitingRoomActions`.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Users, Bot, Loader2, LogIn } from "lucide-react";


export interface WaitingRoomCTAProps {
  isObserver: boolean;
  isHost: boolean;
  hasEnoughPlayers: boolean;
  hasOpenSeats: boolean;
  seatedPlayerCount: number;
  realMoney: boolean;
  isAddingBot: boolean;
  viewerNeedsRejoin?: boolean;
  viewerIsWaitingToRejoin?: boolean;
  isRejoining?: boolean;
  onInvite: () => void;
  onAddBot: () => void;
  onStartGame: () => void;
  onRejoin?: () => void;
}

export function WaitingRoomCTA({
  isObserver,
  isHost,
  hasEnoughPlayers,
  hasOpenSeats,
  seatedPlayerCount,
  realMoney,
  isAddingBot,
  viewerNeedsRejoin = false,
  viewerIsWaitingToRejoin = false,
  isRejoining = false,
  onInvite,
  onAddBot,
  onStartGame,
  onRejoin,
}: WaitingRoomCTAProps) {
  const [isStarting, setIsStarting] = useState(false);
  const handleStartClick = () => {
    if (isStarting) return;
    setIsStarting(true);
    try {
      onStartGame();
    } finally {
      // Safety reset if we don't unmount from the session transition.
      setTimeout(() => setIsStarting(false), 8000);
    }
  };

  // Recovery-waiting affordance: seated viewer who is sat out needs an
  // explicit rejoin path before Start Game preconditions can include them.
  if (viewerNeedsRejoin && onRejoin) {
    return (
      <div className="bg-black/70 backdrop-blur-sm rounded-xl px-6 py-4 border border-amber-600/50 max-w-xs text-center pointer-events-auto">
        <Users className="w-8 h-8 text-amber-400 mx-auto mb-2" />
        <p className="text-amber-300 font-bold text-lg mb-1">You're Sitting Out</p>
        <p className="text-amber-300/70 text-sm mb-3">
          Rejoin to be included when the next game starts.
        </p>
        <Button
          onClick={onRejoin}
          disabled={isRejoining}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold"
        >
          {isRejoining ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Rejoining…</>
          ) : (
            <><LogIn className="w-4 h-4 mr-2" />Rejoin Game</>
          )}
        </Button>
      </div>
    );
  }
  if (viewerIsWaitingToRejoin) {
    return (
      <div className="bg-black/70 backdrop-blur-sm rounded-xl px-6 py-4 border border-amber-600/50 max-w-xs text-center pointer-events-auto">
        <Users className="w-8 h-8 text-amber-400 mx-auto mb-2" />
        <p className="text-amber-300 font-bold text-lg mb-1">Queued to Rejoin</p>
        <p className="text-green-300 text-sm">
          You'll be dealt in when the next game starts.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-black/70 backdrop-blur-sm rounded-xl px-6 py-4 border border-amber-600/50 max-w-xs text-center pointer-events-auto">
      <Users className="w-8 h-8 text-amber-400 mx-auto mb-2" />
      {isObserver ? (
        <>
          <p className="text-amber-300 font-bold text-lg mb-1">Choose a Seat!</p>
          <p className="text-amber-300/70 text-sm">
            Game starts when 2+ players are seated
          </p>
        </>
      ) : (
        <>
          <p className="text-amber-300 font-bold text-lg mb-1">
            {hasEnoughPlayers ? "Ready to Start!" : "Waiting for Players"}
          </p>
          <p className="text-amber-300/70 text-sm mb-3">
            {hasEnoughPlayers
              ? isHost
                ? "Click Start Game to begin"
                : "Waiting for host to start game"
              : `${seatedPlayerCount}/2+ players seated`}
          </p>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={onInvite}
                className="border-amber-600 text-amber-300 hover:bg-amber-600/20"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Invite
              </Button>
              {isHost && hasOpenSeats && !realMoney && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={isAddingBot}
                  aria-busy={isAddingBot}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    const startBtn = document.querySelector(
                      "[data-start-game-btn]",
                    ) as HTMLButtonElement | null;
                    if (startBtn) startBtn.focus();
                    onAddBot();
                  }}
                  className="border-amber-600 bg-transparent text-amber-300 hover:bg-amber-600/20 hover:text-amber-300 focus-visible:bg-amber-600/10 focus-visible:text-amber-300 active:bg-amber-600/20 active:text-amber-300 disabled:opacity-70"
                >
                  {isAddingBot ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Adding…
                    </>
                  ) : (
                    <>
                      <Bot className="w-4 h-4 mr-2" />
                      Add Bot
                    </>
                  )}
                </Button>
              )}
            </div>
            {isHost && hasEnoughPlayers && (
              <Button
                data-start-game-btn
                onClick={handleStartClick}
                disabled={isStarting}
                aria-busy={isStarting}
                className="bg-amber-600 hover:bg-amber-700 text-black font-bold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isStarting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting…</>
                ) : (
                  <>🃏 Start Game</>
                )}
              </Button>
            )}

          </div>
        </>
      )}
    </div>
  );
}
