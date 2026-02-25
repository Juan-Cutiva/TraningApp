"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Plus, Minus, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

interface RestTimerProps {
  duration: number;
  onChangeDuration: (d: number) => void;
  onClose: () => void;
}

function playChime() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // A gentle two-tone chime: C5 then E5
    const notes = [
      { freq: 523.25, start: 0, end: 0.25 },
      { freq: 659.25, start: 0.2, end: 0.5 },
      { freq: 783.99, start: 0.4, end: 0.8 },
    ];

    notes.forEach(({ freq, start, end }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);

      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.15, now + start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + end);

      osc.start(now + start);
      osc.stop(now + end + 0.05);
    });
  } catch {
    // AudioContext not available
  }
}

export function RestTimer({
  duration,
  onChangeDuration,
  onClose,
}: RestTimerProps) {
  const [remaining, setRemaining] = useState(duration);
  const [finished, setFinished] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasPlayedSound = useRef(false);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          cleanup();
          setFinished(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return cleanup;
  }, [cleanup]);

  // Play sound when finished
  useEffect(() => {
    if (finished && !hasPlayedSound.current) {
      hasPlayedSound.current = true;
      playChime();
    }
  }, [finished]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress =
    duration > 0 ? ((duration - remaining) / duration) * 100 : 100;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60]">
      {/* Main Timer Card */}
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl px-5 py-3.5 shadow-2xl border-2 animate-in slide-in-from-bottom-4 fade-in",
          finished
            ? "bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-500/50"
            : "bg-gradient-to-r from-card to-card border-primary/30",
        )}
      >
        {/* Timer Icon with Glow */}
        <div
          className={cn(
            "flex items-center justify-center w-12 h-12 rounded-xl shrink-0",
            finished
              ? "bg-green-500/20 text-green-500 animate-pulse"
              : "bg-primary/15 text-primary",
          )}
        >
          {finished ? (
            <span className="text-xl">✓</span>
          ) : (
            <Timer className="h-6 w-6" />
          )}
        </div>

        {/* Time Display */}
        <div className="flex flex-col min-w-[70px]">
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-widest",
              finished ? "text-green-500" : "text-muted-foreground",
            )}
          >
            {finished ? "Listo!" : "Descanso"}
          </span>
          <span
            className={cn(
              "text-2xl font-bold font-mono leading-none",
              finished ? "text-green-500" : "text-foreground",
            )}
          >
            {minutes}:{seconds.toString().padStart(2, "0")}
          </span>
        </div>

        {/* Progress Bar */}
        {!finished && (
          <div className="w-20 h-2 bg-secondary rounded-full overflow-hidden shrink-0">
            <div
              className="h-full bg-primary transition-all duration-1000 ease-linear rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Controls */}
        {!finished && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-lg border-border"
              onClick={() => {
                const next = Math.max(30, duration - 30);
                onChangeDuration(next);
              }}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-lg border-border"
              onClick={() => {
                const next = duration + 30;
                onChangeDuration(next);
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Close Button */}
        <Button
          variant={finished ? "default" : "ghost"}
          size="icon"
          onClick={onClose}
          className={cn(
            "h-10 w-10 rounded-lg shrink-0",
            finished
              ? "bg-green-500 hover:bg-green-600 text-white"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {finished ? (
            <span className="font-semibold text-sm">OK</span>
          ) : (
            <X className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Floating Indicator - Always visible at top */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-full shadow-lg animate-bounce">
        <Timer className="h-3.5 w-3.5" />
        <span>DESCANSO</span>
      </div>
    </div>
  );
}
