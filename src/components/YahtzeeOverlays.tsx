/**
 * YahtzeeOverlays – Brief overlays for Yahtzee! roll, Upper Bonus earned, and game winner.
 */

import { useEffect, useRef, useState } from "react";
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
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => onDoneRef.current(), 2500);
    return () => clearTimeout(t);
  }, [visible]);

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
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => onDoneRef.current(), 2500);
    return () => clearTimeout(t);
  }, [visible]);

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
/*  Yahtzee Bonus overlay (+100 for second+ Yahtzee)                   */
/* ------------------------------------------------------------------ */
interface YahtzeeBonusOverlayProps {
  playerName: string;
  bonusCount: number; // which bonus (1st = +100, 2nd = +200 total, etc.)
  visible: boolean;
  onDone: () => void;
}

export function YahtzeeBonusOverlay({ playerName, bonusCount, visible, onDone }: YahtzeeBonusOverlayProps) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => onDoneRef.current(), 2500);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none animate-fade-in">
      <div className="bg-amber-900/90 rounded-2xl px-8 py-5 border-2 border-poker-gold shadow-2xl text-center animate-scale-in">
        <p className="text-2xl font-black text-poker-gold tracking-wider mb-1">YAHTZEE BONUS!</p>
        <p className="text-amber-200 text-base font-bold">+100 points</p>
        <p className="text-amber-300/80 text-sm font-semibold mt-1">{playerName}</p>
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
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const firedRef = useRef(false);

  useEffect(() => {
    if (!visible) { firedRef.current = false; return; }
    if (firedRef.current) return;
    firedRef.current = true;

    // Confetti only for the winner's screen — fire a few bursts, not every frame
    if (isWinnerMe) {
      const bursts = [0, 300, 600, 1000, 1500, 2000];
      const timers = bursts.map(delay =>
        setTimeout(() => {
          confetti({
            particleCount: 100,
            startVelocity: 30,
            spread: 140,
            origin: { x: Math.random(), y: Math.random() * 0.4 },
          });
        }, delay)
      );
      return () => { timers.forEach(clearTimeout); };
    }
  }, [visible, isWinnerMe]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => onDoneRef.current(), 4000);
    return () => clearTimeout(t);
  }, [visible]);

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
