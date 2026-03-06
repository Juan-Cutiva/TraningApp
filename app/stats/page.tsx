import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { StatsContent } from "@/components/dashboard/stats-content";

export const metadata: Metadata = {
  title: "Estadísticas",
  description: "Analiza tu rendimiento y evolución en el gimnasio.",
};

export default function StatsPage() {
  return (
    <AppShell>
      <StatsContent />
    </AppShell>
  );
}
