import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";

// Static music tracks stored in public/music/
// Add your pre-generated tracks here after uploading them
const MUSIC_TRACKS = [
  "/music/bluegrass-1.mp3",
  "/music/bluegrass-2.mp3",
  "/music/bluegrass-3.mp3",
  "/music/bluegrass-4.mp3",
  "/music/bluegrass-5.mp3",
];

// Shuffle array using Fisher-Yates algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function useBackgroundMusic() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playlistRef = useRef<string[]>([]);

  // Initialize shuffled playlist on mount
  useEffect(() => {
    playlistRef.current = shuffleArray(MUSIC_TRACKS);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Handle track end - play next track in shuffled playlist
  const handleTrackEnd = useCallback(() => {
    const nextIndex = (currentTrackIndex + 1) % playlistRef.current.length;
    
    // Re-shuffle when we've played through all tracks
    if (nextIndex === 0) {
      playlistRef.current = shuffleArray(MUSIC_TRACKS);
    }
    
    setCurrentTrackIndex(nextIndex);
    
    if (audioRef.current) {
      audioRef.current.src = playlistRef.current[nextIndex];
      audioRef.current.play().catch(console.error);
    }
  }, [currentTrackIndex]);

  const startPlayback = useCallback(async () => {
    setIsLoading(true);
    
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.volume = 0.3;
        audioRef.current.addEventListener("ended", handleTrackEnd);
      }
      
      // Start with first track in shuffled playlist
      const track = playlistRef.current[currentTrackIndex] || MUSIC_TRACKS[0];
      audioRef.current.src = track;
      
      // Add error handler
      audioRef.current.onerror = () => {
        console.error("Failed to load track:", track);
        toast.error("Music file not found. Please add tracks to public/music/");
        setIsPlaying(false);
        setIsLoading(false);
      };
      
      await audioRef.current.play();
      setIsPlaying(true);
      toast.success("🎵 Music started");
    } catch (error) {
      console.error("Failed to play music:", error);
      const message = error instanceof Error ? error.message : "Failed to play music";
      if (message.includes("not allowed") || message.includes("denied permission")) {
        toast.error("Tap again to enable audio playback");
      } else {
        toast.error("Add music files to public/music/ folder");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentTrackIndex, handleTrackEnd]);

  const togglePlay = useCallback(async () => {
    if (!audioRef.current?.src || audioRef.current.src === window.location.href) {
      await startPlayback();
      return;
    }

    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current?.play();
        setIsPlaying(true);
      } catch (e) {
        console.error("Resume play failed:", e);
        toast.error("Tap again to resume audio");
      }
    }
  }, [isPlaying, startPlayback]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  }, []);

  // Check if any tracks are configured
  const hasMusic = MUSIC_TRACKS.length > 0;

  return {
    isPlaying,
    isLoading,
    togglePlay,
    stop,
    hasMusic,
  };
}
