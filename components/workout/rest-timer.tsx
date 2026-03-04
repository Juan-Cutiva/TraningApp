"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
      { freq: 523.25, start: 0, end: 0.45 }, // C5
      { freq: 659.25, start: 0.2, end: 0.65 }, // E5
      { freq: 783.99, start: 0.4, end: 0.9 }, // G5
      { freq: 1046.5, start: 0.65, end: 1.3 }, // C6
    ];

    notes.forEach(({ freq, start, end }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);

      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.85, now + start + 0.05);
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
    accentGain.gain.setValueAtTime(0.35, now);
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

  // Compact vertical card — max 280px wide so it never overflows on mobile
  return (
    <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-90 w-[min(90vw,280px)]">
      {/* Floating badge */}
      <div
        className={cn(
          "absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1 text-[10px] font-bold rounded-full shadow-lg whitespace-nowrap",
          finished
            ? "bg-green-500 text-white animate-bounce"
            : paused
              ? "bg-yellow-500 text-white"
              : "bg-primary text-primary-foreground animate-bounce",
        )}
      >
        <Timer className="h-3 w-3" />
        <span>
          {finished ? "¡DESCANSASTE!" : paused ? "EN PAUSA" : "DESCANSO"}
        </span>
      </div>

      {/* Card */}
      <div
        className={cn(
          "rounded-2xl shadow-2xl border-2 animate-in slide-in-from-bottom-4 fade-in overflow-hidden",
          finished
            ? "border-green-500/70 animate-pulse"
            : paused
              ? "border-yellow-500/40"
              : "border-primary/30",
        )}
      >
        {/* Header row: label + close */}
        <div
          className={cn(
            "flex items-center justify-between px-4 pt-4 pb-1",
            finished
              ? "bg-green-500/15"
              : paused
                ? "bg-yellow-500/10"
                : "bg-card",
          )}
        >
          <span
            className={cn(
              "text-[11px] font-bold uppercase tracking-widest",
              finished
                ? "text-green-400"
                : paused
                  ? "text-yellow-500"
                  : "text-muted-foreground",
            )}
          >
            {finished
              ? "¡Listo para el siguiente!"
              : paused
                ? "Pausado"
                : "Tiempo de descanso"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Cerrar temporizador"
            title="Cerrar temporizador"
            className={cn(
              "h-7 w-7 rounded-lg shrink-0",
              finished
                ? "text-green-400 hover:text-green-300"
                : "text-muted-foreground",
            )}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* Big time */}
        <div
          className={cn(
            "flex items-center justify-center py-3",
            finished
              ? "bg-green-500/15"
              : paused
                ? "bg-yellow-500/10"
                : "bg-card",
          )}
        >
          <span
            className={cn(
              "text-5xl font-bold font-mono tabular-nums",
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

        {/* Progress bar */}
        {!finished && (
          <div
            className={cn("px-4 pb-3", paused ? "bg-yellow-500/10" : "bg-card")}
          >
            <Progress
              value={progress}
              className={cn("h-1.5", paused ? "[&>div]:bg-yellow-500" : "")}
            />
          </div>
        )}

        {/* Controls */}
        <div
          className={cn(
            "flex items-center justify-center gap-2 px-4 pb-4",
            finished
              ? "bg-green-500/15"
              : paused
                ? "bg-yellow-500/10"
                : "bg-card",
          )}
        >
          {finished ? (
            <Button
              onClick={onClose}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl h-10"
            >
              ¡Siguiente serie!
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                aria-label="Restar 30 segundos"
                className="flex-1 h-9 text-xs font-semibold rounded-xl"
                onClick={() => onChangeDuration(Math.max(30, duration - 30))}
              >
                <Minus className="h-3 w-3 mr-1" aria-hidden="true" />
                30s
              </Button>

              <Button
                variant="outline"
                size="icon"
                aria-label={
                  paused ? "Reanudar temporizador" : "Pausar temporizador"
                }
                className={cn(
                  "h-9 w-9 rounded-xl shrink-0",
                  paused
                    ? "border-yellow-500/50 text-yellow-500 bg-yellow-500/10"
                    : "",
                )}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? (
                  <Play className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Pause className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                aria-label="Sumar 30 segundos"
                className="flex-1 h-9 text-xs font-semibold rounded-xl"
                onClick={() => onChangeDuration(duration + 30)}
              >
                <Plus className="h-3 w-3 mr-1" aria-hidden="true" />
                30s
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
