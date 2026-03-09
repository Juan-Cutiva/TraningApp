"use client";

import { useState } from "react";
import { Dumbbell, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { login } from "@/lib/auth";

interface LoginFormProps {
  onSuccess: () => void;
  onSubscriptionInactive?: () => void;
}

export function LoginForm({ onSuccess, onSubscriptionInactive }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result === "ok") {
        onSuccess();
      } else if (result === "subscription_inactive") {
        if (onSubscriptionInactive) {
          onSubscriptionInactive();
        } else {
          setError("Tu suscripción está inactiva. Contacta al administrador para reactivarla.");
        }
      } else if (result === "server_error") {
        setError("No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.");
      } else {
        setError("Correo o contraseña incorrectos.");
      }
    } catch {
      setError("Error al iniciar sesión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      {/* Logo / branding */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
          <Dumbbell className="h-8 w-8 text-primary" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight font-space-grotesk">
            Cuti Traning
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tu entrenador personal privado
          </p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm rounded-2xl border bg-card shadow-xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Iniciar sesión</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Acceso exclusivo para el titular de la cuenta.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium">
              Correo electrónico
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="pl-9"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-medium">
              Contraseña
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pl-9 pr-10"
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p
              role="alert"
              className={cn(
                "text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 border border-destructive/20",
              )}
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full font-semibold"
            disabled={loading}
          >
            {loading ? "Verificando..." : "Entrar"}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-xs text-muted-foreground text-center">
        Aplicación de uso exclusivo y privado.
      </p>
    </div>
  );
}
