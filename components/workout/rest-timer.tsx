"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { X, Plus, Minus } from "lucide-react"

interface RestTimerProps {
  duration: number
  onChangeDuration: (d: number) => void
  onClose: () => void
}

function playChime() {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime

    // A gentle two-tone chime: C5 then E5
    const notes = [
      { freq: 523.25, start: 0, end: 0.25 },
      { freq: 659.25, start: 0.2, end: 0.5 },
      { freq: 783.99, start: 0.4, end: 0.8 },
    ]

    notes.forEach(({ freq, start, end }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(ctx.destination)

      gain.gain.setValueAtTime(0, now + start)
      gain.gain.linearRampToValueAtTime(0.15, now + start + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, now + end)

      osc.start(now + start)
      osc.stop(now + end + 0.05)
    })
  } catch {
    // AudioContext not available
  }
}

export function RestTimer({ duration, onChangeDuration, onClose }: RestTimerProps) {
  const [remaining, setRemaining] = useState(duration)
  const [finished, setFinished] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasPlayedSound = useRef(false)

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          cleanup()
          setFinished(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return cleanup
  }, [cleanup])

  // Play sound when finished
  useEffect(() => {
    if (finished && !hasPlayedSound.current) {
      hasPlayedSound.current = true
      playChime()
    }
  }, [finished])

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const progress = duration > 0 ? ((duration - remaining) / duration) * 100 : 100
  const circumference = 2 * Math.PI * 90

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="absolute right-4 top-4"
      >
        <X className="h-6 w-6" />
      </Button>

      <p className="mb-2 text-sm font-medium uppercase tracking-widest text-muted-foreground">
        Descanso
      </p>

      {/* Circular progress */}
      <div className="relative mb-8">
        <svg className="h-48 w-48 -rotate-90" viewBox="0 0 200 200">
          <circle
            cx="100"
            cy="100"
            r="90"
            fill="none"
            stroke="currentColor"
            className="text-muted/30"
            strokeWidth="8"
          />
          <circle
            cx="100"
            cy="100"
            r="90"
            fill="none"
            stroke="currentColor"
            className={finished ? "text-accent" : "text-primary"}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={`${circumference * (1 - progress / 100)}`}
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {finished ? (
            <span className="text-lg font-bold text-accent">Listo</span>
          ) : (
            <span className="font-mono text-5xl font-bold text-foreground">
              {minutes}:{seconds.toString().padStart(2, "0")}
            </span>
          )}
        </div>
      </div>

      {/* Adjust duration */}
      {!finished && (
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-full"
            onClick={() => {
              const next = Math.max(30, duration - 30)
              onChangeDuration(next)
            }}
          >
            <Minus className="h-5 w-5" />
          </Button>
          <span className="text-sm text-muted-foreground w-16 text-center">
            {Math.floor(duration / 60)}:
            {(duration % 60).toString().padStart(2, "0")}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-full"
            onClick={() => {
              const next = duration + 30
              onChangeDuration(next)
            }}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      )}

      <Button
        onClick={onClose}
        className={`mt-8 rounded-xl px-12 py-6 text-base font-semibold ${
          finished ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""
        }`}
        size="lg"
      >
        {finished ? "Continuar" : "Saltar Descanso"}
      </Button>
    </div>
  )
}
