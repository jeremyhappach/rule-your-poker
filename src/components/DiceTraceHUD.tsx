import React, { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Circle, Square, Copy, Check } from "lucide-react";

export interface DiceTraceEvent {
  ts: number;
  seq: number;
  source: string;
  rollKey?: number | string;
  isRolling?: boolean;
  isComplete?: boolean;
  rollsRemaining?: number;
  heldCount?: number;
  dbHeldCount?: number;
  preRollSig?: string;
  dbSig?: string;
  shouldUseDb?: boolean;
  isAnimatingFlyIn?: boolean;
  showUnheldDice?: boolean;
  lastFlyInRollKey?: number | string;
  cacheKey?: string;
  playerId?: string;
  extra?: Record<string, unknown>;
}

interface DiceTraceHUDProps {
  enabled?: boolean;
}

// Global ring buffer and controls so any component can push events
const MAX_EVENTS = 500;
let globalBuffer: DiceTraceEvent[] = [];
let globalSeq = 0;
let isRecording = false;

export function pushDiceTrace(
  source: string,
  data: Omit<DiceTraceEvent, "ts" | "seq" | "source">
) {
  if (!isRecording) return;
  const event: DiceTraceEvent = {
    ts: Date.now(),
    seq: ++globalSeq,
    source,
    ...data,
  };
  globalBuffer.push(event);
  if (globalBuffer.length > MAX_EVENTS) {
    globalBuffer = globalBuffer.slice(-MAX_EVENTS);
  }
}

export function isDiceTraceRecording() {
  return isRecording;
}

export const DiceTraceHUD: React.FC<DiceTraceHUDProps> = ({ enabled = true }) => {
  const [recording, setRecording] = useState(false);
  const [copied, setCopied] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const intervalRef = useRef<number | null>(null);

  // Poll event count for display
  useEffect(() => {
    if (recording) {
      intervalRef.current = window.setInterval(() => {
        setEventCount(globalBuffer.length);
      }, 200);
    } else if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [recording]);

  const handleRecord = useCallback(() => {
    globalBuffer = [];
    globalSeq = 0;
    isRecording = true;
    setRecording(true);
    setEventCount(0);
    setCopied(false);
  }, []);

  const handleStop = useCallback(() => {
    isRecording = false;
    setRecording(false);
    setEventCount(globalBuffer.length);
  }, []);

  const handleCopy = useCallback(async () => {
    const json = JSON.stringify(globalBuffer, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy dice trace:", e);
    }
  }, []);

  if (!enabled) return null;

  return (
    <div
      className="fixed bottom-2 left-2 z-[9999] flex items-center gap-1 rounded bg-black/80 px-2 py-1 text-xs text-white shadow-lg"
      style={{ pointerEvents: "auto" }}
    >
      <span className="mr-1 font-mono opacity-70">Dice</span>
      {!recording ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-red-400 hover:bg-red-900/40"
          onClick={handleRecord}
          title="Start recording"
        >
          <Circle className="h-3 w-3 fill-current" />
        </Button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-yellow-400 hover:bg-yellow-900/40 animate-pulse"
          onClick={handleStop}
          title="Stop recording"
        >
          <Square className="h-3 w-3 fill-current" />
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0 text-blue-300 hover:bg-blue-900/40"
        onClick={handleCopy}
        disabled={globalBuffer.length === 0}
        title="Copy JSON"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </Button>
      <span className="ml-1 font-mono text-[10px] opacity-60">
        {eventCount}
      </span>
    </div>
  );
};

export default DiceTraceHUD;
