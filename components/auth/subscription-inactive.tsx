"use client";

import { AlertCircle, Dumbbell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/auth";

interface SubscriptionInactiveProps {
  onLogout: () => void;
  reason?: "inactive" | "grace_expired";
}

export function SubscriptionInactive({
  onLogout,
  reason = "inactive",
}: SubscriptionInactiveProps) {
  function handleLogout() {
    logout();
    onLogout();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
          <Dumbbell className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight font-space-grotesk">
          Cuti Traning
        </h1>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm rounded-2xl border border-destructive/30 bg-card shadow-xl p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-destructive">
              Suscripción inactiva
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {reason === "grace_expired"
                ? "Tu acceso temporal ha expirado. Para continuar usando la app es necesario renovar tu suscripción."
                : "Tu suscripción está inactiva. Para continuar usando la app es necesario realizar el pago correspondiente."}
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-muted/50 p-4 space-y-1.5">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
            ¿Qué necesitas hacer?
          </p>
          <p className="text-sm text-muted-foreground">
            Contacta al administrador para reactivar tu acceso y continuar con
            tu entrenamiento.
          </p>
        </div>

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </Button>
      </div>

      <p className="mt-6 text-xs text-muted-foreground text-center">
        Aplicación de uso exclusivo y privado.
      </p>
    </div>
  );
}
