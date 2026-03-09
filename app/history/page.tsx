import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { HistoryContent } from "@/components/history/history-content";

export const metadata: Metadata = {
  title: "Historial",
  description: "Revisa todos tus entrenamientos completados y tu progreso.",
};

export default function HistoryPage() {
  return (
    <AppShell>
      <HistoryContent />
    </AppShell>
  );
}
