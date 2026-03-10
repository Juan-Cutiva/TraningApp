"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { X, Plus, Minus, Timer, Pause, Play, Minimize2 } from "lucide-react";
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

    if ("vibrate" in navigator) {
      navigator.vibrate([150, 80, 150, 80, 400]);
    }

    const notes = [
      { freq: 523.25, start: 0, end: 0.45 },
      { freq: 659.25, start: 0.2, end: 0.65 },
      { freq: 783.99, start: 0.4, end: 0.9 },
      { freq: 1046.5, start: 0.65, end: 1.3 },
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

export function RestTimer({ duration, onChangeDuration, onClose }: RestTimerProps) {
  const [remaining, setRemaining] = useState(duration);
  const [finished, setFinished] = useState(false);
  const [paused, setPaused] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasPlayedSound = useRef(false);
  const prevDurationRef = useRef(duration);
  const pausedRef = useRef(false);
  const skipDeltaRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const drag = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  // Set initial position client-side only
  useEffect(() => {
    const w = Math.min(window.innerWidth * 0.9, 280);
    setPos({
      x: Math.max(8, (window.innerWidth - w) / 2),
      y: Math.max(8, window.innerHeight - 340),
    });
  }, []);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (pausedRef.current) return;
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

  useEffect(() => {
    const delta = duration - prevDurationRef.current;
    prevDurationRef.current = duration;
    if (skipDeltaRef.current) {
      skipDeltaRef.current = false;
      return;
    }
    if (delta !== 0 && !finished) {
      setRemaining((prev) => Math.max(0, prev + delta));
    }
  }, [duration, finished]);

  useEffect(() => {
    if (finished && !hasPlayedSound.current) {
      hasPlayedSound.current = true;
      playChime();
    }
  }, [finished]);

  function handlePresetClick(presetSeconds: number) {
    skipDeltaRef.current = true;
    prevDurationRef.current = presetSeconds;
    setRemaining(presetSeconds);
    setFinished(false);
    hasPlayedSound.current = false;
    setPaused(false);
    pausedRef.current = false;
    onChangeDuration(presetSeconds);
  }

  // ── Drag handlers ──────────────────────────────────────────────────────
  const handleDragStart = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        origX: pos?.x ?? 0,
        origY: pos?.y ?? 0,
        moved: false,
      };
    },
    [pos],
  );

  const handleDragMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!drag.current?.active) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.current.moved = true;
    if (!drag.current.moved) return;
    const el = containerRef.current;
    const w = el?.offsetWidth ?? 280;
    const h = el?.offsetHeight ?? 60;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - w, drag.current.origX + dx)),
      y: Math.max(0, Math.min(window.innerHeight - h, drag.current.origY + dy)),
    });
  }, []);

  // Returns true if gesture was a drag (not a tap)
  const handleDragEnd = useCallback((): boolean => {
    const moved = drag.current?.moved ?? false;
    drag.current = null;
    return moved;
  }, []);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress =
    duration > 0 ? Math.min(100, Math.max(0, ((duration - remaining) / duration) * 100)) : 100;

  // SSR guard
  if (!pos) return null;

  // ── Minimized pill ─────────────────────────────────────────────────────
  if (minimized) {
    return (
      <div
        ref={containerRef}
        style={{
          position: "fixed",
          left: pos.x,
          top: pos.y,
          zIndex: 90,
          touchAction: "none",
          userSelect: "none",
        }}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={(e) => {
          const wasDrag = handleDragEnd();
          if (!wasDrag) setMinimized(false);
        }}
        className="cursor-grab active:cursor-grabbing"
      >
        <div
          className={cn(
            "flex items-center gap-2 pl-3 pr-3 py-2.5 rounded-2xl shadow-2xl border-2 font-mono font-bold select-none",
            finished
              ? "bg-green-500 border-green-400 text-white"
              : paused
                ? "bg-card border-yellow-500/60 text-yellow-500"
                : "bg-primary border-primary/60 text-primary-foreground",
          )}
        >
          <Timer
            className={cn(
              "h-4 w-4 shrink-0",
              !finished && !paused && "animate-pulse",
            )}
          />
          <span className="text-sm tabular-nums">
            {minutes}:{seconds.toString().padStart(2, "0")}
          </span>
          {finished && (
            <span className="text-[10px] ml-0.5">✓</span>
          )}
        </div>
      </div>
    );
  }

  // ── Full timer ─────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 90,
        width: "min(90vw, 280px)",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      {/* Badge — drag handle */}
      <div
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        className={cn(
          "absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1 text-[10px] font-bold rounded-full shadow-lg whitespace-nowrap z-[100] cursor-grab active:cursor-grabbing select-none",
          finished
            ? "bg-green-500 text-white animate-bounce"
            : paused
              ? "bg-yellow-500 text-yellow-950"
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
        {/* Header — drag handle (buttons stop propagation) */}
        <div
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          className={cn(
            "flex items-center justify-between px-4 pt-4 pb-1 cursor-grab active:cursor-grabbing",
            finished
              ? "bg-green-500/15"
              : paused
                ? "bg-yellow-500/10"
                : "bg-card",
          )}
        >
          <span
            className={cn(
              "text-[11px] font-bold uppercase tracking-widest pointer-events-none",
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
          {/* Buttons — stop drag from starting when tapping them */}
          <div
            className="flex items-center gap-0.5"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMinimized(true)}
              aria-label="Minimizar temporizador"
              title="Minimizar"
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
            >
              <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
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
        </div>

        {/* Big time display */}
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
            className={cn(
              "px-4 pb-3",
              paused ? "bg-yellow-500/10" : "bg-card",
            )}
          >
            <Progress
              value={progress}
              className={cn("h-1.5", paused ? "[&>div]:bg-yellow-500" : "")}
            />
          </div>
        )}

        {/* Preset buttons */}
        {!finished && (
          <div
            className={cn(
              "flex items-center justify-center gap-1 px-4 pb-2",
              paused ? "bg-yellow-500/10" : "bg-card",
            )}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {[
              { label: "1m", secs: 60 },
              { label: "1:30", secs: 90 },
              { label: "2m", secs: 120 },
              { label: "3m", secs: 180 },
              { label: "5m", secs: 300 },
            ].map(({ label, secs }) => (
              <Button
                key={secs}
                type="button"
                variant={duration === secs ? "default" : "ghost"}
                size="sm"
                aria-label={`Establecer descanso a ${label}`}
                className="flex-1 h-7 text-[10px] font-semibold rounded-lg px-0"
                onClick={() => handlePresetClick(secs)}
              >
                {label}
              </Button>
            ))}
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
          onPointerDown={(e) => e.stopPropagation()}
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
                aria-label={paused ? "Reanudar temporizador" : "Pausar temporizador"}
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

      {/* Accessibility live region */}
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {finished
          ? "Descanso terminado. ¡Listo para el siguiente ejercicio!"
          : paused
            ? "Temporizador en pausa"
            : `${minutes}:${seconds.toString().padStart(2, "0")} restantes`}
      </div>
    </div>
  );
}
