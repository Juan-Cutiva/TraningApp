"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Plus, Minus, Timer, Pause, Play } from "lucide-react";
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

    // Vibrate device if supported
    if ("vibrate" in navigator) {
      navigator.vibrate([150, 80, 150, 80, 400]);
    }

    // Ascending chord — four notes, higher gain for audibility
    const notes = [
      { freq: 523.25, start: 0,    end: 0.45 }, // C5
      { freq: 659.25, start: 0.2,  end: 0.65 }, // E5
      { freq: 783.99, start: 0.4,  end: 0.9  }, // G5
      { freq: 1046.5, start: 0.65, end: 1.3  }, // C6
    ];

    notes.forEach(({ freq, start, end }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);

      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.45, now + start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + end);

      osc.start(now + start);
      osc.stop(now + end + 0.05);
    });

    // Short percussive accent at start for extra punch
    const accent = ctx.createOscillator();
    const accentGain = ctx.createGain();
    accent.type = "square";
    accent.frequency.value = 880;
    accent.connect(accentGain);
    accentGain.connect(ctx.destination);
    accentGain.gain.setValueAtTime(0.15, now);
    accentGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    accent.start(now);
    accent.stop(now + 0.15);
  } catch {
    // AudioContext no disponible
  }
}

export function RestTimer({
  duration,
  onChangeDuration,
  onClose,
}: RestTimerProps) {
  const [remaining, setRemaining] = useState(duration);
  const [finished, setFinished] = useState(false);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasPlayedSound = useRef(false);
  const prevDurationRef = useRef(duration);
  // Ref para que el interval acceda a paused sin stale closure
  const pausedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Mantener ref sincronizado con state
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Interval principal — ignora ticks cuando está pausado
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (pausedRef.current) return; // pausado: no contar
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

  // Sincronizar remaining cuando el usuario ajusta duration con +/-
  useEffect(() => {
    const delta = duration - prevDurationRef.current;
    prevDurationRef.current = duration;
    if (delta !== 0 && !finished) {
      setRemaining((prev) => Math.max(0, prev + delta));
    }
  }, [duration, finished]);

  // Sonido al terminar
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
    <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[60]">
      {/* Main Timer Card */}
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl px-5 py-3.5 shadow-2xl border-2 animate-in slide-in-from-bottom-4 fade-in",
          finished
            ? "bg-gradient-to-r from-green-500/25 to-emerald-500/25 border-green-500/70 animate-pulse"
            : paused
              ? "bg-gradient-to-r from-card to-card border-yellow-500/40"
              : "bg-gradient-to-r from-card to-card border-primary/30",
        )}
      >
        {/* Timer Icon */}
        <div
          className={cn(
            "flex items-center justify-center w-12 h-12 rounded-xl shrink-0",
            finished
              ? "bg-green-500/30 text-green-400"
              : paused
                ? "bg-yellow-500/20 text-yellow-500"
                : "bg-primary/15 text-primary",
          )}
        >
          {finished ? (
            <span className="text-2xl">✓</span>
          ) : paused ? (
            <Pause className="h-6 w-6" />
          ) : (
            <Timer className="h-6 w-6" />
          )}
        </div>

        {/* Time Display */}
        <div className="flex flex-col min-w-[70px]">
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-widest",
              finished
                ? "text-green-400"
                : paused
                  ? "text-yellow-500"
                  : "text-muted-foreground",
            )}
          >
            {finished ? "¡Listo!" : paused ? "Pausado" : "Descanso"}
          </span>
          <span
            className={cn(
              "text-2xl font-bold font-mono leading-none",
              finished
                ? "text-green-400"
                : paused
                  ? "text-yellow-500"
                  : "text-foreground",
            )}
          >
            {minutes}:{seconds.toString().padStart(2, "0")}
          </span>
        </div>

        {/* Progress Bar */}
        {!finished && (
          <div className="w-20 h-2 bg-secondary rounded-full overflow-hidden shrink-0">
            <div
              className={cn(
                "h-full transition-all duration-1000 ease-linear rounded-full",
                paused ? "bg-yellow-500" : "bg-primary",
              )}
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

            {/* Pausa / Reanudar */}
            <Button
              variant="outline"
              size="icon"
              className={cn(
                "h-9 w-9 rounded-lg",
                paused
                  ? "border-yellow-500/50 text-yellow-500"
                  : "border-border",
              )}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? (
                <Play className="h-4 w-4" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
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

      {/* Floating Indicator */}
      <div
        className={cn(
          "absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full shadow-lg",
          finished
            ? "bg-green-500 text-white animate-bounce"
            : paused
              ? "bg-yellow-500 text-white"
              : "bg-primary text-primary-foreground animate-bounce",
        )}
      >
        <Timer className="h-3.5 w-3.5" />
        <span>{finished ? "¡DESCANSASTE!" : paused ? "EN PAUSA" : "DESCANSO"}</span>
      </div>
    </div>
  );
}
