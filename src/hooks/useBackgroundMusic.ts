import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";

export function useBackgroundMusic() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const isUnlockedRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  // Unlock audio context on iOS by playing silent audio immediately on user gesture
  const unlockAudio = useCallback(() => {
    if (isUnlockedRef.current) return;
    
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
      audioRef.current.volume = 0.3;
    }
    
    // Create a short silent audio to "unlock" the audio context
    // This must happen synchronously in the click handler
    audioRef.current.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    audioRef.current.play().then(() => {
      audioRef.current?.pause();
      isUnlockedRef.current = true;
      console.log("Audio context unlocked for iOS");
    }).catch((e) => {
      console.log("Audio unlock failed (expected on some browsers):", e.message);
    });
  }, []);

  const generateAndPlay = useCallback(async () => {
    // Immediately unlock audio on the user gesture
    unlockAudio();
    
    setIsLoading(true);
    
    try {
      // Use AbortController for timeout - music generation can take a while
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-music`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ duration: 30 }), // 30 seconds generates faster
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed: ${response.status}`);
      }

      const audioBlob = await response.blob();
      
      // Validate we got actual audio data
      if (audioBlob.size < 1000) {
        console.error("Received blob too small:", audioBlob.size, "type:", audioBlob.type);
        throw new Error("Invalid audio response - try again");
      }
      
      console.log("Received audio blob:", audioBlob.size, "bytes, type:", audioBlob.type);
      
      // Revoke old URL if exists
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      
      audioUrlRef.current = URL.createObjectURL(audioBlob);
      
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.loop = true;
        audioRef.current.volume = 0.3;
      }
      
      audioRef.current.src = audioUrlRef.current;
      
      // Add error handler for audio element
      audioRef.current.onerror = (e) => {
        console.error("Audio element error:", e, audioRef.current?.error);
        toast.error("Audio playback failed - try again");
        setIsPlaying(false);
        setIsLoading(false);
      };
      
      await audioRef.current.play();
      
      setIsPlaying(true);
      setHasGenerated(true);
      toast.success("🎵 Music started");
    } catch (error) {
      console.error("Failed to generate music:", error);
      if (error instanceof Error && error.name === 'AbortError') {
        toast.error("Music generation timed out. Please try again.");
      } else {
        const message = error instanceof Error ? error.message : "Failed to generate music";
        // Handle iOS-specific permission error
        if (message.includes("not allowed") || message.includes("denied permission")) {
          toast.error("Tap again to enable audio playback");
        } else {
          toast.error(message === "Load failed" ? "Audio failed to load - try again" : message);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [unlockAudio]);

  const togglePlay = useCallback(async () => {
    if (!hasGenerated) {
      await generateAndPlay();
      return;
    }

    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        try {
          await audioRef.current.play();
          setIsPlaying(true);
        } catch (e) {
          console.error("Resume play failed:", e);
          toast.error("Tap again to resume audio");
        }
      }
    }
  }, [hasGenerated, isPlaying, generateAndPlay]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  }, []);

  return {
    isPlaying,
    isLoading,
    togglePlay,
    stop,
    hasGenerated,
  };
}
