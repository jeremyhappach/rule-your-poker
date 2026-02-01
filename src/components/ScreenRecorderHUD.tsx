import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Square, Video } from "lucide-react";
import { toast } from "sonner";

function pickBestMimeType(): string | undefined {
  // Prefer widely-supported WebM options.
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];

  // MediaRecorder.isTypeSupported is not available in all browsers.
  const isSupported = (mimeType: string) => {
    try {
      return typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(mimeType);
    } catch {
      return false;
    }
  };

  return candidates.find(isSupported);
}

export function ScreenRecorderHUD({ enabled = true }: { enabled?: boolean }) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const cleanup = useCallback(() => {
    recorderRef.current = null;
    const s = streamRef.current;
    streamRef.current = null;
    try {
      s?.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
  }, []);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    if (!r) {
      cleanup();
      setRecording(false);
      return;
    }

    try {
      if (r.state !== "inactive") r.stop();
    } catch {
      cleanup();
      setRecording(false);
    }
  }, [cleanup]);

  const start = useCallback(async () => {
    if (recording) return;

    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Screen recording isn\"t supported in this browser");
      return;
    }

    chunksRef.current = [];

    try {
      toast.message("Select what to share, then hit Start/Share");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;

      // If the user stops sharing from the browser UI, stop recording too.
      const videoTrack = stream.getVideoTracks?.()[0];
      videoTrack?.addEventListener?.("ended", () => stop());

      const mimeType = pickBestMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        try {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "video/webm",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `screen-recording-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          toast.success("Recording saved (downloaded)");
        } catch (e) {
          console.error("[ScreenRecorderHUD] Failed to save recording", e);
          toast.error("Failed to save recording");
        } finally {
          chunksRef.current = [];
          cleanup();
          setRecording(false);
        }
      };

      recorder.start(250);
      setRecording(true);
    } catch (e) {
      console.error("[ScreenRecorderHUD] Failed to start recording", e);
      cleanup();
      setRecording(false);
      toast.error("Recording canceled / blocked");
    }
  }, [cleanup, recording, stop]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  if (!enabled) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2" style={{ pointerEvents: "auto" }}>
      {!recording ? (
        <Button type="button" size="sm" variant="secondary" onClick={start}>
          <Video className="mr-2 h-4 w-4" />
          Record
        </Button>
      ) : (
        <Button type="button" size="sm" variant="destructive" onClick={stop} className="animate-pulse">
          <Square className="mr-2 h-4 w-4" />
          Stop
        </Button>
      )}
    </div>
  );
}
