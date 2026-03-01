/**
 * YahtzeeOverlays – Brief overlays for Yahtzee! roll, Upper Bonus earned, and game winner.
 */

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  YAHTZEE! overlay (all 5 dice same)                                 */
/* ------------------------------------------------------------------ */
interface YahtzeeRollOverlayProps {
  playerName: string;
  visible: boolean;
  onDone: () => void;
}

export function YahtzeeRollOverlay({ playerName, visible, onDone }: YahtzeeRollOverlayProps) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [visible, onDone]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none animate-fade-in">
      <div className="bg-amber-900/90 rounded-2xl px-8 py-5 border-2 border-poker-gold shadow-2xl text-center animate-scale-in">
        <p className="text-3xl font-black text-poker-gold tracking-wider mb-1">YAHTZEE!</p>
        <p className="text-amber-200 text-sm font-semibold">{playerName} rolled a Yahtzee!</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Upper Bonus overlay                                                */
/* ------------------------------------------------------------------ */
interface UpperBonusOverlayProps {
  playerName: string;
  visible: boolean;
  onDone: () => void;
}

export function UpperBonusOverlay({ playerName, visible, onDone }: UpperBonusOverlayProps) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [visible, onDone]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none animate-fade-in">
      <div className="bg-green-900/90 rounded-2xl px-8 py-5 border-2 border-green-400 shadow-2xl text-center animate-scale-in">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Check className="w-6 h-6 text-green-400" />
          <p className="text-2xl font-black text-green-400 tracking-wider">UPPER BONUS!</p>
        </div>
        <p className="text-green-200 text-sm font-semibold">{playerName} earned +35 bonus</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Winner overlay with confetti                                       */
/* ------------------------------------------------------------------ */
interface WinnerOverlayProps {
  winnerName: string;
  scores: { name: string; total: number }[];
  isWinnerMe: boolean;
  visible: boolean;
  onDone: () => void;
}

export function WinnerOverlay({ winnerName, scores, isWinnerMe, visible, onDone }: WinnerOverlayProps) {
  useEffect(() => {
    if (!visible) return;

    // Confetti only for the winner's screen
    if (isWinnerMe) {
      const end = Date.now() + 2500;
      const fire = () => {
        confetti({
          particleCount: 80,
          startVelocity: 30,
          spread: 120,
          origin: { x: Math.random(), y: Math.random() * 0.4 },
        });
        if (Date.now() < end) requestAnimationFrame(fire);
      };
      fire();
    }

    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [visible, isWinnerMe, onDone]);

  if (!visible) return null;

  const scoreLine = scores.map(s => `${s.name}: ${s.total}`).join('  vs  ');

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none animate-fade-in">
      <div className="bg-amber-900/95 rounded-2xl px-8 py-6 border-2 border-poker-gold shadow-2xl text-center animate-scale-in max-w-[320px]">
        <p className="text-2xl font-black text-poker-gold tracking-wider mb-2">
          {winnerName} Wins!
        </p>
        <p className="text-amber-200 text-base font-bold">{scoreLine}</p>
      </div>
    </div>
  );
}
