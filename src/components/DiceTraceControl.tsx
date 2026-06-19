import React, { useState, useCallback } from "react";
import { Circle, Square, ClipboardCopy, AlertTriangle, Target } from "lucide-react";
import { toast } from "sonner";
import {
  startDicePresentationTrace,
  stopDicePresentationTrace,
  isDicePresentationTraceRecording,
  getDicePresentationTraceJSON,
  getDicePresentationTraceBuffer,
  getSwapEvents,
} from "@/lib/dicePresentationTrace";
import { useHideDebugUI } from "@/lib/debugUIVisibility";
import { useDebugPillEnabled } from "@/lib/debugTray/debugPillsStore";

const DEBUG_BUILD_STAMP = "2026-04-06T-trace-ui";
const LS_KEY = "ptp_debug_yahtzee_straight";

function isStraightBotOn(): boolean {
  try { return window.localStorage.getItem(LS_KEY) === "1"; } catch { return false; }
}

export function DiceTraceControl() {

  const [recording, setRecording] = useState(isDicePresentationTraceRecording());
  const [swapCount, setSwapCount] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [straightBot, setStraightBot] = useState(isStraightBotOn);

  const handleToggle = useCallback(() => {
    if (recording) {
      stopDicePresentationTrace();
      setRecording(false);
      const buf = getDicePresentationTraceBuffer();
      const swaps = getSwapEvents();
      setFrameCount(buf.length);
      setSwapCount(swaps.length);
      if (swaps.length > 0) {
        toast.error(`${swaps.length} swap(s) detected in ${buf.length} frames`);
      } else {
        toast.success(`Clean: ${buf.length} frames, 0 swaps`);
      }
    } else {
      startDicePresentationTrace();
      setRecording(true);
      setSwapCount(0);
      setFrameCount(0);
    }
  }, [recording]);

  const handleStraightToggle = useCallback(() => {
    const next = !straightBot;
    try { window.localStorage.setItem(LS_KEY, next ? "1" : "0"); } catch {}
    setStraightBot(next);
    toast.info(next ? "Straight-bot ON — bot will pursue large straight" : "Straight-bot OFF — normal bot logic");
  }, [straightBot]);

  const handleCopy = useCallback(async () => {
    const json = getDicePresentationTraceJSON();
    try {
      await navigator.clipboard.writeText(json);
      toast.success("Trace JSON copied to clipboard");
    } catch {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dice-trace.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Trace downloaded as dice-trace.json");
    }
  }, []);

  const hidden = useHideDebugUI();
  const pillEnabled = useDebugPillEnabled('diceTrace');
  if (hidden || !pillEnabled) return null;

  return (
    <div className="absolute top-1 left-1 z-[9999] flex items-center gap-1 flex-wrap">
      {/* Build badge */}
      <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg opacity-90">
        {DEBUG_BUILD_STAMP}
      </span>

      {/* Straight-bot toggle */}
      <button
        onClick={handleStraightToggle}
        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold shadow-lg ${
          straightBot
            ? "bg-purple-600 text-white"
            : "bg-gray-800 text-gray-400 hover:bg-gray-700"
        }`}
      >
        <Target className="h-3 w-3" /> {straightBot ? "STR ON" : "STR"}
      </button>

      {/* Record / Stop */}
      <button
        onClick={handleToggle}
        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold shadow-lg ${
          recording
            ? "bg-red-500 text-white animate-pulse"
            : "bg-gray-800 text-gray-200 hover:bg-gray-700"
        }`}
      >
        {recording ? (
          <>
            <Square className="h-3 w-3 fill-current" /> STOP
          </>
        ) : (
          <>
            <Circle className="h-3 w-3 fill-current" /> REC
          </>
        )}
      </button>

      {/* Copy trace (only after stop) */}
      {!recording && frameCount > 0 && (
        <>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-700 text-white shadow-lg hover:bg-blue-600"
          >
            <ClipboardCopy className="h-3 w-3" /> {frameCount}f
          </button>
          {swapCount > 0 && (
            <span className="flex items-center gap-0.5 bg-yellow-500 text-black text-[10px] font-bold px-2 py-0.5 rounded shadow-lg">
              <AlertTriangle className="h-3 w-3" /> {swapCount} ISSUE{swapCount > 1 ? "S" : ""}
            </span>
          )}
        </>
      )}
    </div>
  );
}
