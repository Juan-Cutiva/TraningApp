import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { RoutinesContent } from "@/components/routines/routines-content";

export const metadata: Metadata = {
  title: "Rutinas",
  description: "Crea y gestiona tus rutinas de entrenamiento semanales.",
};

export default function RoutinesPage() {
  return (
    <AppShell>
      <RoutinesContent />
    </AppShell>
  );
}
