import { Music, Pause, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useBackgroundMusic } from "@/hooks/useBackgroundMusic";

interface MusicToggleButtonProps {
  className?: string;
  variant?: "default" | "compact";
}

export function MusicToggleButton({ className, variant = "default" }: MusicToggleButtonProps) {
  const { isPlaying, isLoading, togglePlay } = useBackgroundMusic();

  if (variant === "compact") {
    return (
      <button
        onClick={togglePlay}
        disabled={isLoading}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-full transition-all",
          "bg-primary/20 hover:bg-primary/30 border border-primary/40",
          isPlaying && "bg-primary/40 animate-pulse",
          isLoading && "opacity-50 cursor-wait",
          className
        )}
        title={isLoading ? "Generating music..." : isPlaying ? "Pause music" : "Play music"}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4 text-primary" />
        ) : (
          <Music className="w-4 h-4 text-primary" />
        )}
      </button>
    );
  }

  return (
    <Button
      onClick={togglePlay}
      disabled={isLoading}
      variant="outline"
      size="sm"
      className={cn(
        "gap-2 transition-all",
        isPlaying && "bg-primary/20 border-primary",
        className
      )}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Generating...</span>
        </>
      ) : isPlaying ? (
        <>
          <Pause className="w-4 h-4" />
          <span className="text-xs">Pause</span>
        </>
      ) : (
        <>
          <Music className="w-4 h-4" />
          <span className="text-xs">Music</span>
        </>
      )}
    </Button>
  );
}
