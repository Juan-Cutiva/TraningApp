import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { SettingsContent } from "@/components/settings/settings-content";

export const metadata: Metadata = {
  title: "Ajustes",
  description: "Configura tu experiencia de entrenamiento.",
};

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsContent />
    </AppShell>
  );
}
