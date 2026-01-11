import { useEffect, useRef, useState } from "react";
import noQualifyBg from "@/assets/no-qualify-bg.jpg";

interface NoQualifyAnimationProps {
  show: boolean;
  playerName?: string;
  onComplete?: () => void;
}

export const NoQualifyAnimation = ({ show, playerName, onComplete }: NoQualifyAnimationProps) => {
  const [visible, setVisible] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const hasShownRef = useRef(false);

  // Keep ref updated
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const finish = () => {
      setVisible(false);
      onCompleteRef.current?.();
    };

    if (show && !hasShownRef.current) {
      hasShownRef.current = true;

      // Ensure the background image is ready before we show anything
      const img = new Image();
      img.src = noQualifyBg;

      const start = () => {
        if (cancelled) return;
        setVisible(true);
        timer = window.setTimeout(finish, 2000);
      };

      if (img.complete) {
        start();
      } else {
        img.onload = start;
        img.onerror = start;
      }

      return () => {
        cancelled = true;
        if (timer) window.clearTimeout(timer);
      };
    }

    if (!show) {
      hasShownRef.current = false;
      setVisible(false);
    }
  }, [show]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {/* Single unified graphic: background + overlays + text all inside ONE SVG */}
      <svg
        className="absolute inset-0 h-full w-full animate-scale-in"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        aria-label="No qualify"
      >
        <defs>
          <radialGradient id="nq_vignette" cx="50%" cy="50%" r="65%">
            <stop offset="60%" stopColor="transparent" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
          </radialGradient>
        </defs>

        <image href={noQualifyBg} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice" />

        {/* Light destructive tint */}
        <rect x="0" y="0" width="100" height="100" style={{ fill: "hsl(var(--destructive) / 0.18)" }} />

        {/* Vignette */}
        <rect x="0" y="0" width="100" height="100" fill="url(#nq_vignette)" />

        {/* Optional player name */}
        {playerName ? (
          <g>
            <rect x="28" y="26" width="44" height="9" rx="2" style={{ fill: "hsl(var(--background) / 0.7)" }} />
            <text
              x="50"
              y="32"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fill: "hsl(var(--foreground) / 0.9)",
                fontSize: 4.2,
                fontWeight: 800,
                letterSpacing: 0.4,
              }}
            >
              {playerName}
            </text>
          </g>
        ) : null}

        {/* Main badge */}
        <g>
          <rect
            x="18"
            y="40"
            width="64"
            height="20"
            rx="3"
            style={{
              fill: "hsl(var(--background) / 0.78)",
              stroke: "hsl(var(--destructive) / 0.7)",
              strokeWidth: 0.9,
            }}
          />
          <text
            x="50"
            y="50"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fill: "hsl(var(--destructive))",
              fontSize: 8,
              fontWeight: 900,
              letterSpacing: 1.2,
            }}
          >
            NO QRARIFY
          </text>
        </g>
      </svg>
    </div>
  );
};
